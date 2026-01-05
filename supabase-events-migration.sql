-- Events System Migration
-- This migration adds support for scheduling events that are visible to all volunteers

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  emoji TEXT,
  image_url TEXT,

  -- Date/Recurrence fields
  is_recurring BOOLEAN DEFAULT false,
  date DATE, -- For one-time events
  recurrence_day_of_week INTEGER, -- 0 = Sunday, 6 = Saturday (for recurring events)
  recurrence_start_date DATE, -- When recurring pattern starts
  recurrence_end_date DATE, -- When recurring pattern ends

  -- Publishing
  is_published BOOLEAN DEFAULT false,

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_published ON events(is_published);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_recurring ON events(is_recurring);
CREATE INDEX IF NOT EXISTS idx_events_recurrence_day ON events(recurrence_day_of_week);

-- Create updated_at trigger
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can do everything
CREATE POLICY "Admins can read all events" ON events FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert events" ON events FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update events" ON events FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete events" ON events FOR DELETE USING (is_admin());

-- Volunteers can read published events
CREATE POLICY "Volunteers can read published events" ON events FOR SELECT USING (
  is_published = true AND EXISTS (SELECT 1 FROM volunteers WHERE user_id = auth.uid())
);

SELECT 'Events system migration completed successfully!' AS message;
