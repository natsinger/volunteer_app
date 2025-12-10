-- Fix Volunteer Shift Switching RLS Policies
-- Allow volunteers to manage their own shift assignments for switching

-- ============================================================================
-- Add policies to allow volunteers to insert and delete their own assignments
-- ============================================================================

-- Allow volunteers to add themselves to open shifts
CREATE POLICY "Volunteers can add themselves to shifts" ON shift_assignments
  FOR INSERT
  WITH CHECK (
    volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
  );

-- Allow volunteers to remove themselves from shifts (for switching/dropping)
CREATE POLICY "Volunteers can remove themselves from shifts" ON shift_assignments
  FOR DELETE
  USING (
    volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
  );

-- Verification: Show all policies on shift_assignments table
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
WHERE tablename = 'shift_assignments'
ORDER BY cmd, policyname;

SELECT 'Volunteer shift switching RLS policies added successfully!' AS message;
