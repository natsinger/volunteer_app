-- Migration: Add Recurring Shifts Support
-- Run this SQL in your Supabase SQL Editor AFTER running supabase-schema.sql

-- Create recurring_shifts table
CREATE TABLE IF NOT EXISTS recurring_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT NOT NULL DEFAULT 'BOTH',
  required_skills TEXT[] DEFAULT '{}',
  required_volunteers INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create deleted_shift_occurrences table
CREATE TABLE IF NOT EXISTS deleted_shift_occurrences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recurring_shift_id UUID REFERENCES recurring_shifts(id) ON DELETE CASCADE,
  deleted_date DATE NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recurring_shift_id, deleted_date)
);

-- Add recurring_shift_id to existing shifts table
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS recurring_shift_id UUID REFERENCES recurring_shifts(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'BOTH';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_recurring_shifts_day ON recurring_shifts(day_of_week);
CREATE INDEX IF NOT EXISTS idx_recurring_shifts_active ON recurring_shifts(is_active);
CREATE INDEX IF NOT EXISTS idx_deleted_occurrences_recurring ON deleted_shift_occurrences(recurring_shift_id);
CREATE INDEX IF NOT EXISTS idx_deleted_occurrences_date ON deleted_shift_occurrences(deleted_date);
CREATE INDEX IF NOT EXISTS idx_shifts_recurring_id ON shifts(recurring_shift_id);

-- Add trigger for recurring_shifts updated_at
CREATE TRIGGER update_recurring_shifts_updated_at BEFORE UPDATE ON recurring_shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE recurring_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_shift_occurrences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recurring_shifts
CREATE POLICY "Admins can read all recurring shifts" ON recurring_shifts FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert recurring shifts" ON recurring_shifts FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update recurring shifts" ON recurring_shifts FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete recurring shifts" ON recurring_shifts FOR DELETE USING (is_admin());

-- Volunteers can read active recurring shifts
CREATE POLICY "Volunteers can read active recurring shifts" ON recurring_shifts FOR SELECT USING (
  is_active = true AND EXISTS (SELECT 1 FROM volunteers WHERE user_id = auth.uid())
);

-- RLS Policies for deleted_shift_occurrences
CREATE POLICY "Admins can manage deleted occurrences" ON deleted_shift_occurrences FOR ALL USING (is_admin());

-- Success message
SELECT 'Recurring shifts migration completed successfully!' AS message;
