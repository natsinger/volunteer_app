-- Availability confirmations: one row per volunteer per target month, recording
-- that their availability is up to date for that month.
--   source = 'updated'   -> the volunteer actually saved availability changes
--   source = 'confirmed' -> the volunteer pressed "confirm, nothing changed"
-- Solves two reported problems:
--   1. Volunteers with no changes never pressed Save, so the admin saw them as
--      "didn't update" — now they can confirm without a fake save.
--   2. The admin badge relied on volunteers.updated_at, which bumps on ANY
--      profile touch (avatar, phone) — this table tracks availability freshness
--      per target month explicitly.

-- gen_random_uuid() is built into Postgres (unlike uuid_generate_v4(), which
-- lives in the uuid-ossp extension and is not on the CLI migration search path)
CREATE TABLE IF NOT EXISTS availability_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  target_month INTEGER NOT NULL CHECK (target_month BETWEEN 1 AND 12),
  target_year INTEGER NOT NULL CHECK (target_year BETWEEN 2024 AND 2100),
  source TEXT NOT NULL DEFAULT 'confirmed' CHECK (source IN ('confirmed', 'updated')),
  confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One confirmation per volunteer per month (upserts refresh it)
  UNIQUE (volunteer_id, target_month, target_year)
);

CREATE INDEX IF NOT EXISTS idx_avail_conf_month ON availability_confirmations(target_year, target_month);
CREATE INDEX IF NOT EXISTS idx_avail_conf_volunteer ON availability_confirmations(volunteer_id);

ALTER TABLE availability_confirmations ENABLE ROW LEVEL SECURITY;

-- Admins can read everything (powers the per-month "updated" indicator)
CREATE POLICY "Admins can read availability confirmations" ON availability_confirmations
  FOR SELECT USING (is_admin());

-- Volunteers manage their own confirmations
-- (UPDATE policy is required because upsert ON CONFLICT DO UPDATE needs it)
CREATE POLICY "Volunteers can read own confirmations" ON availability_confirmations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM volunteers WHERE id = volunteer_id AND user_id = auth.uid())
  );

-- Writes are limited to the active scheduling window (current or next month):
-- the client only ever asks about next month, but the table is reachable over
-- PostgREST, so without this a volunteer could pre-confirm every future month
-- and permanently game the admin freshness badge.
CREATE POLICY "Volunteers can insert own confirmations" ON availability_confirmations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM volunteers WHERE id = volunteer_id AND user_id = auth.uid())
    AND make_date(target_year, target_month, 1) IN (
      date_trunc('month', now())::date,
      (date_trunc('month', now()) + interval '1 month')::date
    )
  );

CREATE POLICY "Volunteers can update own confirmations" ON availability_confirmations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM volunteers WHERE id = volunteer_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM volunteers WHERE id = volunteer_id AND user_id = auth.uid())
    AND make_date(target_year, target_month, 1) IN (
      date_trunc('month', now())::date,
      (date_trunc('month', now()) + interval '1 month')::date
    )
  );
