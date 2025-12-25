-- Debug script to check pending users setup
-- Run this in Supabase SQL Editor to diagnose the issue

-- 1. Check if the pending_users table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'pending_users'
) as table_exists;

-- 2. Check current RLS policies on pending_users
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'pending_users';

-- 3. Check if there are any records in pending_users (as admin)
SELECT * FROM pending_users;

-- 4. Check if there are users in auth.users who aren't in admins or volunteers
SELECT
  au.id,
  au.email,
  au.created_at,
  CASE
    WHEN a.user_id IS NOT NULL THEN 'admin'
    WHEN v.user_id IS NOT NULL THEN 'volunteer'
    ELSE 'pending'
  END as status
FROM auth.users au
LEFT JOIN admins a ON au.id = a.user_id
LEFT JOIN volunteers v ON au.id = v.user_id
ORDER BY au.created_at DESC
LIMIT 10;

-- 5. Try to manually insert a test record (replace with actual user_id from query above)
-- INSERT INTO pending_users (user_id, email, provider)
-- SELECT id, email, 'email'
-- FROM auth.users
-- WHERE email = 'test@example.com'
-- ON CONFLICT (user_id) DO NOTHING;
