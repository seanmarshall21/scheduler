-- ============================================================================
-- Hearth — OPTIONAL dev seed. Run in the Supabase SQL editor AFTER you have
-- signed up at least one account in the app (so auth.users has a row). It
-- creates one household, links it to your (most-recently-created) auth user,
-- and adds a few sample members. Safe to edit names/colors before running.
-- Re-running creates duplicates — run once.
-- ============================================================================
do $$
declare
  v_uid uuid;
  v_household uuid;
begin
  select id into v_uid from auth.users order by created_at desc limit 1;
  if v_uid is null then
    raise exception 'No auth user found — sign up in the app first.';
  end if;

  insert into public.households (name, created_by)
  values ('Our Home', v_uid)
  returning id into v_household;

  -- First member is linked to the signed-in user; the rest are board-only
  -- people (they can claim their member row by logging in on their phone).
  insert into public.members (household_id, user_id, name, color, role, sort_order) values
    (v_household, v_uid, 'You',   '#e0603c', 'adult',  0),
    (v_household, null,  'Partner','#3c8fe0', 'adult',  1),
    (v_household, null,  'Kid 1', '#3ca06a', 'kid',    2),
    (v_household, null,  'Kid 2', '#9b5de5', 'kid',    3);

  raise notice 'Seeded household % for user %', v_household, v_uid;
end $$;
