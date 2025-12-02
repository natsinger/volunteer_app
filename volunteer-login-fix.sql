-- ============================================
-- VOLUNTEER LOGIN FIX - DIAGNOSTIC & REPAIR
-- ============================================
-- This script helps diagnose and fix volunteer login issues
-- Run each section step by step

-- ============================================
-- SECTION 1: DIAGNOSTIC - CHECK CURRENT STATE
-- ============================================

-- 1.1: List all volunteers and their auth status
SELECT
  v.id as volunteer_id,
  v.name,
  v.email,
  v.user_id,
  CASE
    WHEN v.user_id IS NULL THEN '❌ NO AUTH USER LINKED'
    WHEN au.id IS NULL THEN '⚠️  LINKED BUT AUTH USER MISSING'
    WHEN au.email_confirmed_at IS NULL THEN '⚠️  AUTH USER NOT CONFIRMED'
    ELSE '✅ LINKED & CONFIRMED'
  END as status,
  au.email as auth_email,
  au.created_at as auth_created_at,
  au.last_sign_in_at
FROM volunteers v
LEFT JOIN auth.users au ON v.user_id = au.id
ORDER BY v.name;

-- 1.2: Find volunteers without auth users
SELECT
  v.id,
  v.name,
  v.email,
  v.user_id
FROM volunteers v
LEFT JOIN auth.users au ON v.user_id = au.id
WHERE v.user_id IS NULL OR au.id IS NULL;

-- 1.3: Find auth users that might be volunteers (by email match)
SELECT
  au.id as auth_user_id,
  au.email,
  au.created_at,
  au.email_confirmed_at,
  v.id as volunteer_id,
  v.name as volunteer_name
FROM auth.users au
LEFT JOIN volunteers v ON au.email = v.email
WHERE au.email IN (SELECT email FROM volunteers)
ORDER BY au.email;


-- ============================================
-- SECTION 2: FIX OPTION 1 - LINK EXISTING AUTH USERS
-- ============================================
-- Use this if volunteers already have auth accounts but aren't linked

-- 2.1: Preview what would be linked (SAFE - just shows matches)
SELECT
  v.id as volunteer_id,
  v.name,
  v.email,
  au.id as auth_user_id,
  'UPDATE volunteers SET user_id = ''' || au.id || ''' WHERE id = ''' || v.id || ''';' as fix_command
FROM volunteers v
INNER JOIN auth.users au ON v.email = au.email
WHERE v.user_id IS NULL;

-- 2.2: Actually link them (RUN THIS to fix)
-- This finds volunteers with matching email addresses in auth.users and links them
UPDATE volunteers v
SET user_id = au.id
FROM auth.users au
WHERE v.email = au.email
  AND v.user_id IS NULL;

-- 2.3: Verify the linking worked
SELECT
  v.name,
  v.email,
  v.user_id,
  au.email as auth_email
FROM volunteers v
INNER JOIN auth.users au ON v.user_id = au.id;


-- ============================================
-- SECTION 3: FIX OPTION 2 - CREATE AUTH USERS
-- ============================================
-- For volunteers who don't have any auth account yet
-- NOTE: This requires Supabase Dashboard or Auth API - cannot be done via SQL alone

-- 3.1: Get list of volunteers who need auth accounts created
SELECT
  v.name,
  v.email,
  '👉 Create auth user for: ' || v.name || ' (' || v.email || ')' as action_needed
FROM volunteers v
LEFT JOIN auth.users au ON v.email = au.email
WHERE au.id IS NULL;

-- 3.2: After creating auth users in Supabase Dashboard, run this to link them
-- (Same as 2.2 above - links by email match)
UPDATE volunteers v
SET user_id = au.id
FROM auth.users au
WHERE v.email = au.email
  AND v.user_id IS NULL;


-- ============================================
-- SECTION 4: PASSWORD MANAGEMENT
-- ============================================

-- 4.1: For each volunteer, generate a password reset link
-- Copy the volunteer's email and use Supabase Dashboard:
-- Authentication → Users → Find user → Send password reset email

SELECT
  v.name,
  v.email,
  au.id as auth_user_id,
  '👉 Send password reset to: ' || v.email as action
FROM volunteers v
INNER JOIN auth.users au ON v.user_id = au.id
ORDER BY v.name;

-- 4.2: Alternative - Set a temporary password directly (ADVANCED)
-- WARNING: This creates a hashed password 'TempPassword123!'
-- Use only if you understand bcrypt hashing and Supabase auth

-- First, you need to generate a bcrypt hash for your temporary password
-- Use this site: https://bcrypt-generator.com/ with cost 10
-- Or use this SQL function if available:
-- SELECT crypt('TempPassword123!', gen_salt('bf'));

-- Example (you need to replace 'BCRYPT_HASH_HERE' with actual hash):
-- UPDATE auth.users
-- SET encrypted_password = 'BCRYPT_HASH_HERE'
-- WHERE email = 'volunteer@example.com';


-- ============================================
-- SECTION 5: VERIFY EVERYTHING WORKS
-- ============================================

-- 5.1: Final check - all volunteers should be linked and confirmed
SELECT
  v.name,
  v.email,
  CASE
    WHEN v.user_id IS NULL THEN '❌ NO USER_ID'
    WHEN au.id IS NULL THEN '❌ AUTH USER MISSING'
    WHEN au.email_confirmed_at IS NULL THEN '⚠️  EMAIL NOT CONFIRMED'
    ELSE '✅ READY TO LOGIN'
  END as login_status,
  au.last_sign_in_at
FROM volunteers v
LEFT JOIN auth.users au ON v.user_id = au.id
ORDER BY
  CASE
    WHEN v.user_id IS NULL THEN 1
    WHEN au.id IS NULL THEN 2
    WHEN au.email_confirmed_at IS NULL THEN 3
    ELSE 4
  END,
  v.name;

-- 5.2: Count summary
SELECT
  COUNT(*) as total_volunteers,
  COUNT(v.user_id) as volunteers_with_user_id,
  COUNT(au.id) as volunteers_with_auth_user,
  COUNT(au.email_confirmed_at) as volunteers_confirmed,
  COUNT(*) - COUNT(au.email_confirmed_at) as volunteers_need_fixing
FROM volunteers v
LEFT JOIN auth.users au ON v.user_id = au.id;


-- ============================================
-- SECTION 6: BULK CREATE VOLUNTEERS WITH AUTH
-- ============================================
-- If you want to create new volunteers with auth accounts

-- 6.1: This is a template for adding a new volunteer
-- You'll need to:
-- A) Create auth user in Supabase Dashboard (Authentication → Users → Invite User)
-- B) Then run this SQL with the auth user's ID

-- Example:
-- INSERT INTO volunteers (
--   id, user_id, name, email, phone,
--   frequency, skill_level, availability, skills
-- ) VALUES (
--   gen_random_uuid(),
--   'AUTH_USER_ID_HERE',  -- Get this from auth.users after creating the user
--   'John Doe',
--   'john@example.com',
--   '+972-50-123-4567',
--   'Weekly',
--   2,
--   '{"Sunday": true, "Monday": true, "Tuesday": false}',
--   '["Food Distribution", "Setup"]'
-- );


-- ============================================
-- QUICK REFERENCE - COMMON SCENARIOS
-- ============================================

-- SCENARIO A: Volunteer exists but can't login
-- 1. Run Section 1.1 to see their status
-- 2. If "NO AUTH USER LINKED" → Run Section 3.1 to see if they have auth user, then 2.2 to link
-- 3. If "LINKED BUT AUTH USER MISSING" → Something wrong, check auth.users table
-- 4. If "AUTH USER NOT CONFIRMED" → Send confirmation email from Dashboard

-- SCENARIO B: Need to reset volunteer password
-- 1. Run Section 4.1 to get their email
-- 2. Go to Supabase Dashboard → Authentication → Users → Find user → Send password reset

-- SCENARIO C: Bulk fix all volunteers
-- 1. Run Section 2.2 to auto-link all volunteers with matching emails
-- 2. Run Section 5.1 to see who still needs fixing
-- 3. For remaining, manually invite via Dashboard then run 2.2 again

-- ============================================
-- END OF SCRIPT
-- ============================================
