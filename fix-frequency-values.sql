-- Fix frequency values for existing volunteers
-- This fixes volunteers who have 'Weekly' instead of 'ONCE_A_WEEK'
-- Run this in Supabase SQL Editor

-- First, check how many volunteers have the wrong frequency format
SELECT
  frequency,
  COUNT(*) as count
FROM volunteers
GROUP BY frequency
ORDER BY count DESC;

-- Update 'Weekly' to 'ONCE_A_WEEK' (default: 4 shifts per month)
UPDATE volunteers
SET frequency = 'ONCE_A_WEEK'
WHERE frequency = 'Weekly' OR frequency = 'weekly';

-- Update other potential variations
UPDATE volunteers
SET frequency = 'TWICE_A_MONTH'
WHERE frequency IN ('Bi-weekly', 'bi-weekly', 'Twice a month');

UPDATE volunteers
SET frequency = 'ONCE_A_MONTH'
WHERE frequency IN ('Monthly', 'monthly', 'Once a month');

-- Verify the fix
SELECT
  name,
  email,
  frequency,
  preferred_days,
  array_length(preferred_days, 1) as num_days
FROM volunteers
WHERE availability_status = 'Active'
ORDER BY name;

-- Success message
SELECT
  'Fixed frequency values! Volunteers with "Weekly" are now "ONCE_A_WEEK"' AS message,
  COUNT(*) as updated_count
FROM volunteers
WHERE frequency = 'ONCE_A_WEEK';
