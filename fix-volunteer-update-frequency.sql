-- Fix Volunteer Update Policy to Allow Frequency Changes
-- This migration updates the volunteer update trigger to allow volunteers
-- to update their frequency field along with other personal information

-- The issue: The current trigger prevents volunteers from changing their frequency,
-- but we want volunteers to be able to update this field themselves

-- Drop and recreate the validation function with updated logic
CREATE OR REPLACE FUNCTION validate_volunteer_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a volunteer updating their own record (not an admin)
  -- Check if they're trying to change protected fields
  IF NEW.user_id = auth.uid() AND NOT is_admin() THEN
    -- Prevent changes to critical fields by reverting them to OLD values
    -- NOTE: frequency is now ALLOWED to be updated by volunteers

    IF OLD.role IS DISTINCT FROM NEW.role THEN
      NEW.role := OLD.role;
    END IF;

    IF OLD.skill_level IS DISTINCT FROM NEW.skill_level THEN
      NEW.skill_level := OLD.skill_level;
    END IF;

    -- REMOVED: frequency restriction - volunteers can now update this field
    -- IF OLD.frequency IS DISTINCT FROM NEW.frequency THEN
    --   NEW.frequency := OLD.frequency;
    -- END IF;

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

-- The trigger already exists from the previous migration, so we don't need to recreate it
-- It will automatically use the updated function

-- Success message
SELECT 'Volunteer update policy fixed successfully!' AS message;
SELECT 'Volunteers can now update: name, email, phone, preferred_location, preferred_days, blackout_dates, only_dates, skills, AND frequency' AS allowed_fields;
SELECT 'Protected fields (admin-only): role, skill_level, availability_status, serial_number' AS protected_fields;
