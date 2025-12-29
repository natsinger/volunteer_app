# Debugging: Volunteers Showing 0 Possible Shifts

## Problem
After modifying volunteer day preferences, the auto-scheduler shows "0 possible shifts" for many volunteers in the monthly statistics.

## Root Cause Analysis

The scheduler determines if a volunteer can work a shift by checking:

1. **Location compatibility** - Volunteer's preferred location must match shift location (or either can be "BOTH")
2. **Day preference** - The shift's day code must be in the volunteer's `preferredDays` array
3. **Blackout dates** - The shift date must NOT be in volunteer's `blackoutDates` array
4. **Only dates** - If set, the shift date MUST be in volunteer's `onlyDates` array

The most common cause of "0 possible shifts" is:
- **Empty or incorrectly formatted `preferredDays` array**

## Diagnostic Steps

### Step 1: Check Database Data

Run this SQL query in Supabase SQL Editor:

```sql
-- Check volunteer preferred_days data
SELECT
  id,
  name,
  email,
  preferred_days,
  array_length(preferred_days, 1) as num_days,
  preferred_location,
  availability_status
FROM volunteers
WHERE availability_status = 'Active'
ORDER BY name;
```

**What to look for:**
- `preferred_days` should be an array like: `{0,1,2_morning,5}`
- `num_days` should be greater than 0
- If `num_days` is NULL or 0, that volunteer will have 0 possible shifts

### Step 2: Run Comprehensive Diagnostic Query

Run the full diagnostic query in `diagnose-scheduler-issue.sql`:

```bash
# In Supabase SQL Editor, copy and paste the contents of:
cat diagnose-scheduler-issue.sql
```

This will show:
1. All active volunteers and their preferred days
2. Volunteers with empty preferred_days
3. Sample data showing the actual format
4. Upcoming shifts and their calculated day codes
5. A detailed compatibility check for one volunteer

### Step 3: Check Browser Console Logs

When you run the auto-scheduler:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Run the scheduler
4. Look for logs showing volunteers with "0 can work X/Y shifts" message

The scheduler logs detailed information about unassigned volunteers, including:
- Their location, days, blackout dates
- How many shifts they can theoretically work
- Why they can't work certain shifts

### Step 4: Use Debug Utility (Advanced)

Add this to your browser console while on the Admin Dashboard:

```javascript
// Copy the debug function from debug-volunteer-availability.ts
// Then run:
debugVolunteerAvailability(volunteers, shifts, targetMonth, targetYear);
```

This will show detailed breakdown of each volunteer's compatibility with each shift.

## Common Issues and Fixes

### Issue 1: Empty preferredDays Array

**Symptoms:**
- SQL query shows `num_days` as NULL or 0
- Browser console shows `preferred_days: []`

**Cause:**
- Volunteer clicked days but didn't save
- RLS policy prevented update
- Database update failed silently

**Fix:**
1. Have the volunteer log in and re-select their preferred days
2. Click "Save Changes"
3. Verify in database that the update persisted

### Issue 2: Wrong Data Format

**Symptoms:**
- SQL shows preferred_days but scheduler still fails
- Format looks different than expected (e.g., `{2}` instead of `{2_morning,2_evening}`)

**Cause:**
- Old data format from before Tuesday morning/evening split was added
- Manual database edits in wrong format

**Fix:**
1. Check the format - should be strings like: `{0,1,2_morning,2_evening,5}`
2. Update manually in database if needed:
   ```sql
   UPDATE volunteers
   SET preferred_days = '{0,1,2_morning,5}'  -- Example
   WHERE id = 'volunteer-id-here';
   ```

### Issue 3: RLS Policy Preventing Updates

**Symptoms:**
- Volunteer can see the day selection UI
- Days appear selected when editing
- After save, days revert to empty or previous values
- No error messages shown

**Cause:**
- RLS policy `"Volunteers can update own record"` might not allow updating `preferred_days`

**Check:**
```sql
-- In Supabase SQL Editor, check the policy
SELECT * FROM pg_policies
WHERE tablename = 'volunteers'
  AND policyname LIKE '%update%';
```

**Fix:**
Run the migration that allows frequency updates (it should also allow preferred_days):
```bash
# The fix-volunteer-update-frequency.sql should already allow this
# Verify it was applied in Supabase
```

### Issue 4: Scheduler Can't Read Volunteer Data

**Symptoms:**
- Admin can see volunteers in the list
- Scheduler runs but shows 0 volunteers or 0 possible shifts for all

**Cause:**
- RLS policy preventing admin from reading volunteers table
- `is_admin()` function not working correctly

**Check:**
```sql
-- Test if current user can read volunteers
SELECT COUNT(*) FROM volunteers;

-- Test if current user is recognized as admin
SELECT is_admin();
```

**Fix:**
Ensure the admin RLS policies exist:
```sql
-- Should exist in supabase-schema.sql
CREATE POLICY "Admins can read all volunteers"
  ON volunteers FOR SELECT
  USING (is_admin());
```

## Expected Data Format

### Volunteer preferredDays Format
```
Array of strings representing days:
- "0" = Sunday
- "1" = Monday
- "2_morning" = Tuesday before 4 PM (16:00)
- "2_evening" = Tuesday at or after 4 PM
- "3" = Wednesday
- "4" = Thursday
- "5" = Friday
- "6" = Saturday

Example: ["0", "1", "2_morning", "5"]
```

### How Day Codes Are Calculated
```typescript
const date = new Date(shift.date);
const dayOfWeek = date.getDay(); // 0-6

if (dayOfWeek === 2) {
  const hour = parseInt(shift.startTime.split(':')[0], 10);
  dayCode = hour < 16 ? '2_morning' : '2_evening';
} else {
  dayCode = dayOfWeek.toString();
}
```

## Quick Fix Checklist

- [ ] Run SQL diagnostic query to check preferred_days data
- [ ] Verify volunteers have non-empty preferredDays arrays
- [ ] Check that day format matches expected format (strings in array)
- [ ] Verify RLS policies allow volunteers to UPDATE their own record
- [ ] Verify RLS policies allow admins to SELECT from volunteers table
- [ ] Check browser console for detailed scheduler logs
- [ ] Have affected volunteers re-select and save their day preferences
- [ ] Test scheduler again after fixes

## Contact Points in Code

**Volunteer Dashboard - Day Selection UI:**
- File: `components/VolunteerDashboard.tsx`
- Lines: 589-601 (toggleDay function)
- Lines: 1253-1267 (day selector buttons)

**Scheduler Logic - Availability Check:**
- File: `services/geminiService.ts`
- Lines: 51-70 (canVolunteerWorkShift function)
- Lines: 32-44 (getShiftDayCode function)
- Lines: 188-213 (canWorkShift helper in scheduling algorithm)

**Database Update:**
- File: `App.tsx`
- Lines: 166-192 (updateVolunteer function)

**Data Mapping:**
- File: `lib/mappers.ts`
- Line: 72 (preferredDays: row.preferred_days || [])
- Line: 92 (preferred_days: volunteer.preferredDays || [])

## Next Steps

1. Run the SQL diagnostic query first
2. Share the results to identify the specific issue
3. Apply the appropriate fix from the list above
4. Re-test the scheduler
5. If issue persists, check browser console logs for more details
