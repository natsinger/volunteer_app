# Volunteer Invite System Setup Guide

This guide explains how to set up the automated volunteer invite system for VolunteerFlow.

## Overview

The volunteer invite system allows admins to send invitation emails to volunteers directly from the admin dashboard. When a volunteer receives an invite:
1. They get an email with a link to set their password
2. After setting their password, they're redirected to the app
3. They complete their profile information (name, phone, address)
4. They gain access to the volunteer portal

## Components

### 1. Frontend Components

- **InviteVolunteerModal**: UI for sending invites
- **VolunteerWelcome**: Onboarding screen for new volunteers
- **LoginForm**: Updated with "Forgot Password" functionality
- **AuthContext**: Added password reset support

### 2. Backend (Supabase Edge Function)

The `invite-volunteer` edge function handles:
- Creating Supabase auth accounts
- Sending invite emails via Supabase
- Linking auth users to volunteer records

## Setup Instructions

### Step 1: Deploy the Edge Function

1. Install Supabase CLI if you haven't already:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project (replace with your project ID):
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Deploy the edge function:
   ```bash
   supabase functions deploy invite-volunteer
   ```

5. The function will automatically have access to these environment variables:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key (has admin privileges)

### Step 2: Configure Supabase Auth Settings

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Navigate to: **Authentication → URL Configuration**
3. Set the **Site URL** to your application URL:
   - Development: `http://localhost:5173`
   - Production: `https://your-app-domain.com`
4. Add **Redirect URLs**:
   - `http://localhost:5173/**` (for development)
   - `https://your-app-domain.com/**` (for production)
5. Navigate to: **Authentication → Email Templates**
6. Customize the "Invite User" email template if desired

### Step 3: Test the Invite Flow

1. Start your application:
   ```bash
   npm run dev
   ```

2. Login as an admin

3. Go to the Volunteers tab

4. Click on a volunteer and select "Send Invite"

5. Choose "Automated Invite" method

6. Check that:
   - No errors appear
   - The volunteer receives an email
   - The email contains a password setup link

### Step 4: Test the Complete Signup Flow

1. Open the invite email as the volunteer
2. Click the password setup link
3. Set a new password
4. Verify you're redirected to the Welcome screen
5. Complete the profile information
6. Verify you can access the volunteer dashboard

## Manual Invite Method (Fallback)

If the automated method isn't working, you can use the manual method:

1. Click "Send Invite" on a volunteer
2. Select "Manual Invite via Dashboard"
3. Click "Copy Instructions"
4. Follow the instructions in your clipboard

### Manual Steps:
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Invite User"
3. Enter the volunteer's email
4. After sending, run this SQL in the SQL Editor:
   ```sql
   UPDATE volunteers
   SET user_id = (
     SELECT id FROM auth.users WHERE email = 'volunteer@example.com'
   )
   WHERE id = 'volunteer-id-here';
   ```

## Troubleshooting

### Issue: "Failed to send invite"

**Solution:**
- Check that the edge function is deployed: `supabase functions list`
- Check function logs: `supabase functions logs invite-volunteer`
- Verify the volunteer has a valid email address

### Issue: "User exists in auth but not linked"

**Solution:**
Run this SQL to link the user:
```sql
UPDATE volunteers
SET user_id = (
  SELECT id FROM auth.users WHERE email = 'volunteer@example.com'
)
WHERE email = 'volunteer@example.com';
```

### Issue: "Volunteer not redirected to welcome screen"

**Solution:**
- Check that the volunteer record exists in the database
- Verify the `user_id` is set on the volunteer record
- Check browser console for errors
- Verify the volunteer's profile fields (name, phone, address) are empty

### Issue: "Password reset email not received"

**Solution:**
- Check spam/junk folder
- Verify email template is enabled in Supabase Dashboard
- Check that SMTP is configured correctly in Supabase
- For development, check the Supabase Dashboard → Authentication → Users → Recent Activity

## Database Schema Requirements

The volunteers table must have a `user_id` column that references `auth.users(id)`:

```sql
ALTER TABLE volunteers
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_volunteers_user_id ON volunteers(user_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_email ON volunteers(email);
```

## Security Notes

⚠️ **Important Security Considerations:**

1. The edge function uses the `SUPABASE_SERVICE_ROLE_KEY` which has admin privileges
2. Never expose this key in client-side code
3. The edge function validates that requests come from authenticated admins (you may want to add this check)
4. Consider adding rate limiting to prevent abuse

### Adding Admin Authorization Check

To ensure only admins can call the function, add this to the edge function:

```typescript
// Get the JWT from the Authorization header
const authHeader = req.headers.get('Authorization')
if (!authHeader) {
  throw new Error('No authorization header')
}

// Create a client with the user's JWT to verify they're an admin
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: { Authorization: authHeader },
  },
})

const { data: { user } } = await supabaseClient.auth.getUser()
if (!user) {
  throw new Error('Unauthorized')
}

// Check if user is an admin
const { data: adminData } = await supabaseAdmin
  .from('admins')
  .select('id')
  .eq('user_id', user.id)
  .single()

if (!adminData) {
  throw new Error('User is not an admin')
}
```

## Next Steps

1. ✅ Deploy the edge function
2. ✅ Configure Supabase auth settings
3. ✅ Test the invite flow
4. ✅ Add the invite button to the admin dashboard
5. Consider customizing email templates
6. Set up monitoring and logging
7. Add admin authorization check to edge function

## Support

For issues or questions:
- Check Supabase function logs: `supabase functions logs invite-volunteer`
- Review browser console for client-side errors
- Check Supabase Dashboard → Authentication → Logs
