-- Richer fridge board: alongside freehand `strokes`, support placed items
-- (text notes, images, photos). Each item is { id, type, x, y, w, h, rot, ... }
-- in the virtual 1000x600 board space.
alter table whiteboards add column if not exists items jsonb not null default '[]'::jsonb;
