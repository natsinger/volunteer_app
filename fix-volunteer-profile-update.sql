-- Fix volunteer profile update RLS
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. Drop conflicting policies
-- ============================================================================

DROP POLICY IF EXISTS "Volunteers can update own record" ON volunteers;
DROP POLICY IF EXISTS "Volunteers can update own personal info" ON volunteers;

-- ============================================================================
-- 2. Create the correct UPDATE policy
-- ============================================================================

CREATE POLICY "Volunteers can update own record" ON volunteers FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 3. Create trigger to protect admin-only fields (but allow name, phone, etc.)
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_volunteer_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a volunteer updating their own record (not an admin)
  IF NEW.user_id = auth.uid() AND NOT is_admin() THEN
    -- Protect critical fields - revert to old values if changed
    NEW.role := OLD.role;
    NEW.skill_level := OLD.skill_level;
    NEW.availability_status := OLD.availability_status;
    NEW.serial_number := OLD.serial_number;
    -- NOTE: frequency, preferred_location, preferred_days ARE allowed to be changed by volunteers
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS enforce_volunteer_update_restrictions ON volunteers;

CREATE TRIGGER enforce_volunteer_update_restrictions
BEFORE UPDATE ON volunteers
FOR EACH ROW
EXECUTE FUNCTION validate_volunteer_self_update();

-- ============================================================================
-- 4. Verify policies
-- ============================================================================

SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'volunteers'
ORDER BY policyname;

SELECT '✅ Volunteers can now update their profiles!' AS message;
