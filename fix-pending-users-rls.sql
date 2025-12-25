-- Fix RLS policies for pending_users table
-- The original policy was too restrictive - users couldn't insert during signup

-- Drop the old restrictive INSERT policy
DROP POLICY IF EXISTS "Users can insert their own pending record" ON pending_users;

-- Create a more permissive INSERT policy
-- Allow authenticated users to insert their own records
CREATE POLICY "Authenticated users can insert pending record"
  ON pending_users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also allow users to read their own pending record (so they can see status)
DROP POLICY IF EXISTS "Users can read their own pending record" ON pending_users;

CREATE POLICY "Users can read their own pending record"
  ON pending_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- Verify the policies
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'pending_users'
ORDER BY policyname;
