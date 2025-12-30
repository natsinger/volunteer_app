-- Test query to check if volunteers can be read by the scheduler
-- This tests RLS policies and data format

SELECT 
  id,
  name,
  preferred_days,
  array_length(preferred_days, 1) as days_count,
  preferred_location,
  frequency,
  availability_status
FROM volunteers
WHERE availability_status = 'Active'
LIMIT 5;
