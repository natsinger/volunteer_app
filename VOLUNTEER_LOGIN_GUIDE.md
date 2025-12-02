# Volunteer Login Fix Guide

## Overview

This guide helps you fix volunteer login issues. Volunteers need two things to log in:
1. An entry in `auth.users` (Supabase's authentication table)
2. An entry in `volunteers` table with `user_id` linked to their auth user

## Step-by-Step Process

### Step 1: Diagnose the Problem

1. Open Supabase Dashboard → SQL Editor
2. Copy and run **Section 1.1** from `volunteer-login-fix.sql`
3. Look at the `status` column for each volunteer:
   - ✅ **LINKED & CONFIRMED** = Good, can login
   - ❌ **NO AUTH USER LINKED** = Need to create auth user and link
   - ⚠️ **LINKED BUT AUTH USER MISSING** = Data inconsistency, need to fix
   - ⚠️ **AUTH USER NOT CONFIRMED** = Need to confirm email

### Step 2: Fix Based on Status

#### If status is "NO AUTH USER LINKED":

**Option A: They already have a Supabase account**
1. Run **Section 2.1** to preview matches
2. Run **Section 2.2** to auto-link volunteers with existing auth users
3. Skip to Step 3 to verify

**Option B: They don't have a Supabase account yet**
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Invite User"
3. Enter volunteer's email
4. Click "Send Invitation"
5. After they're created, run **Section 2.2** to link them
6. Go to Step 3 to verify

#### If status is "AUTH USER NOT CONFIRMED":

1. Go to Supabase Dashboard → Authentication → Users
2. Find the volunteer by email
3. Click the three dots (⋮) → Send confirmation email
4. OR manually confirm: Click user → Enable "Email Confirmed"

#### If status is "LINKED BUT AUTH USER MISSING":

This means data corruption. To fix:
1. Note the volunteer's email
2. Check if auth user exists with different email
3. If not, create new auth user (Option B above)
4. Run **Section 2.2** to re-link

### Step 3: Verify Everything Works

1. Run **Section 5.1** to see final status
2. Run **Section 5.2** to see summary counts
3. All volunteers should show "✅ READY TO LOGIN"

### Step 4: Set Passwords (If Needed)

For volunteers to login, they need passwords:

**Method 1: Password Reset Email (Recommended)**
1. Run **Section 4.1** to get list of emails
2. For each volunteer:
   - Supabase Dashboard → Authentication → Users
   - Find user by email
   - Click three dots (⋮) → Send password reset email
3. Volunteer clicks link in email and sets password

**Method 2: Magic Link Login (Easier)**
- Volunteers can login using "magic link" (passwordless)
- They just enter their email, get a link via email, click it
- No password needed!

## Common Scenarios

### Scenario: "I uploaded volunteers via bulk upload but they can't login"

**Problem**: Bulk upload creates volunteer records but doesn't create auth users

**Fix**:
1. Run **Section 1.2** to see which volunteers have no auth
2. For each volunteer:
   - Supabase Dashboard → Authentication → Users → Invite User
   - Enter their email
3. Run **Section 2.2** to link them all
4. Send password reset emails (**Section 4.1**)

### Scenario: "Volunteer says password doesn't work"

**Fix**:
1. Find volunteer in Supabase Dashboard → Authentication → Users
2. Click three dots (⋮) → Send password reset email
3. They'll get email to set new password

### Scenario: "I want to bulk fix ALL volunteers at once"

**Fix**:
1. First, invite all volunteers who don't have auth accounts:
   - Run **Section 3.1** to get list
   - For each email, invite via Dashboard
2. Run **Section 2.2** - this auto-links everyone with matching emails
3. Run **Section 5.1** to verify
4. Send password reset emails to everyone (**Section 4.1**)

## Quick Reference Commands

### Link all volunteers with existing auth users:
```sql
UPDATE volunteers v
SET user_id = au.id
FROM auth.users au
WHERE v.email = au.email
  AND v.user_id IS NULL;
```

### See who needs fixing:
```sql
SELECT v.name, v.email, v.user_id
FROM volunteers v
LEFT JOIN auth.users au ON v.user_id = au.id
WHERE v.user_id IS NULL OR au.id IS NULL;
```

### Check final status:
```sql
SELECT
  COUNT(*) as total,
  COUNT(au.id) as with_auth,
  COUNT(*) - COUNT(au.id) as needs_fixing
FROM volunteers v
LEFT JOIN auth.users au ON v.user_id = au.id;
```

## Important Notes

⚠️ **Cannot create auth users via SQL**
- Supabase `auth.users` table requires special handling
- Must use Dashboard or Auth API to create users
- Passwords need proper bcrypt hashing
- Email confirmation must be handled

✅ **Can link existing users via SQL**
- If auth user exists, SQL can link it to volunteer record
- Safe and fast for bulk operations

🔐 **Two ways for volunteers to login**:
1. **Email + Password**: Requires password reset email first
2. **Magic Link**: Passwordless, just click link from email (easier!)

## Testing Volunteer Login

After fixing:
1. Open your app in incognito window
2. Try logging in as a volunteer (not admin)
3. Enter volunteer's email
4. Choose "magic link" or "password" method
5. Should receive email and be able to login

## Need Help?

If you're still having issues:
1. Check volunteer's email is correct in both tables
2. Verify email is confirmed in auth.users
3. Check RLS policies allow volunteers to read their own data
4. Test with a single volunteer first before bulk fixing
