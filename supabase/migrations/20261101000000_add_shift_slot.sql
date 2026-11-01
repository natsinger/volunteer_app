-- Migration: Add shift_slot to recurring_shifts and shifts
--
-- WHY:
-- The scheduling algorithm decides "Friday Opening" vs "Friday Closing" (and
-- "Tuesday Morning" vs "Tuesday Evening") by checking whether start_time falls
-- before a hardcoded threshold (14:00 for Friday, 16:00 for Tuesday). This
-- breaks whenever the actual shift times don't fit the heuristic. Live case:
-- the Friday closing shift starts at 11:00, so both Friday shifts were treated
-- as "opening" — closing-only volunteers could never be scheduled, opening-only
-- volunteers landed on closing, and the volunteer screen listed nobody under
-- closing.
--
-- This file previously sat at the repo root as add-shift-slot-migration.sql and
-- was never applied to the live database, even though the app code already
-- reads and writes shift_slot. It now lives in supabase/migrations so the CLI
-- applies it.
--
-- WHAT IT DOES:
--   1. Add shift_slot to recurring_shifts and shifts (TEXT, nullable, CHECK).
--   2. Backfill day-2 and day-5 recurring shifts from title keywords. Anything
--      ambiguous (no matching keyword) is left NULL so you can audit/fix it.
--   3. Copy shift_slot from recurring shifts onto already-generated shift rows.
--
-- SAFE TO RE-RUN: column adds use IF NOT EXISTS; backfill only writes where
-- shift_slot IS NULL.

-- ============================================================================
-- 1. Schema changes
-- ============================================================================

ALTER TABLE recurring_shifts
  ADD COLUMN IF NOT EXISTS shift_slot TEXT;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS shift_slot TEXT;

-- Add CHECK constraints (drop first so this is idempotent)
ALTER TABLE recurring_shifts DROP CONSTRAINT IF EXISTS recurring_shifts_shift_slot_check;
ALTER TABLE recurring_shifts ADD CONSTRAINT recurring_shifts_shift_slot_check
  CHECK (shift_slot IS NULL OR shift_slot IN ('opening', 'closing', 'morning', 'evening'));

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_slot_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_slot_check
  CHECK (shift_slot IS NULL OR shift_slot IN ('opening', 'closing', 'morning', 'evening'));

-- ============================================================================
-- 2. Backfill recurring_shifts from title
-- ============================================================================
-- Only write where shift_slot is currently NULL so a re-run doesn't clobber
-- whatever an admin has manually corrected.

-- Friday (day_of_week = 5). Closing first, so a title can't match both.
UPDATE recurring_shifts
SET shift_slot = 'closing'
WHERE day_of_week = 5
  AND shift_slot IS NULL
  AND (title ILIKE '%clos%' OR title ILIKE '%סגירה%');  -- English + Hebrew

-- The live Friday opening shift is titled "שישי בוקר ..." (morning), not פתיחה
UPDATE recurring_shifts
SET shift_slot = 'opening'
WHERE day_of_week = 5
  AND shift_slot IS NULL
  AND (title ILIKE '%open%' OR title ILIKE '%morning%'
       OR title ILIKE '%פתיחה%' OR title ILIKE '%בוקר%');

-- Tuesday (day_of_week = 2)
UPDATE recurring_shifts
SET shift_slot = 'morning'
WHERE day_of_week = 2
  AND shift_slot IS NULL
  AND (title ILIKE '%morning%' OR title ILIKE '%בוקר%');

UPDATE recurring_shifts
SET shift_slot = 'evening'
WHERE day_of_week = 2
  AND shift_slot IS NULL
  AND (title ILIKE '%evening%' OR title ILIKE '%ערב%');

-- ============================================================================
-- 3. Backfill already-generated shifts from their parent recurring_shift
-- ============================================================================

UPDATE shifts s
SET shift_slot = rs.shift_slot
FROM recurring_shifts rs
WHERE s.recurring_shift_id = rs.id
  AND s.shift_slot IS NULL
  AND rs.shift_slot IS NOT NULL;

-- Make PostgREST see the new columns immediately
NOTIFY pgrst, 'reload schema';
