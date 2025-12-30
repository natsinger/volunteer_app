-- SAFE: Add policy to allow volunteers to see coworkers
-- This DOES NOT drop admin policies, only adds volunteer read access

-- Add policy for volunteers to read other volunteers (for coworker feature)
-- This is IN ADDITION to existing admin policies, not replacing them
DROP POLICY IF EXISTS "Volunteers can read other volunteers" ON volunteers;

CREATE POLICY "Volunteers can read other volunteers"
  ON volunteers FOR SELECT
  USING (
    -- Allow volunteers to read all volunteer records (for seeing coworkers)
    EXISTS (
      SELECT 1 FROM volunteers
      WHERE user_id = auth.uid()
    )
  );

-- Note: Keep the existing "Volunteers can read own record" policy
-- Both policies work together - Postgres uses OR logic for multiple SELECT policies

-- Verify policies exist
SELECT
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename = 'volunteers'
ORDER BY policyname;

SELECT '✅ Volunteers can now see coworkers! Admin access unchanged.' as message;
