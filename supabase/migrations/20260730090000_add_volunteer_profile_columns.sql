-- Adds volunteer profile columns the app already writes but the base schema never created.
-- mapVolunteerToDB (lib/mappers.ts) sends `notes` and `avatar_url` on EVERY volunteer save;
-- if either column is missing in the live database, all availability saves fail with
-- PostgREST PGRST204 — the reported "volunteers update availability and it doesn't save" bug.
-- Idempotent: safe to run whether or not the columns already exist.

ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
