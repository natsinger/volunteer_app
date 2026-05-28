-- Fix RLS policies for admins table + introduce super admin role
--
-- Two problems being solved here:
--   1. The admins table had RLS enabled with only a SELECT policy, so the
--      INSERT from approveUserAsAdmin() always failed with:
--      "new row violates row-level security policy for table 'admins'".
--   2. We want a stricter model than "any admin can promote anyone" — only a
--      designated super admin should be able to add/remove admins.
--
-- Design:
--   - Add is_super_admin BOOLEAN to the admins table.
--   - is_super_admin() helper (SECURITY DEFINER) checks the flag for auth.uid().
--   - Regular admins keep SELECT on their own row.
--   - Only super admins can INSERT / UPDATE / DELETE on admins.
--   - Bootstrap step at the bottom flips the flag on for your account.

-- ============================================================================
-- 1. Schema change: add is_super_admin column
-- ============================================================================

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_admins_is_super_admin
  ON admins(is_super_admin)
  WHERE is_super_admin = TRUE;

-- ============================================================================
-- 2. Helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = auth.uid()
      AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;

-- ============================================================================
-- 3. RLS policies on admins
-- ============================================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Drop prior versions to make this script idempotent
DROP POLICY IF EXISTS "Admins can insert admins" ON admins;
DROP POLICY IF EXISTS "Admins can update admins" ON admins;
DROP POLICY IF EXISTS "Admins can delete admins" ON admins;
DROP POLICY IF EXISTS "Super admins can insert admins" ON admins;
DROP POLICY IF EXISTS "Super admins can update admins" ON admins;
DROP POLICY IF EXISTS "Super admins can delete admins" ON admins;

-- Only super admins can manage the admins table
CREATE POLICY "Super admins can insert admins" ON admins
  FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update admins" ON admins
  FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can delete admins" ON admins
  FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- ============================================================================
-- 4. Bootstrap: mark your account as the initial super admin
-- ============================================================================
-- Replace the email below if you want someone else to be the super admin.
-- This is the ONE step that must run with a service role / database owner
-- (i.e. from the Supabase SQL Editor as the project owner) — otherwise the
-- new RLS policies will block it. Running it in the SQL Editor is fine.

UPDATE admins
SET is_super_admin = TRUE
WHERE email = 'info@pnimeet.org.il';

-- Safety check: if the email above wasn't found, raise a notice so you know.
DO $$
DECLARE
  super_count INT;
BEGIN
  SELECT COUNT(*) INTO super_count FROM admins WHERE is_super_admin = TRUE;
  IF super_count = 0 THEN
    RAISE WARNING 'No super admin set! Update the email in the bootstrap step and re-run.';
  ELSE
    RAISE NOTICE 'Super admin count: %', super_count;
  END IF;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================

SELECT email, user_id, is_super_admin
FROM admins
ORDER BY is_super_admin DESC, email;

SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'admins'
ORDER BY policyname;

SELECT 'Super admin role configured successfully!' AS message;
