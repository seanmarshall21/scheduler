-- ============================================================================
-- Commons — Family Hub :: initial schema (Brief 01)
-- Run via `supabase db push` or paste into the Supabase SQL editor.
--
-- AUTH MODEL (hybrid):
--   * A household is the unit of sharing. Everything is scoped to a household.
--   * `members` are the people on the board (name, color, optional PIN). They
--     are NOT necessarily auth users — the kitchen kiosk runs as ONE shared
--     authenticated session and switches the "active member" client-side.
--   * On phones, a person signs in (Supabase Auth) and their auth user is
--     linked to a member via `members.user_id`. The kiosk's shared login is
--     also just an auth user that belongs to the household.
--
-- RLS STRATEGY:
--   * Helper `household_ids()` returns the household(s) the current auth user
--     belongs to (via any member row they own, OR the household they created).
--   * Read/write is allowed to any authenticated user who shares the household.
--     Inside a trusted household this "anyone in the house can edit" model is
--     intentional (matches a shared kitchen board). PINs gate sensitive edits
--     in the UI layer, not in RLS.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Households ─────────────────────────────────────────────────────────────
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our Home',
  created_by  uuid references auth.users(id) on delete set null,
  -- kiosk_token lets the wall display boot straight into this household
  -- without a per-person login (paired once in Settings).
  kiosk_token uuid not null default gen_random_uuid(),
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Members (the people on the board) ──────────────────────────────────────
create table public.members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null, -- set when they log in on a phone
  name         text not null,
  color        text not null default '#3c8fe0',
  avatar_url   text,
  pin_hash     text,                  -- optional 4-digit PIN (hashed) to gate edits
  role         text not null default 'member' check (role in ('adult','member','kid')),
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index members_household_idx on public.members(household_id);
create index members_user_idx on public.members(user_id);

-- ── Google Calendar connections (multi-account, per member) ────────────────
create table public.google_connections (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  google_email   text not null,
  access_token   text,               -- short-lived; refreshed server-side
  refresh_token  text,               -- long-lived (functions only ever read this)
  token_expiry   timestamptz,
  -- how this account's events are treated on the board:
  treatment      text not null default 'show' check (treatment in ('schedule_around','ask','show')),
  busy_only      boolean not null default false,  -- privacy: show as "busy", hide titles
  calendars      jsonb not null default '[]'::jsonb, -- per-calendar on/off + color
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, google_email)
);
create index gconn_household_idx on public.google_connections(household_id);
create index gconn_member_idx on public.google_connections(member_id);

-- ── Schedule blocks (draggable day-blocking: groceries, soccer, date night) ─
create table public.schedule_blocks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id    uuid references public.members(id) on delete set null, -- null = whole household
  title        text not null,
  category     text,                  -- maps to tailwind `cat` colors (food/sport/…)
  day          date not null,
  start_min    int,                   -- minutes from midnight; null = unplaced (stacks)
  minutes      int not null default 60,
  notes        text,
  created_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index blocks_household_day_idx on public.schedule_blocks(household_id, day);
create index blocks_member_idx on public.schedule_blocks(member_id);

-- ── Tasks (app-native — assignable between members, NO ClickUp) ────────────
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title        text not null,
  notes        text,
  assigned_to  uuid references public.members(id) on delete set null,
  created_by   uuid references public.members(id) on delete set null,
  due_date     date,
  done         boolean not null default false,
  done_at      timestamptz,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_household_idx on public.tasks(household_id);
create index tasks_assigned_idx on public.tasks(assigned_to);

-- ── Notes & shared lists (shared, or per-member) ───────────────────────────
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id    uuid references public.members(id) on delete set null, -- null = shared
  kind         text not null default 'note' check (kind in ('note','list')),
  title        text,
  body         text,                  -- for kind='note'
  items        jsonb not null default '[]'::jsonb, -- for kind='list': [{id,text,done}]
  pinned       boolean not null default false,
  created_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index notes_household_idx on public.notes(household_id);

-- ============================================================================
-- Helper: households the current auth user belongs to
-- ============================================================================
create or replace function public.household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.households where created_by = auth.uid()
  union
  select household_id from public.members where user_id = auth.uid()
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.households        enable row level security;
alter table public.members           enable row level security;
alter table public.google_connections enable row level security;
alter table public.schedule_blocks   enable row level security;
alter table public.tasks             enable row level security;
alter table public.notes             enable row level security;

-- Households: members of the household can read; creator can update; any
-- authenticated user can create (they become created_by).
create policy households_read on public.households
  for select using (id in (select public.household_ids()));
create policy households_insert on public.households
  for insert with check (created_by = auth.uid());
create policy households_update on public.households
  for update using (id in (select public.household_ids()));

-- Members: full read/write within your household.
create policy members_rw on public.members
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));

-- Google connections: refresh tokens are sensitive, but RLS still scopes to
-- the household. (The browser only ever reads metadata; tokens are touched by
-- the service-role Netlify functions, which bypass RLS.)
create policy gconn_rw on public.google_connections
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));

create policy blocks_rw on public.schedule_blocks
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));

create policy tasks_rw on public.tasks
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));

create policy notes_rw on public.notes
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));

-- ============================================================================
-- updated_at maintenance
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger households_set_updated_at        before update on public.households        for each row execute function public.set_updated_at();
create trigger members_set_updated_at           before update on public.members           for each row execute function public.set_updated_at();
create trigger google_connections_set_updated_at before update on public.google_connections for each row execute function public.set_updated_at();
create trigger schedule_blocks_set_updated_at    before update on public.schedule_blocks    for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at              before update on public.tasks              for each row execute function public.set_updated_at();
create trigger notes_set_updated_at              before update on public.notes              for each row execute function public.set_updated_at();
