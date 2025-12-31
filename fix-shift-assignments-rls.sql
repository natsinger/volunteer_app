-- Diagnostic and fix for shift_assignments RLS policies
-- Run this in Supabase SQL Editor

-- 1. Check current RLS status
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'shift_assignments';

-- 2. Check existing policies on shift_assignments
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'shift_assignments';

-- 3. Check how many assignments exist
SELECT COUNT(*) as total_assignments FROM shift_assignments;

-- 4. Check the is_admin() function
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'is_admin';

-- 5. Drop and recreate the admin delete policy to ensure it works
DROP POLICY IF EXISTS "Admins can delete shift assignments" ON shift_assignments;

CREATE POLICY "Admins can delete shift assignments" ON shift_assignments
  FOR DELETE
  USING (is_admin());

-- 6. Also ensure SELECT works for counting before delete
DROP POLICY IF EXISTS "Admins can read all shift assignments" ON shift_assignments;

CREATE POLICY "Admins can read all shift assignments" ON shift_assignments
  FOR SELECT
  USING (is_admin());

-- 7. Verify the policies were created
SELECT
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'shift_assignments'
ORDER BY policyname;

SELECT 'RLS policies for shift_assignments have been refreshed!' AS message;
