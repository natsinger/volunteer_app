-- Helper script to link admin auth users to admins table
--
-- USAGE:
-- 1. First, create the admin users in Supabase Dashboard:
--    Authentication > Users > Invite User
--    - info@pnimet.org.il
--    - omri@pnimeet.org.il
--
-- 2. Get their user IDs from the Authentication > Users page
--
-- 3. Replace the <UUID> placeholders below with the actual user IDs
--
-- 4. Run this SQL in Supabase SQL Editor

-- Insert admin records
-- Replace these UUIDs with the actual auth.users IDs from your Supabase dashboard
INSERT INTO admins (email, user_id)
VALUES
  ('info@pnimet.org.il', '<UUID_FOR_INFO_PNIMET>'),
  ('omri@pnimeet.org.il', '<UUID_FOR_OMRI_PNIMEET>')
ON CONFLICT (email) DO NOTHING;

-- Verify the admins were created
SELECT
  a.email,
  a.user_id,
  u.email as auth_email,
  u.created_at as user_created_at
FROM admins a
LEFT JOIN auth.users u ON u.id = a.user_id;
