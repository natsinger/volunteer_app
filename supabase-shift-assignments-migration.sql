-- Shift Assignments and Switch Requests Migration
-- This migration adds support for:
-- 1. Multiple volunteers per shift (shift_assignments table)
-- 2. Shift switch requests between volunteers

-- Create shift_assignments table to support multiple volunteers per shift
CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shift_id, volunteer_id)
);

-- Create shift_switch_requests table for volunteers to request shift swaps
CREATE TABLE IF NOT EXISTS shift_switch_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  requesting_volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  target_volunteer_id UUID REFERENCES volunteers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift ON shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_volunteer ON shift_assignments(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_status ON shift_assignments(status);
CREATE INDEX IF NOT EXISTS idx_switch_requests_shift ON shift_switch_requests(shift_id);
CREATE INDEX IF NOT EXISTS idx_switch_requests_requesting ON shift_switch_requests(requesting_volunteer_id);
CREATE INDEX IF NOT EXISTS idx_switch_requests_target ON shift_switch_requests(target_volunteer_id);
CREATE INDEX IF NOT EXISTS idx_switch_requests_status ON shift_switch_requests(status);

-- Create updated_at triggers
CREATE TRIGGER update_shift_assignments_updated_at BEFORE UPDATE ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shift_switch_requests_updated_at BEFORE UPDATE ON shift_switch_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_switch_requests ENABLE ROW LEVEL SECURITY;

-- Shift Assignments Policies
-- Admins can do everything
CREATE POLICY "Admins can read all shift assignments" ON shift_assignments FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert shift assignments" ON shift_assignments FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can update shift assignments" ON shift_assignments FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete shift assignments" ON shift_assignments FOR DELETE USING (is_admin());

-- Volunteers can read their own assignments
CREATE POLICY "Volunteers can read own assignments" ON shift_assignments FOR SELECT USING (
  volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
);

-- Volunteers can read all assignments (to see who else is working)
CREATE POLICY "Volunteers can read all assignments" ON shift_assignments FOR SELECT USING (
  EXISTS (SELECT 1 FROM volunteers WHERE user_id = auth.uid())
);

-- Shift Switch Requests Policies
-- Admins can do everything
CREATE POLICY "Admins can read all switch requests" ON shift_switch_requests FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update switch requests" ON shift_switch_requests FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can delete switch requests" ON shift_switch_requests FOR DELETE USING (is_admin());

-- Volunteers can read requests involving them
CREATE POLICY "Volunteers can read relevant switch requests" ON shift_switch_requests FOR SELECT USING (
  requesting_volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
  OR target_volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
  OR target_volunteer_id IS NULL  -- Open requests visible to all
);

-- Volunteers can create switch requests for their own shifts
CREATE POLICY "Volunteers can create switch requests" ON shift_switch_requests FOR INSERT WITH CHECK (
  requesting_volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM shift_assignments
    WHERE shift_id = shift_switch_requests.shift_id
    AND volunteer_id = requesting_volunteer_id
  )
);

-- Volunteers can update their own requests (to cancel)
CREATE POLICY "Volunteers can update own requests" ON shift_switch_requests FOR UPDATE USING (
  requesting_volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
);

-- Volunteers can accept switch requests targeting them
CREATE POLICY "Volunteers can accept targeted requests" ON shift_switch_requests FOR UPDATE USING (
  target_volunteer_id IN (SELECT id FROM volunteers WHERE user_id = auth.uid())
);

SELECT 'Shift assignments and switch requests migration completed successfully!' AS message;
