-- Per-board visibility. Boards stay communal by default ('household'); an owner
-- can make one 'private' (just them) or 'shared' with specific members. Scoped by
-- member (the who-am-I identity), enforced in the app on top of household RLS.
alter table public.fridge_boards add column if not exists visibility text not null default 'household';
alter table public.fridge_boards add column if not exists owner_id uuid references public.members(id) on delete set null;
alter table public.fridge_boards add column if not exists shared_with uuid[] not null default '{}';
