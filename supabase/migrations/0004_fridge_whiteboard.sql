-- ============================================================================
-- Commons — the "fridge" whiteboard
-- One shared freehand whiteboard per household. Strokes are stored in a virtual
-- 1000x600 space so they render consistently at any size. Pops up on sign-in
-- when changed and shows as a tile on the home screen.
-- ============================================================================

create table public.whiteboards (
  household_id uuid primary key references public.households(id) on delete cascade,
  strokes      jsonb not null default '[]'::jsonb,  -- [{ c: color, w: width, p: [[x,y],…] }]
  updated_by   uuid references public.members(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.whiteboards enable row level security;

create policy whiteboards_rw on public.whiteboards
  for all using (household_id in (select public.household_ids()))
  with check (household_id in (select public.household_ids()));

create trigger whiteboards_set_updated_at before update on public.whiteboards for each row execute function public.set_updated_at();
