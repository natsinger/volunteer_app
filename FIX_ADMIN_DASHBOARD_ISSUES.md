# Fix Admin Dashboard Issues

This guide addresses two critical issues with the admin dashboard:
1. **"Infinite recursion detected in policy for relation 'volunteers'"** error when saving volunteer edits
2. **Shift requests not appearing** in the admin dashboard

## Root Cause

Both issues stem from **infinite recursion in the RLS (Row Level Security) policy** for the volunteers table.

The problematic policy in `security-fixes-migration.sql` uses recursive subqueries:

```sql
-- PROBLEM: This queries the same table the policy is applied to!
role = (SELECT role FROM volunteers WHERE id = volunteers.id AND user_id = auth.uid())
```

When any operation queries the volunteers table (admin updates OR shift request RLS checks), it triggers this policy, which queries volunteers again, creating an infinite loop.

## The Fix

Apply the migration file `fix-volunteer-rls-infinite-recursion.sql` which:

1. **Removes the recursive subquery policy**
2. **Creates a simpler policy** that allows volunteer self-updates
3. **Adds a database trigger** to prevent volunteers from changing protected fields (role, skill_level, frequency, availability_status, serial_number)
4. **Maintains admin full access** without restrictions

This approach eliminates recursion while maintaining security.

## How to Apply the Fix

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to: **SQL Editor** (in the left sidebar)

### Step 2: Run the Migration

1. Click **"New query"**
2. Copy the entire contents of `fix-volunteer-rls-infinite-recursion.sql`
3. Paste into the SQL editor
4. Click **"Run"** or press `Ctrl+Enter` (Windows/Linux) / `Cmd+Enter` (Mac)

### Step 3: Verify Success

You should see three success messages:
```
✓ Volunteer RLS infinite recursion fix applied successfully!
✓ Volunteers can now update their own records (personal info only)
✓ Admins can update all volunteer fields without restriction
```

### Step 4: Test the Fixes

#### Test 1: Volunteer Update (Admin Dashboard)
1. Login as admin
2. Go to **Volunteers** tab
3. Click **Edit** on any volunteer
4. Change any field (name, email, role, frequency, etc.)
5. Click **Save Changes**
6. ✅ Should save successfully without "infinite recursion" error

#### Test 2: Shift Switch Requests Display
1. Have a volunteer create a shift switch request (from volunteer dashboard)
2. As admin, go to **Switch Requests** tab
3. Click **Refresh**
4. ✅ Should see all pending shift requests

## Technical Details

### What Changed

**Before:**
```sql
-- Used recursive subqueries (caused infinite loop)
CREATE POLICY "Volunteers can update own personal info" ON volunteers FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  role = (SELECT role FROM volunteers WHERE id = volunteers.id AND user_id = auth.uid())
  -- More recursive checks...
);
```

**After:**
```sql
-- Simple policy + trigger-based validation (no recursion)
CREATE POLICY "Volunteers can update own record" ON volunteers FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Trigger prevents volunteers from changing protected fields
CREATE TRIGGER enforce_volunteer_update_restrictions
BEFORE UPDATE ON volunteers
FOR EACH ROW
EXECUTE FUNCTION validate_volunteer_self_update();
```

### Why This Works

1. **No recursive queries**: The policy no longer queries the volunteers table
2. **Trigger-based validation**: The trigger intercepts updates and reverts protected field changes for non-admin users
3. **Admin access unchanged**: The `is_admin()` function is checked in the trigger, allowing admins full access
4. **Shift request policies work**: Since volunteers table queries no longer cause recursion, shift_switch_requests policies work correctly

### Protected Fields

These fields can only be changed by admins:
- `role` (NOVICE, EXPERIENCED, EXPERT)
- `skill_level` (1, 2, 3)
- `frequency` (ONCE_A_WEEK, TWICE_A_MONTH, etc.)
- `availability_status` (Active, Inactive, etc.)
- `serial_number`

Volunteers can change:
- `name`
- `email`
- `phone`
- `preferred_location`
- `preferred_days`
- `blackout_dates`
- `only_dates`

## Troubleshooting

### Issue: Migration fails with "policy already exists"

**Solution**: The old policy may already be dropped. Check the error message and manually drop conflicting policies:

```sql
DROP POLICY IF EXISTS "Volunteers can update own personal info" ON volunteers;
DROP POLICY IF EXISTS "Volunteers can update own record" ON volunteers;
```

Then re-run the migration.

### Issue: Still getting infinite recursion error

**Solution**:
1. Verify the migration completed successfully (check for success messages)
2. Clear your browser cache and reload the admin dashboard
3. Check Supabase logs for any other RLS policy errors

### Issue: Shift requests still not showing

**Solution**:
1. Verify the migration was applied
2. Check browser console for errors
3. Try clicking the "Refresh" button in the Switch Requests tab
4. Verify shift switch requests exist in the database:
   ```sql
   SELECT COUNT(*) FROM shift_switch_requests;
   ```

### Issue: Volunteers can change protected fields

**Solution**: Verify the trigger was created successfully:

```sql
SELECT * FROM pg_trigger WHERE tgname = 'enforce_volunteer_update_restrictions';
```

If missing, manually create the trigger by running the relevant section of the migration.

## Support

If you continue to experience issues:
1. Check Supabase Project Logs: Dashboard → Logs → API Logs
2. Check browser console for JavaScript errors
3. Verify all previous migrations were applied correctly
4. Ensure you're logged in as an admin (check the `admins` table)

## Related Files

- `fix-volunteer-rls-infinite-recursion.sql` - The migration file
- `security-fixes-migration.sql` - Original problematic migration
- `supabase-shift-assignments-migration.sql` - Shift requests RLS policies
- `/home/user/volunteer_app/components/AdminDashboard.tsx:386` - Volunteer edit handler
- `/home/user/volunteer_app/components/AdminDashboard.tsx:1317` - Switch requests tab

## Prevention

To avoid similar issues in the future:
1. **Never use subqueries in RLS policies that query the same table**
2. **Test RLS policies with both admin and non-admin users**
3. **Use triggers or application-level validation** for complex field-level restrictions
4. **Check Supabase logs** after deploying new policies
