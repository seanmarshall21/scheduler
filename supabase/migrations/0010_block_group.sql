-- Multi-person schedule blocks: a joint block (e.g. "Zoo" for Sean + Erin + Levi)
-- is stored as one linked row per person sharing a group_id, so each renders in
-- its own column/lane and they delete together.
alter table schedule_blocks add column if not exists group_id uuid;
create index if not exists schedule_blocks_group_idx on schedule_blocks(group_id);
