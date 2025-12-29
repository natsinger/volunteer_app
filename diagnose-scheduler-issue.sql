-- Diagnostic query to investigate why volunteers show 0 possible shifts
-- Run this as the admin user to check data and permissions

-- 1. Check volunteer preferred_days format and data
SELECT
  id,
  name,
  email,
  preferred_days,
  array_length(preferred_days, 1) as num_preferred_days,
  preferred_location,
  availability_status,
  frequency
FROM volunteers
WHERE availability_status = 'Active'
ORDER BY name
LIMIT 10;

-- 2. Check for volunteers with empty preferred_days
SELECT
  id,
  name,
  email,
  preferred_days,
  CASE
    WHEN preferred_days IS NULL THEN 'NULL'
    WHEN array_length(preferred_days, 1) IS NULL THEN 'EMPTY ARRAY'
    ELSE 'HAS DATA'
  END as preferred_days_status
FROM volunteers
WHERE availability_status = 'Active'
  AND (preferred_days IS NULL OR array_length(preferred_days, 1) IS NULL OR array_length(preferred_days, 1) = 0)
ORDER BY name;

-- 3. Sample volunteer data to verify format
-- This shows the actual string values in preferred_days
SELECT
  id,
  name,
  email,
  unnest(preferred_days) as day_preference
FROM volunteers
WHERE availability_status = 'Active'
  AND preferred_days IS NOT NULL
  AND array_length(preferred_days, 1) > 0
ORDER BY name, day_preference
LIMIT 20;

-- 4. Check if there are any recent shifts to match against
SELECT
  id,
  title,
  date,
  start_time,
  end_time,
  location,
  status,
  EXTRACT(DOW FROM date::date) as day_of_week,  -- 0=Sunday, 1=Monday, etc.
  CASE
    WHEN EXTRACT(DOW FROM date::date) = 2 AND CAST(SPLIT_PART(start_time, ':', 1) AS INTEGER) < 16
      THEN '2_morning'
    WHEN EXTRACT(DOW FROM date::date) = 2 AND CAST(SPLIT_PART(start_time, ':', 1) AS INTEGER) >= 16
      THEN '2_evening'
    ELSE EXTRACT(DOW FROM date::date)::text
  END as expected_day_code
FROM shifts
WHERE date >= CURRENT_DATE
  AND date < CURRENT_DATE + INTERVAL '60 days'
ORDER BY date, start_time
LIMIT 10;

-- 5. Check for a specific volunteer's compatibility with upcoming shifts
-- Replace 'VOLUNTEER_ID_HERE' with an actual volunteer ID from query #1
-- This mimics the canVolunteerWorkShift logic
WITH volunteer_info AS (
  SELECT
    id,
    name,
    preferred_days,
    preferred_location,
    blackout_dates,
    only_dates
  FROM volunteers
  WHERE availability_status = 'Active'
  LIMIT 1  -- Just check the first active volunteer
),
shift_info AS (
  SELECT
    id,
    title,
    date,
    start_time,
    location,
    CASE
      WHEN EXTRACT(DOW FROM date::date) = 2 AND CAST(SPLIT_PART(start_time, ':', 1) AS INTEGER) < 16
        THEN '2_morning'
      WHEN EXTRACT(DOW FROM date::date) = 2 AND CAST(SPLIT_PART(start_time, ':', 1) AS INTEGER) >= 16
        THEN '2_evening'
      ELSE EXTRACT(DOW FROM date::date)::text
    END as day_code
  FROM shifts
  WHERE date >= CURRENT_DATE
    AND date < CURRENT_DATE + INTERVAL '30 days'
  LIMIT 5
)
SELECT
  v.name as volunteer_name,
  v.preferred_days,
  v.preferred_location,
  s.title as shift_title,
  s.date,
  s.location as shift_location,
  s.day_code as shift_day_code,
  -- Check each compatibility condition
  CASE
    WHEN v.preferred_location != 'BOTH' AND s.location != 'BOTH' AND v.preferred_location != s.location
      THEN 'FAIL: Location mismatch'
    ELSE 'PASS: Location OK'
  END as location_check,
  CASE
    WHEN s.day_code = ANY(v.preferred_days) THEN 'PASS: Day matches'
    ELSE 'FAIL: Day not in preferences'
  END as day_check,
  CASE
    WHEN s.date::text = ANY(v.blackout_dates) THEN 'FAIL: Blackout date'
    ELSE 'PASS: Not blackout'
  END as blackout_check,
  CASE
    WHEN array_length(v.only_dates, 1) > 0 AND NOT (s.date::text = ANY(v.only_dates))
      THEN 'FAIL: Not in only_dates'
    WHEN array_length(v.only_dates, 1) > 0
      THEN 'PASS: In only_dates'
    ELSE 'PASS: No only_dates restriction'
  END as only_dates_check,
  -- Overall result
  CASE
    WHEN (v.preferred_location != 'BOTH' AND s.location != 'BOTH' AND v.preferred_location != s.location)
      THEN false
    WHEN NOT (s.day_code = ANY(v.preferred_days))
      THEN false
    WHEN s.date::text = ANY(v.blackout_dates)
      THEN false
    WHEN array_length(v.only_dates, 1) > 0 AND NOT (s.date::text = ANY(v.only_dates))
      THEN false
    ELSE true
  END as can_work_shift
FROM volunteer_info v
CROSS JOIN shift_info s;

-- Success message
SELECT 'Diagnostic queries completed! Review the results above to identify the issue.' AS message;
