-- Fix RLS policies to allow volunteers to see other volunteers (coworkers)
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- 1. Drop existing restrictive policies on volunteers table
-- ============================================================================

DROP POLICY IF EXISTS "Volunteers can read own record" ON volunteers;
DROP POLICY IF EXISTS "Volunteers can read other volunteers" ON volunteers;
DROP POLICY IF EXISTS "Authenticated users can read volunteers" ON volunteers;

-- ============================================================================
-- 2. Create policy that allows all authenticated users to read volunteers
-- This is needed for volunteers to see their coworkers on shared shifts
-- ============================================================================

CREATE POLICY "Authenticated users can read volunteers"
  ON volunteers FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 3. Make sure shift_assignments can be read by volunteers
-- This allows volunteers to see who else is on their shifts
-- ============================================================================

DROP POLICY IF EXISTS "Volunteers can read shift assignments" ON shift_assignments;
DROP POLICY IF EXISTS "Authenticated users can read shift assignments" ON shift_assignments;

CREATE POLICY "Authenticated users can read shift assignments"
  ON shift_assignments FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 4. Verify the policies
-- ============================================================================

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN ('volunteers', 'shift_assignments')
ORDER BY tablename, policyname;

SELECT 'RLS policies updated! Volunteers can now see their coworkers.' AS message;
