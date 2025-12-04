# Debugging Volunteer Shifts Not Showing

## Step 1: Check Browser Console for Errors

Open the browser console (F12) on the volunteer dashboard and look for:
- Red error messages
- Database query errors
- RLS (Row Level Security) policy errors

Common errors:
- "permission denied for table shift_assignments" → RLS policy issue
- "relation shift_assignments does not exist" → migration didn't run
- Network errors → Supabase connection issue

## Step 2: Verify Assignments Were Written to Database

In Supabase Dashboard → Table Editor:
1. Go to `shift_assignments` table
2. Check if there are any rows
3. Look for the volunteer's ID in the `volunteer_id` column

If the table is empty → "Apply to Database" didn't work
If the table has data → RLS policy issue or volunteer ID mismatch

## Step 3: Check Volunteer Authentication

The volunteer needs to be logged in with the correct account:
1. The email they're logged in with must match a volunteer in the `volunteers` table
2. Their `user_id` in the `volunteers` table must match their `auth.uid()` from Supabase Auth

To verify in Supabase:
```sql
-- Check if volunteer exists and has correct user_id
SELECT v.id, v.name, v.email, v.user_id
FROM volunteers v
WHERE v.email = 'volunteer@email.com';  -- Replace with actual email

-- Check their auth user
SELECT id, email FROM auth.users WHERE email = 'volunteer@email.com';

-- The user_id column in volunteers should match the id from auth.users
```

## Step 4: Test RLS Policies

In Supabase SQL Editor, run as the volunteer:
```sql
-- This should return rows if everything is configured correctly
SELECT * FROM shift_assignments
WHERE volunteer_id IN (
  SELECT id FROM volunteers WHERE user_id = auth.uid()
);
```

## Step 5: Manual Test

If all else fails, temporarily disable RLS to test:
```sql
ALTER TABLE shift_assignments DISABLE ROW LEVEL SECURITY;
```

Refresh volunteer dashboard. If shifts appear, it's an RLS issue.

**IMPORTANT:** Re-enable RLS after testing:
```sql
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
```

## Step 6: Check the Volunteer's ID

The most common issue: The volunteer record doesn't have a user_id set.

Check in Supabase:
```sql
SELECT id, name, email, user_id FROM volunteers WHERE email = 'volunteer@email.com';
```

If `user_id` is NULL, you need to set it:
```sql
UPDATE volunteers
SET user_id = (SELECT id FROM auth.users WHERE email = 'volunteer@email.com')
WHERE email = 'volunteer@email.com';
```
