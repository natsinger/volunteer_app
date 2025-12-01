# Admin Password Fix Guide

Follow these steps to diagnose and fix admin login issues.

---

## 🔍 Step 1: Run Diagnostic Script

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project

2. **Open SQL Editor**
   - Click **SQL Editor** in left sidebar
   - Click **New Query**

3. **Run Diagnostic Script**
   - Open file: `admin-account-troubleshooting.sql`
   - Copy the entire contents
   - Paste into SQL Editor
   - Click **Run**

4. **Read the Results**
   - Look at each step's output
   - Pay attention to status messages (✅ ⚠️ ❌)
   - Note which "action_needed" appears in final verification

---

## 🔧 Step 2: Fix Based on Diagnostic Results

### **Scenario A: User doesn't exist in auth.users**

**Status:** `❌ No auth user exists`

**Fix:**
1. Go to **Authentication** → **Users** in Supabase Dashboard
2. Click **"Invite User"**
3. Enter email: `info@pnimet.org.il`
4. Click **Send Invite**
5. Check the email inbox - user will receive password setup email
6. After user sets password, go back to SQL Editor
7. Uncomment and run **FIX OPTION 1** from the diagnostic script:
   ```sql
   INSERT INTO admins (email, user_id)
   SELECT email, id
   FROM auth.users
   WHERE email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
     AND NOT EXISTS (
       SELECT 1 FROM admins WHERE user_id = auth.users.id
     );
   ```

---

### **Scenario B: User exists but not linked to admins table**

**Status:** `⚠️ User exists in auth but not linked to admins table`

**Fix:**
1. Go to SQL Editor in Supabase Dashboard
2. Uncomment and run **FIX OPTION 1**:
   ```sql
   INSERT INTO admins (email, user_id)
   SELECT email, id
   FROM auth.users
   WHERE email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
     AND NOT EXISTS (
       SELECT 1 FROM admins WHERE user_id = auth.users.id
     );
   ```
3. Run the "Final Verification" query again
4. Should now show `✅ Ready to login`

---

### **Scenario C: Admin record exists but user_id is NULL**

**Status:** `⚠️ user_id is NULL - needs to be linked`

**Fix:**
1. Go to SQL Editor in Supabase Dashboard
2. Uncomment and run **FIX OPTION 2**:
   ```sql
   UPDATE admins a
   SET user_id = u.id
   FROM auth.users u
   WHERE a.email = u.email
     AND a.email IN ('info@pnimet.org.il', 'omri@pnimeet.org.il')
     AND (a.user_id IS NULL OR a.user_id != u.id);
   ```
3. Run the "Final Verification" query again
4. Should now show `✅ Ready to login`

---

### **Scenario D: User exists but email not confirmed**

**Status:** `⚠️ Email not confirmed - SEND PASSWORD RESET`

**Fix:**
1. Go to **Authentication** → **Users** in Supabase Dashboard
2. Find the user (info@pnimet.org.il)
3. Click the **three dots (⋮)** menu
4. Click **"Send Password Recovery"**
5. User will receive email with password reset link
6. User sets new password
7. Try logging in again

---

### **Scenario E: Wrong password**

If everything is set up correctly but login still fails:

**Option 1: Password Reset via Email**
1. On the login page, click "Forgot Password" (if available)
2. Or send password recovery from Supabase Dashboard (see Scenario D)

**Option 2: Manual Password Reset (Admin)**
1. Go to **Authentication** → **Users** in Supabase Dashboard
2. Find the user
3. Click **three dots (⋮)** → **"Send Magic Link"**
4. User can login with magic link (no password needed)

**Option 3: Delete and Recreate**
1. Go to **Authentication** → **Users**
2. Delete the problematic user
3. Click **"Invite User"** to create fresh account
4. Run FIX OPTION 1 or 2 to link to admins table

---

## ✅ Step 3: Verify Login Works

1. **Try logging in:**
   - Go to your app
   - Select **Admin Portal**
   - Email: `info@pnimet.org.il`
   - Password: (the one set via email)

2. **If login fails:**
   - Check browser console for errors (F12 → Console)
   - Look for error message on screen
   - Check Supabase logs: **Logs** → **Auth Logs** in dashboard

3. **Common errors:**
   - "Invalid login credentials" → Wrong password or user doesn't exist
   - "User found in auth but not in admin or volunteer tables" → Run FIX OPTION 1 or 2
   - "Email not confirmed" → Send password recovery email

---

## 🎯 Quick Fix Commands

**Check if admin exists:**
```sql
SELECT * FROM admins WHERE email = 'info@pnimet.org.il';
```

**Check if user exists in auth:**
```sql
SELECT id, email, email_confirmed_at
FROM auth.users
WHERE email = 'info@pnimet.org.il';
```

**Link admin to existing user:**
```sql
UPDATE admins
SET user_id = (SELECT id FROM auth.users WHERE email = 'info@pnimet.org.il')
WHERE email = 'info@pnimet.org.il';
```

---

## 📞 Still Having Issues?

If none of the above works:

1. **Check RLS Policies:**
   ```sql
   -- See if admin can read their own record
   SELECT * FROM admins WHERE email = 'info@pnimet.org.il';
   ```

2. **Check the is_admin() function:**
   ```sql
   -- Run as the logged-in user
   SELECT is_admin();
   ```

3. **Check auth logs** in Supabase Dashboard for specific error messages

4. **Verify environment variables:**
   - Check that Vercel has correct VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

---

## 💡 Prevention

To avoid this in the future:

1. Always create auth user first (in Dashboard)
2. Then link to admins table immediately
3. Test login before closing the setup
4. Document passwords in secure password manager
