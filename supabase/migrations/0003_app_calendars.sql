-- ============================================================================
-- Commons — app-native calendars + events
-- Your own calendars + events that live in Commons (not tied to a work/email
-- account), with simple recurrence and an optional mirror to a Google calendar.
-- ============================================================================

create table public.calendars (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id    uuid references public.members(id) on delete set null, -- null = shared household calendar
  name         text not null,
  color        text not null default '#3c8fe0',
  is_visible   boolean not null default true,
  sort_order   int not null default 0,
  created_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index calendars_household_idx on public.calendars(household_id);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  calendar_id  uuid references public.calendars(id) on delete set null,
  member_id    uuid references public.members(id) on delete set null, -- who it's for
  title        text not null,
  notes        text,
  location     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  repeat       text not null default 'none' check (repeat in ('none','daily','weekly','monthly','yearly')),
  repeat_until date,
  -- optional mirror into a connected Google calendar
  google_connection_id uuid references public.google_connections(id) on delete set null,
  google_event_id      text,
  created_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index events_household_idx on public.events(household_id);
create index events_starts_idx on public.events(household_id, starts_at);

alter table public.calendars enable row level security;
alter table public.events    enable row level security;

create policy calendars_rw on public.calendars
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));
create policy events_rw on public.events
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));

create trigger calendars_set_updated_at before update on public.calendars for each row execute function public.set_updated_at();
create trigger events_set_updated_at    before update on public.events    for each row execute function public.set_updated_at();
