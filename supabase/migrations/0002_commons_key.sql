-- ============================================================================
-- Commons — household sharing ("Open the Door")
-- Adds a per-household "Commons Key" (short join code) + a secure join function
-- so someone can join an existing household instead of creating their own.
-- ============================================================================

-- Short code shared to invite people into a household.
alter table public.households add column if not exists join_code text;

update public.households
  set join_code = upper(left(replace(gen_random_uuid()::text, '-', ''), 6))
  where join_code is null;

alter table public.households
  alter column join_code set default upper(left(replace(gen_random_uuid()::text, '-', ''), 6)),
  alter column join_code set not null;

create unique index if not exists households_join_code_idx on public.households(join_code);

-- Join a household by its Commons Key. SECURITY DEFINER so a not-yet-member can
-- look up the household and insert their own member row (RLS would otherwise
-- hide the household and block the insert). Idempotent if already a member.
create or replace function public.join_household_by_key(p_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
  uname text;
begin
  select id into hid from public.households where join_code = upper(trim(p_key));
  if hid is null then
    raise exception 'Invalid Commons Key';
  end if;
  if exists (select 1 from public.members where household_id = hid and user_id = auth.uid()) then
    return hid;
  end if;
  select coalesce(nullif(split_part((select email from auth.users where id = auth.uid()), '@', 1), ''), 'New member')
    into uname;
  insert into public.members (household_id, user_id, name, color, role, sort_order)
    values (hid, auth.uid(), initcap(uname), '#3c8fe0', 'adult',
            (select coalesce(max(sort_order), 0) + 1 from public.members where household_id = hid));
  return hid;
end;
$$;

grant execute on function public.join_household_by_key(text) to authenticated;
