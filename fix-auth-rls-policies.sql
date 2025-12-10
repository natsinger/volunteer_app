-- Fix Authentication RLS Policies
-- This migration ensures users can check their own admin/volunteer status
-- Addresses the 406 (Not Acceptable) error when logging in

-- ============================================================================
-- 1. Ensure RLS is enabled on core tables
-- ============================================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Ensure SELECT policies exist for admins table
-- ============================================================================

-- Drop existing policy if it exists, then recreate to ensure it's correct
DROP POLICY IF EXISTS "Admins can read their own record" ON admins;

-- Allow authenticated users to check if they are an admin
CREATE POLICY "Admins can read their own record" ON admins
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- 3. Ensure SELECT policies exist for volunteers table
-- ============================================================================

-- Check if the volunteer read policy exists
DROP POLICY IF EXISTS "Volunteers can read own record" ON volunteers;

-- Allow authenticated users to check if they are a volunteer
CREATE POLICY "Volunteers can read own record" ON volunteers
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- 4. Verify the is_admin() function exists and is accessible
-- ============================================================================

-- Recreate the helper function to ensure it works
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ============================================================================
-- Verification Query
-- ============================================================================

-- This query will help verify the policies are in place
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('admins', 'volunteers')
  AND policyname IN ('Admins can read their own record', 'Volunteers can read own record', 'Admins can read all volunteers')
ORDER BY tablename, policyname;

SELECT 'Authentication RLS policies fixed successfully!' AS message;
