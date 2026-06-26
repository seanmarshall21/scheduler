-- Per-user preferences that should follow the account across devices
-- (assistant voice + voice-input settings). Device-specific things like the
-- dashboard layout intentionally stay in localStorage.
create table if not exists user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_prefs enable row level security;

drop policy if exists user_prefs_rw on user_prefs;
create policy user_prefs_rw on user_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
