-- Restrict volunteers to PUBLISHED schedules only (defense in depth).
--
-- Background: the volunteer UI already filters on is_published = true when
-- loading the Monthly Schedule, but the existing RLS policies used
-- `USING (true)`, so the published gate was enforced only on the client. A
-- volunteer hitting the API directly could read unpublished (draft) schedules
-- and their assignments. This migration moves the gate into the database.
--
-- Admins are unaffected: their own `is_admin()` SELECT policies remain, and
-- because permissive RLS policies are OR'd together, admins still see every
-- row while volunteers see only published ones.
--
-- Run this in your Supabase SQL Editor (or via the Supabase CLI).

-- saved_schedules -----------------------------------------------------------
DROP POLICY IF EXISTS "Volunteers can view saved schedules" ON saved_schedules;

CREATE POLICY "Volunteers can view published schedules"
  ON saved_schedules FOR SELECT
  TO authenticated
  USING (is_published = true);

-- saved_schedule_assignments ------------------------------------------------
DROP POLICY IF EXISTS "Volunteers can view saved schedule assignments" ON saved_schedule_assignments;

CREATE POLICY "Volunteers can view published schedule assignments"
  ON saved_schedule_assignments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM saved_schedules s
      WHERE s.id = saved_schedule_assignments.schedule_id
        AND s.is_published = true
    )
  );

-- Verification --------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('saved_schedules', 'saved_schedule_assignments')
ORDER BY tablename, policyname;
