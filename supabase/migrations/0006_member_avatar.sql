-- Per-member avatar image (small base64 data URL). The member's color stays the
-- identity stroke/ring drawn around the avatar everywhere it appears.
alter table members add column if not exists avatar_url text;
