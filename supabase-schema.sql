-- VolunteerFlow Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor to create the database tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create admins table to track admin users
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create volunteers table
CREATE TABLE IF NOT EXISTS volunteers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_email ON volunteers(email);
CREATE INDEX IF NOT EXISTS idx_volunteers_user_id ON volunteers(user_id);
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
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admins table policies
CREATE POLICY "Admins can read their own record" ON admins FOR SELECT USING (user_id = auth.uid());

-- Volunteers table policies
-- Admins can do everything
CREATE POLICY "Admins can read all volunteers" ON volunteers FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert volunteers" ON volunteers FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update volunteers" ON volunteers FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete volunteers" ON volunteers FOR DELETE USING (is_admin());

-- Volunteers can read and update their own record
CREATE POLICY "Volunteers can read own record" ON volunteers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Volunteers can update own record" ON volunteers FOR UPDATE USING (user_id = auth.uid());

-- Shifts table policies
-- Admins can do everything with shifts
CREATE POLICY "Admins can read all shifts" ON shifts FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert shifts" ON shifts FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update shifts" ON shifts FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete shifts" ON shifts FOR DELETE USING (is_admin());

-- Volunteers can read all shifts
CREATE POLICY "Volunteers can read shifts" ON shifts FOR SELECT USING (
  EXISTS (SELECT 1 FROM volunteers WHERE user_id = auth.uid())
);

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

-- IMPORTANT: After running this schema, you need to:
-- 1. Create admin users in Supabase Auth (info@pnimet.org.il and omri@pnimeet.org.il)
--    via the Supabase Dashboard > Authentication > Users > Invite User
-- 2. After creating the admin users, insert their records into the admins table:
--    INSERT INTO admins (email, user_id) VALUES ('info@pnimet.org.il', '<user_id_from_auth>');
--    INSERT INTO admins (email, user_id) VALUES ('omri@pnimeet.org.il', '<user_id_from_auth>');
-- 3. For volunteers, when they are added via the admin dashboard, create auth users for them
--    and link via the user_id field
