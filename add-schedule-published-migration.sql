-- Migration: Add is_published column to saved_schedules table
-- This allows controlling visibility of schedules to volunteers

-- Add the is_published column with default false
ALTER TABLE saved_schedules
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Update existing schedules to be published (assuming they were meant to be visible)
UPDATE saved_schedules SET is_published = true WHERE is_published IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN saved_schedules.is_published IS 'When true, the schedule is visible to volunteers after Apply to Database';
