-- Admin Account Troubleshooting Script
-- Run this in Supabase SQL Editor to diagnose and fix admin login issues

-- ============================================
-- STEP 1: Check if admin emails exist in auth.users
-- ============================================
SELECT
  'Auth Users Check' as step,
  id as user_id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at,
  CASE
    WHEN email_confirmed_at IS NULL THEN '⚠️ Email not confirmed'
    WHEN last_sign_in_at IS NULL THEN '⚠️ Never signed in'
    ELSE '✅ Account active'
  END as status
FROM auth.users
WHERE email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
ORDER BY email;

-- ============================================
-- STEP 2: Check if admins exist in admins table
-- ============================================
SELECT
  'Admins Table Check' as step,
  a.id,
  a.email,
  a.user_id,
  CASE
    WHEN a.user_id IS NULL THEN '❌ No user_id linked'
    WHEN u.id IS NULL THEN '❌ user_id points to non-existent user'
    ELSE '✅ Properly linked'
  END as status
FROM admins a
LEFT JOIN auth.users u ON a.user_id = u.id
WHERE a.email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
ORDER BY a.email;

-- ============================================
-- STEP 3: Check for orphaned auth users (in auth but not in admins)
-- ============================================
SELECT
  'Orphaned Auth Users' as step,
  u.id as user_id,
  u.email,
  '⚠️ User exists in auth but not linked to admins table' as issue,
  'Run the FIX script below to link this user' as solution
FROM auth.users u
WHERE u.email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
  AND NOT EXISTS (
    SELECT 1 FROM admins a WHERE a.user_id = u.id
  );

-- ============================================
-- STEP 4: Check for orphaned admin records (in admins but user_id is null or invalid)
-- ============================================
SELECT
  'Orphaned Admin Records' as step,
  a.id,
  a.email,
  a.user_id,
  CASE
    WHEN a.user_id IS NULL THEN '⚠️ user_id is NULL - needs to be linked'
    ELSE '⚠️ user_id points to non-existent user'
  END as issue
FROM admins a
WHERE a.email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
  AND (a.user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = a.user_id
  ));

-- ============================================
-- FIX OPTION 1: Link existing auth users to admins table
-- ============================================
-- Run this if you have users in auth.users but they're not in the admins table
-- Uncomment the lines below and run them:

/*
INSERT INTO admins (email, user_id)
SELECT email, id
FROM auth.users
WHERE email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
  AND NOT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.users.id
  );
*/

-- ============================================
-- FIX OPTION 2: Update existing admin records with correct user_id
-- ============================================
-- Run this if admins exist but user_id is NULL or wrong
-- Uncomment and run:

/*
UPDATE admins a
SET user_id = u.id
FROM auth.users u
WHERE a.email = u.email
  AND a.email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
  AND (a.user_id IS NULL OR a.user_id != u.id);
*/

-- ============================================
-- STEP 5: Verify the fix
-- ============================================
-- After running the fix, run this to verify everything is correct:

SELECT
  'Final Verification' as step,
  a.email,
  a.user_id,
  u.email as auth_email,
  u.email_confirmed_at,
  CASE
    WHEN u.id IS NULL THEN '❌ No auth user exists - CREATE USER IN SUPABASE DASHBOARD'
    WHEN u.email_confirmed_at IS NULL THEN '⚠️ Email not confirmed - SEND PASSWORD RESET'
    WHEN a.user_id IS NULL THEN '❌ Not linked - RUN FIX OPTION 1 OR 2'
    ELSE '✅ Ready to login'
  END as status,
  CASE
    WHEN u.id IS NULL THEN 'Go to Supabase Dashboard > Authentication > Users > Invite User'
    WHEN u.email_confirmed_at IS NULL THEN 'Go to Supabase Dashboard > Authentication > Users > ... > Send Password Recovery'
    WHEN a.user_id IS NULL THEN 'Run one of the FIX OPTIONS above'
    ELSE 'User can login now!'
  END as action_needed
FROM admins a
LEFT JOIN auth.users u ON a.user_id = u.id
WHERE a.email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
ORDER BY a.email;

-- ============================================
-- NOTES:
-- ============================================
-- If no users appear in auth.users table:
--   1. Go to Supabase Dashboard > Authentication > Users
--   2. Click "Invite User"
--   3. Enter email: info@pnimet.org.il
--   4. User will receive email to set password
--   5. After user is created, run FIX OPTION 1 or 2 above
--
-- If password reset emails aren't working:
--   1. Go to Supabase Dashboard > Authentication > Email Templates
--   2. Check "Reset Password" template
--   3. Verify redirect URL is correct
--   4. Or manually set password in Dashboard > Users > ... > Reset Password
