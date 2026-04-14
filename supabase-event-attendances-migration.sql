-- Event Attendances Migration
-- Allows volunteers to mark themselves as attending events

CREATE TABLE IF NOT EXISTS event_attendances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  event_date DATE NOT NULL, -- The specific date the volunteer is attending (important for recurring events)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Each volunteer can only attend a specific event on a specific date once
  UNIQUE(event_id, volunteer_id, event_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_attendances_event ON event_attendances(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendances_volunteer ON event_attendances(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_event_attendances_date ON event_attendances(event_date);

-- Enable Row Level Security
ALTER TABLE event_attendances ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can do everything
CREATE POLICY "Admins can read all event attendances" ON event_attendances FOR SELECT USING (is_admin());
CREATE POLICY "Admins can insert event attendances" ON event_attendances FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can delete event attendances" ON event_attendances FOR DELETE USING (is_admin());

-- Volunteers can read all attendances (to see who else is attending)
CREATE POLICY "Volunteers can read event attendances" ON event_attendances FOR SELECT USING (
  EXISTS (SELECT 1 FROM volunteers WHERE user_id = auth.uid())
);

-- Volunteers can insert their own attendance
CREATE POLICY "Volunteers can insert own attendance" ON event_attendances FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM volunteers WHERE id = volunteer_id AND user_id = auth.uid())
);

-- Volunteers can delete their own attendance (un-attend)
CREATE POLICY "Volunteers can delete own attendance" ON event_attendances FOR DELETE USING (
  EXISTS (SELECT 1 FROM volunteers WHERE id = volunteer_id AND user_id = auth.uid())
);

SELECT 'Event attendances migration completed successfully!' AS message;
