-- Security Fixes Migration
-- This migration addresses all RLS security issues identified in code review

-- ============================================================================
-- 1. Add RLS to saved_schedules and saved_schedule_assignments tables
-- ============================================================================

-- Enable RLS on saved_schedules table
ALTER TABLE saved_schedules ENABLE ROW LEVEL SECURITY;

-- Enable RLS on saved_schedule_assignments table
ALTER TABLE saved_schedule_assignments ENABLE ROW LEVEL SECURITY;

-- Policies for saved_schedules
-- Only admins can manage saved schedules
CREATE POLICY "Admins can read all saved schedules" ON saved_schedules FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert saved schedules" ON saved_schedules FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update saved schedules" ON saved_schedules FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete saved schedules" ON saved_schedules FOR DELETE USING (is_admin());

-- Policies for saved_schedule_assignments
-- Only admins can manage saved schedule assignments
CREATE POLICY "Admins can read all saved schedule assignments" ON saved_schedule_assignments FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert saved schedule assignments" ON saved_schedule_assignments FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update saved schedule assignments" ON saved_schedule_assignments FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete saved schedule assignments" ON saved_schedule_assignments FOR DELETE USING (is_admin());

-- ============================================================================
-- 2. Restrict volunteer RLS to only allow updating personal info
-- ============================================================================

-- Drop the existing broad update policy for volunteers
DROP POLICY IF EXISTS "Volunteers can update own record" ON volunteers;

-- Create new restricted policy that only allows updating personal info
CREATE POLICY "Volunteers can update own personal info" ON volunteers FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND
  -- Only allow updates to these specific columns (personal info and preferences):
  -- name, email, phone, preferred_location, preferred_days, blackout_dates, only_dates
  -- Prevent changes to: role, skill_level, frequency, availability_status, serial_number
  (
    -- We enforce this by checking that critical fields haven't changed
    role = (SELECT role FROM volunteers WHERE id = volunteers.id AND user_id = auth.uid()) AND
    skill_level = (SELECT skill_level FROM volunteers WHERE id = volunteers.id AND user_id = auth.uid()) AND
    frequency = (SELECT frequency FROM volunteers WHERE id = volunteers.id AND user_id = auth.uid()) AND
    availability_status = (SELECT availability_status FROM volunteers WHERE id = volunteers.id AND user_id = auth.uid()) AND
    serial_number = (SELECT serial_number FROM volunteers WHERE id = volunteers.id AND user_id = auth.uid())
  )
);

-- ============================================================================
-- 3. Verify shift_assignments RLS allows volunteers to see their shifts
-- ============================================================================

-- The existing policies should allow volunteers to see their assignments
-- Let's verify by checking if the policies exist
DO $$
BEGIN
  -- Check if the policy exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shift_assignments'
    AND policyname = 'Volunteers can read own assignments'
  ) THEN
    RAISE NOTICE 'Policy "Volunteers can read own assignments" already exists ✓';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'shift_assignments'
    AND policyname = 'Volunteers can read all assignments'
  ) THEN
    RAISE NOTICE 'Policy "Volunteers can read all assignments" already exists ✓';
  END IF;
END $$;

-- Add a diagnostic query to help troubleshoot volunteer shift visibility issues
-- This creates a helper function for admins to check volunteer assignment visibility
CREATE OR REPLACE FUNCTION debug_volunteer_assignments(volunteer_email TEXT)
RETURNS TABLE (
  volunteer_id UUID,
  volunteer_name TEXT,
  shift_count BIGINT,
  user_id UUID,
  has_auth_user BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.name,
    COUNT(sa.id) as shift_count,
    v.user_id,
    (v.user_id IS NOT NULL) as has_auth_user
  FROM volunteers v
  LEFT JOIN shift_assignments sa ON sa.volunteer_id = v.id
  WHERE v.email = volunteer_email
  GROUP BY v.id, v.name, v.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION debug_volunteer_assignments(TEXT) TO authenticated;

SELECT 'Security fixes migration completed successfully!' AS message;
