-- Multiple fridge boards per household ("save them as different views"). Replaces
-- the single-row whiteboards table with a proper multi-board table; the existing
-- board migrates in as "Fridge". Each board holds strokes + placed items.
create table public.fridge_boards (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null default 'Fridge',
  strokes      jsonb not null default '[]'::jsonb,
  items        jsonb not null default '[]'::jsonb,
  sort_order   int not null default 0,
  updated_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index fridge_boards_household_idx on public.fridge_boards(household_id, sort_order, created_at);

alter table public.fridge_boards enable row level security;
create policy fridge_boards_rw on public.fridge_boards
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));
create trigger fridge_boards_set_updated_at before update on public.fridge_boards for each row execute function public.set_updated_at();

-- Carry the existing single whiteboard forward as the first board.
insert into public.fridge_boards (household_id, name, strokes, items, updated_by, updated_at)
select household_id, 'Fridge', strokes, coalesce(items, '[]'::jsonb), updated_by, updated_at
from public.whiteboards;
