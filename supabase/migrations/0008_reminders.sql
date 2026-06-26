-- Reminders the assistant (or anyone) can set; they fire at remind_at. v1 fires
-- in-app while Commons is open (ideal for the always-on kitchen screen); a
-- background web-push path can layer on later. Household-scoped like everything.
create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id    uuid references public.members(id) on delete set null, -- who it's for (null = everyone)
  text         text not null,
  remind_at    timestamptz not null,
  fired        boolean not null default false,
  created_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index reminders_household_idx on public.reminders(household_id, remind_at);

alter table public.reminders enable row level security;
create policy reminders_rw on public.reminders
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));
