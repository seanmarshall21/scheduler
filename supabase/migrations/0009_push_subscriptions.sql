-- Web Push subscriptions (one per device/browser). The scheduled dispatcher
-- (service role) reads these by household to deliver reminders when Commons is
-- closed. Users manage only their own subscriptions.
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  endpoint     text not null unique,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);
create index push_subs_household_idx on public.push_subscriptions(household_id);

alter table public.push_subscriptions enable row level security;
create policy push_subs_rw on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
