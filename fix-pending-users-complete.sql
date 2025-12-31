-- Complete fix for pending_users table and RLS policies
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- 1. First, check and fix the is_admin() function
-- ============================================================================

-- Drop and recreate is_admin function to ensure it works correctly
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. Add display_name column if it doesn't exist
-- ============================================================================

ALTER TABLE pending_users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE pending_users ADD COLUMN IF NOT EXISTS name TEXT;

-- ============================================================================
-- 3. Drop ALL existing policies on pending_users to start fresh
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read all pending users" ON pending_users;
DROP POLICY IF EXISTS "Users can insert their own pending record" ON pending_users;
DROP POLICY IF EXISTS "Authenticated users can insert pending record" ON pending_users;
DROP POLICY IF EXISTS "Users can read their own pending record" ON pending_users;
DROP POLICY IF EXISTS "Users can read own pending record" ON pending_users;
DROP POLICY IF EXISTS "Admins can delete pending users" ON pending_users;

-- ============================================================================
-- 4. Ensure RLS is enabled
-- ============================================================================

ALTER TABLE pending_users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Create correct RLS policies
-- ============================================================================

-- Admins can read ALL pending users
CREATE POLICY "Admins can read all pending users"
  ON pending_users FOR SELECT
  USING (is_admin());

-- Authenticated users can insert their own pending record (during signup)
-- This is permissive to allow signup to work
CREATE POLICY "Authenticated users can insert pending record"
  ON pending_users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can read their own pending record (to check approval status)
CREATE POLICY "Users can read own pending record"
  ON pending_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can delete pending users (when approving/rejecting)
CREATE POLICY "Admins can delete pending users"
  ON pending_users FOR DELETE
  USING (is_admin());

-- ============================================================================
-- 6. Add any missing users to pending_users table
-- This catches users who signed up but weren't added to pending_users
-- ============================================================================

INSERT INTO pending_users (user_id, email, provider, created_at)
SELECT
  au.id as user_id,
  au.email,
  COALESCE(au.raw_app_meta_data->>'provider', 'email') as provider,
  au.created_at
FROM auth.users au
LEFT JOIN admins a ON au.id = a.user_id
LEFT JOIN volunteers v ON au.id = v.user_id
LEFT JOIN pending_users pu ON au.id = pu.user_id
WHERE a.user_id IS NULL
  AND v.user_id IS NULL
  AND pu.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- 7. Verify the setup
-- ============================================================================

-- Show all policies
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename = 'pending_users'
ORDER BY policyname;

-- Show pending users count
SELECT
  'Total pending users: ' || COUNT(*)::text as result
FROM pending_users;

-- Show pending users (if any)
SELECT id, user_id, email, provider, created_at
FROM pending_users
ORDER BY created_at DESC;

SELECT '✅ Pending users RLS fix complete!' as message;
