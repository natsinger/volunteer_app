-- Allow volunteers to view published schedules
-- Volunteers should be able to see saved schedules and their assignments (read-only)

-- Allow all authenticated users (volunteers) to read saved schedules
CREATE POLICY "Volunteers can view saved schedules"
  ON saved_schedules
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow all authenticated users (volunteers) to read saved schedule assignments
CREATE POLICY "Volunteers can view saved schedule assignments"
  ON saved_schedule_assignments
  FOR SELECT
  TO authenticated
  USING (true);

-- Success message
SELECT 'Volunteers can now view published schedules!' AS message;
SELECT 'Volunteers have read-only access to saved_schedules and saved_schedule_assignments tables' AS info;
