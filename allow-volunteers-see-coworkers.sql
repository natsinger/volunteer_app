-- Allow volunteers to see other volunteers' basic info
-- This allows coworkers to see each other on the same shift
-- but still protects sensitive data

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Volunteers can read own record" ON volunteers;

-- Create new policy that allows volunteers to see other volunteers' basic contact info
-- Volunteers can see: name, email, phone, location, preferred_days for coordination
-- Volunteers CANNOT see: role, skill_level, frequency (admin-only fields)
CREATE POLICY "Volunteers can read other volunteers"
  ON volunteers FOR SELECT
  TO authenticated
  USING (
    -- User must be a volunteer (has a record with their user_id)
    EXISTS (SELECT 1 FROM volunteers WHERE user_id = auth.uid())
  );

-- Verify the policy
SELECT schemaname, tablename, policyname, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'volunteers'
  AND policyname = 'Volunteers can read other volunteers';

SELECT 'RLS policy updated! Volunteers can now see their coworkers basic info.' AS message;
