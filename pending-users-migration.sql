-- Create pending_users table to track users waiting for approval
-- This replaces the auth.admin.listUsers() approach which requires service role

CREATE TABLE IF NOT EXISTS pending_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'email', -- 'email' or 'google'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pending_users_user_id ON pending_users(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_users_email ON pending_users(email);

-- Enable RLS
ALTER TABLE pending_users ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all pending users
CREATE POLICY "Admins can read all pending users"
  ON pending_users FOR SELECT
  USING (is_admin());

-- Allow anyone to insert their own pending user record (during signup)
CREATE POLICY "Users can insert their own pending record"
  ON pending_users FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow admins to delete pending users (when approving/rejecting)
CREATE POLICY "Admins can delete pending users"
  ON pending_users FOR DELETE
  USING (is_admin());

-- Automatic cleanup: Create a function to remove from pending_users when added to admins or volunteers
CREATE OR REPLACE FUNCTION cleanup_pending_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove from pending_users when user is added to admins or volunteers
  DELETE FROM pending_users WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger when user is added to admins table
CREATE TRIGGER cleanup_pending_on_admin_insert
  AFTER INSERT ON admins
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_pending_user();

-- Trigger when user is added to volunteers table
CREATE TRIGGER cleanup_pending_on_volunteer_insert
  AFTER INSERT ON volunteers
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_pending_user();

-- Migrate existing users who are in auth but not in admins/volunteers
-- Note: This requires service role access, so run this manually in Supabase SQL Editor
--
-- INSERT INTO pending_users (user_id, email, provider)
-- SELECT
--   au.id,
--   au.email,
--   COALESCE(au.app_metadata->>'provider', 'email') as provider
-- FROM auth.users au
-- LEFT JOIN admins a ON au.id = a.user_id
-- LEFT JOIN volunteers v ON au.id = v.user_id
-- WHERE a.user_id IS NULL AND v.user_id IS NULL
-- ON CONFLICT (user_id) DO NOTHING;
