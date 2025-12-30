-- Fix RLS policies for saved_schedules table
-- This migration ensures admins can save schedules
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- 1. Ensure RLS is enabled on both tables
-- ============================================================================

ALTER TABLE saved_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_schedule_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Drop existing policies to avoid conflicts
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read all saved schedules" ON saved_schedules;
DROP POLICY IF EXISTS "Admins can insert saved schedules" ON saved_schedules;
DROP POLICY IF EXISTS "Admins can update saved schedules" ON saved_schedules;
DROP POLICY IF EXISTS "Admins can delete saved schedules" ON saved_schedules;
DROP POLICY IF EXISTS "Volunteers can view saved schedules" ON saved_schedules;

DROP POLICY IF EXISTS "Admins can read all saved schedule assignments" ON saved_schedule_assignments;
DROP POLICY IF EXISTS "Admins can insert saved schedule assignments" ON saved_schedule_assignments;
DROP POLICY IF EXISTS "Admins can update saved schedule assignments" ON saved_schedule_assignments;
DROP POLICY IF EXISTS "Admins can delete saved schedule assignments" ON saved_schedule_assignments;
DROP POLICY IF EXISTS "Volunteers can view saved schedule assignments" ON saved_schedule_assignments;

-- ============================================================================
-- 3. Create admin policies for saved_schedules
-- ============================================================================

-- Admins can perform all operations on saved_schedules
CREATE POLICY "Admins can read all saved schedules"
  ON saved_schedules FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert saved schedules"
  ON saved_schedules FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update saved schedules"
  ON saved_schedules FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins can delete saved schedules"
  ON saved_schedules FOR DELETE
  USING (is_admin());

-- ============================================================================
-- 4. Create admin policies for saved_schedule_assignments
-- ============================================================================

-- Admins can perform all operations on saved_schedule_assignments
CREATE POLICY "Admins can read all saved schedule assignments"
  ON saved_schedule_assignments FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert saved schedule assignments"
  ON saved_schedule_assignments FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update saved schedule assignments"
  ON saved_schedule_assignments FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins can delete saved schedule assignments"
  ON saved_schedule_assignments FOR DELETE
  USING (is_admin());

-- ============================================================================
-- 5. Create volunteer read-only policies
-- ============================================================================

-- Volunteers can view saved schedules (read-only)
CREATE POLICY "Volunteers can view saved schedules"
  ON saved_schedules FOR SELECT
  TO authenticated
  USING (true);

-- Volunteers can view saved schedule assignments (read-only)
CREATE POLICY "Volunteers can view saved schedule assignments"
  ON saved_schedule_assignments FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'RLS policies for saved_schedules fixed!' AS message;

-- Show current policies for verification
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename IN ('saved_schedules', 'saved_schedule_assignments')
ORDER BY tablename, policyname;
