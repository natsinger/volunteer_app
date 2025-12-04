-- COMPREHENSIVE DIAGNOSTIC QUERY
-- Run this in Supabase SQL Editor to diagnose the issue
-- Replace 'volunteer@email.com' with the actual volunteer's email

-- 1. Check if volunteer record exists and has user_id
SELECT
  'VOLUNTEER RECORD' as check_type,
  v.id as volunteer_id,
  v.name,
  v.email,
  v.user_id,
  CASE
    WHEN v.user_id IS NULL THEN '❌ PROBLEM: user_id is NULL'
    ELSE '✅ user_id is set'
  END as status
FROM volunteers v
WHERE v.email = 'volunteer@email.com';

-- 2. Check if auth user exists
SELECT
  'AUTH USER' as check_type,
  u.id as auth_user_id,
  u.email,
  '✅ Auth user exists' as status
FROM auth.users u
WHERE u.email = 'volunteer@email.com';

-- 3. Check if volunteer has any shift assignments
SELECT
  'ASSIGNMENTS' as check_type,
  COUNT(*) as assignment_count,
  CASE
    WHEN COUNT(*) = 0 THEN '❌ PROBLEM: No assignments in database'
    ELSE '✅ Assignments exist'
  END as status
FROM shift_assignments sa
JOIN volunteers v ON sa.volunteer_id = v.id
WHERE v.email = 'volunteer@email.com';

-- 4. Show all assignments for this volunteer (if any)
SELECT
  'ASSIGNMENT DETAILS' as check_type,
  sa.id as assignment_id,
  sa.shift_id,
  s.title as shift_title,
  s.date as shift_date,
  s.start_time,
  sa.status,
  '✅ Assignment record' as status
FROM shift_assignments sa
JOIN volunteers v ON sa.volunteer_id = v.id
JOIN shifts s ON sa.shift_id = s.id
WHERE v.email = 'volunteer@email.com'
ORDER BY s.date;

-- 5. Check RLS policies on shift_assignments table
SELECT
  'RLS POLICIES' as check_type,
  schemaname,
  tablename,
  policyname,
  '✅ Policy exists' as status
FROM pg_policies
WHERE tablename = 'shift_assignments';

-- 6. Check if RLS is enabled on shift_assignments
SELECT
  'RLS STATUS' as check_type,
  relname as table_name,
  CASE
    WHEN relrowsecurity THEN '✅ RLS is enabled'
    ELSE '❌ PROBLEM: RLS is disabled'
  END as status
FROM pg_class
WHERE relname = 'shift_assignments';

-- 7. Test if volunteer can access their assignments (simulate their view)
-- NOTE: This runs as the admin, so it will show data even if RLS would block it
SELECT
  'EXPECTED RESULTS' as check_type,
  sa.*,
  '✅ This is what volunteer should see' as status
FROM shift_assignments sa
WHERE sa.volunteer_id IN (
  SELECT id FROM volunteers WHERE email = 'volunteer@email.com'
);
