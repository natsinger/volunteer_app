-- VolunteerFlow Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor to create the database tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create volunteers table
CREATE TABLE IF NOT EXISTS volunteers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'NOVICE',
  skill_level INTEGER NOT NULL DEFAULT 1 CHECK (skill_level IN (1, 2, 3)),
  frequency TEXT NOT NULL,
  preferred_location TEXT NOT NULL,
  skills TEXT[] DEFAULT '{}',
  preferred_days TEXT[] DEFAULT '{}',
  blackout_dates TEXT[] DEFAULT '{}',
  only_dates TEXT[] DEFAULT '{}',
  availability_status TEXT NOT NULL DEFAULT 'Active',
  serial_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  required_skills TEXT[] DEFAULT '{}',
  assigned_volunteer_id UUID REFERENCES volunteers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Assigned', 'Completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_volunteers_email ON volunteers(email);
CREATE INDEX IF NOT EXISTS idx_volunteers_availability ON volunteers(availability_status);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_assigned_volunteer ON shifts(assigned_volunteer_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to auto-update updated_at
CREATE TRIGGER update_volunteers_updated_at BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (customize based on your auth requirements)
-- For now, allow all operations (you can restrict this later with Supabase Auth)
CREATE POLICY "Enable read access for all users" ON volunteers FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON volunteers FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON volunteers FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON volunteers FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON shifts FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON shifts FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON shifts FOR DELETE USING (true);

-- Insert sample data (optional - you can skip this if you want to start fresh)
-- This mirrors your existing MOCK_VOLUNTEERS data

INSERT INTO volunteers (name, email, phone, role, skill_level, frequency, preferred_location, skills, preferred_days, blackout_dates, only_dates, availability_status, serial_number)
VALUES
  ('Alice Johnson', 'alice@example.com', '555-1001', 'EXPERIENCED', 3, 'ONCE_A_WEEK', 'HATACHANA',
   ARRAY['Teaching', 'Tech'], ARRAY['0', '1'], ARRAY[]::TEXT[], ARRAY[]::TEXT[], 'Active', 1),
  ('Bob Smith', 'bob@example.com', '555-1002', 'NOVICE', 1, 'TWICE_A_MONTH', 'DIZENGOFF',
   ARRAY['Cooking'], ARRAY['2_evening'], ARRAY[]::TEXT[], ARRAY[]::TEXT[], 'Active', 2),
  ('Charlie Davis', 'charlie@example.com', '555-1003', 'EXPERIENCED', 2, 'ONCE_A_MONTH', 'BOTH',
   ARRAY['Event Planning'], ARRAY['5'], ARRAY[]::TEXT[], ARRAY[]::TEXT[], 'Active', 3);

-- Success message
SELECT 'Database schema created successfully!' AS message;
