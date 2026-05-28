-- Migration: Add shift_slot to recurring_shifts and shifts
--
-- WHY:
-- The scheduling algorithm decides "Friday Opening" vs "Friday Closing" (and
-- "Tuesday Morning" vs "Tuesday Evening") by checking whether start_time falls
-- before a hardcoded threshold (14:00 for Friday, 16:00 for Tuesday). This
-- breaks whenever the actual shift times don't fit the heuristic — e.g. when
-- both Friday shifts start before 14:00, both get classified as "opening" and
-- closing-only volunteers either match nothing (if their preferred_days say
-- 5_closing) or wrongly match an opening shift (if their data still contains
-- 5_opening from earlier saves).
--
-- This migration adds an explicit shift_slot column so each recurring shift
-- declares its slot directly. The algorithm reads this tag; the time-based
-- heuristic stays as a fallback for any row left NULL.
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

-- Friday (day_of_week = 5)
UPDATE recurring_shifts
SET shift_slot = 'closing'
WHERE day_of_week = 5
  AND shift_slot IS NULL
  AND (title ILIKE '%clos%' OR title ILIKE '%סגיר%');  -- English + Hebrew

UPDATE recurring_shifts
SET shift_slot = 'opening'
WHERE day_of_week = 5
  AND shift_slot IS NULL
  AND (title ILIKE '%open%' OR title ILIKE '%פתיח%');

-- Tuesday (day_of_week = 2)
UPDATE recurring_shifts
SET shift_slot = 'morning'
WHERE day_of_week = 2
  AND shift_slot IS NULL
  AND (title ILIKE '%morning%' OR title ILIKE '%am%' OR title ILIKE '%בוקר%');

UPDATE recurring_shifts
SET shift_slot = 'evening'
WHERE day_of_week = 2
  AND shift_slot IS NULL
  AND (title ILIKE '%evening%' OR title ILIKE '%pm%' OR title ILIKE '%ערב%');

-- ============================================================================
-- 3. Backfill already-generated shifts from their parent recurring_shift
-- ============================================================================

UPDATE shifts s
SET shift_slot = rs.shift_slot
FROM recurring_shifts rs
WHERE s.recurring_shift_id = rs.id
  AND s.shift_slot IS NULL
  AND rs.shift_slot IS NOT NULL;

-- ============================================================================
-- 4. Audit — review what got tagged, what's left NULL
-- ============================================================================

SELECT
  '=== Day-2 and Day-5 recurring shifts after backfill ===' AS audit;

SELECT
  id,
  title,
  day_of_week,
  start_time,
  end_time,
  shift_slot,
  CASE
    WHEN day_of_week IN (2, 5) AND shift_slot IS NULL THEN '⚠️ Untagged — please set manually from admin UI'
    WHEN day_of_week NOT IN (2, 5) AND shift_slot IS NOT NULL THEN 'ℹ️ Tagged on a non-split day (unusual but fine)'
    ELSE '✅'
  END AS status
FROM recurring_shifts
WHERE day_of_week IN (2, 5) OR shift_slot IS NOT NULL
ORDER BY day_of_week, start_time;

SELECT 'shift_slot migration completed!' AS message;
