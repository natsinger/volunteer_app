-- Migration: Add schedule history tables
-- This allows saving and viewing previous schedules

-- Table to store saved schedules (metadata)
CREATE TABLE IF NOT EXISTS saved_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    target_month INTEGER NOT NULL,
    target_year INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT,
    notes TEXT
);

-- Table to store individual assignments for each saved schedule
CREATE TABLE IF NOT EXISTS saved_schedule_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES saved_schedules(id) ON DELETE CASCADE,
    shift_id TEXT NOT NULL,
    volunteer_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_saved_schedules_date ON saved_schedules(target_year, target_month);
CREATE INDEX IF NOT EXISTS idx_saved_schedule_assignments_schedule_id ON saved_schedule_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_saved_schedule_assignments_shift_id ON saved_schedule_assignments(shift_id);

-- Add comments for documentation
COMMENT ON TABLE saved_schedules IS 'Stores metadata for saved schedules';
COMMENT ON TABLE saved_schedule_assignments IS 'Stores individual shift assignments for each saved schedule';
COMMENT ON COLUMN saved_schedules.target_month IS 'Target month (1-12) for the schedule';
COMMENT ON COLUMN saved_schedules.target_year IS 'Target year for the schedule';
COMMENT ON COLUMN saved_schedule_assignments.shift_id IS 'ID of the shift (references shifts table)';
COMMENT ON COLUMN saved_schedule_assignments.volunteer_id IS 'ID of the volunteer (references volunteers table)';
