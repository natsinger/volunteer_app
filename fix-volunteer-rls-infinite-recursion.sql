-- Fix Volunteer RLS Infinite Recursion
-- This migration fixes the infinite recursion in the volunteer update policy
-- that was causing failures when admins try to update volunteer records

-- The problem: The "Volunteers can update own personal info" policy uses subqueries
-- that query the same volunteers table, creating infinite recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Volunteers can update own personal info" ON volunteers;

-- Create a simpler policy that doesn't use recursive subqueries
-- This policy prevents volunteers from updating sensitive fields by using
-- a CHECK constraint approach instead of subqueries

-- NOTE: We keep the admin policy separate and unchanged
-- The "Admins can update volunteers" policy uses is_admin() which doesn't cause recursion

-- Recreate the volunteer update policy without recursive subqueries
-- We'll use a different approach: allow the update operation but validate in the application layer
-- OR restrict at the column level using a different mechanism

-- Option 1: Simple policy - volunteers can update their own record
-- But we'll rely on application-level validation to prevent changing critical fields
CREATE POLICY "Volunteers can update own record" ON volunteers FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add a trigger to enforce the restriction on critical fields at the database level
-- This prevents volunteers from changing role, skill_level, frequency, availability_status, serial_number

-- First, create a function to validate volunteer updates
CREATE OR REPLACE FUNCTION validate_volunteer_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a volunteer updating their own record (not an admin)
  -- Check if they're trying to change protected fields
  IF NEW.user_id = auth.uid() AND NOT is_admin() THEN
    -- Prevent changes to critical fields by reverting them to OLD values
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      NEW.role := OLD.role;
    END IF;

    IF OLD.skill_level IS DISTINCT FROM NEW.skill_level THEN
      NEW.skill_level := OLD.skill_level;
    END IF;

    IF OLD.frequency IS DISTINCT FROM NEW.frequency THEN
      NEW.frequency := OLD.frequency;
    END IF;

    IF OLD.availability_status IS DISTINCT FROM NEW.availability_status THEN
      NEW.availability_status := OLD.availability_status;
    END IF;

    IF OLD.serial_number IS DISTINCT FROM NEW.serial_number THEN
      NEW.serial_number := OLD.serial_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS enforce_volunteer_update_restrictions ON volunteers;

-- Create the trigger
CREATE TRIGGER enforce_volunteer_update_restrictions
BEFORE UPDATE ON volunteers
FOR EACH ROW
EXECUTE FUNCTION validate_volunteer_self_update();

-- Success message
SELECT 'Volunteer RLS infinite recursion fix applied successfully!' AS message;
SELECT 'Volunteers can now update their own records (personal info only)' AS info;
SELECT 'Admins can update all volunteer fields without restriction' AS info;
