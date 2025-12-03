# Supabase Configuration Guide

This guide covers the necessary Supabase configuration changes to support the volunteer signup and authentication flow.

## Required Configuration Steps

### 1. Configure Redirect URLs

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to: **Authentication → URL Configuration**

#### Site URL
Set the Site URL to your application's main URL:
- **Development**: `http://localhost:5173`
- **Production**: `https://your-app-domain.com`

#### Redirect URLs
Add these redirect URLs to the allowlist:

**For Development:**
- `http://localhost:5173`
- `http://localhost:5173/**`
- `http://localhost:5173/auth/callback`

**For Production:**
- `https://your-app-domain.com`
- `https://your-app-domain.com/**`
- `https://your-app-domain.com/auth/callback`

> **Note**: The `**` wildcard allows all paths under your domain, which is required for Supabase auth redirects.

### 2. Email Template Configuration

1. Navigate to: **Authentication → Email Templates**
2. Select "Invite user" template

#### Recommended Template:
```html
<h2>Welcome to VolunteerFlow!</h2>
<p>Hi there,</p>
<p>You've been invited to join VolunteerFlow as a volunteer. Click the link below to set up your password and get started:</p>
<p><a href="{{ .ConfirmationURL }}">Set Up Your Account</a></p>
<p>This link will expire in 24 hours.</p>
<p>If you didn't expect this invitation, you can safely ignore this email.</p>
<p>Thank you,<br>The VolunteerFlow Team</p>
```

#### Update Other Email Templates:
- **Confirm signup**: For self-registration (if enabled)
- **Magic Link**: For passwordless login (if enabled)
- **Change Email Address**: For email changes
- **Reset Password**: Already configured via the app

### 3. Email Provider Settings

Supabase comes with a built-in email service, but it's rate-limited. For production:

1. Navigate to: **Project Settings → Auth → Email**
2. Choose your email provider:
   - SendGrid
   - AWS SES
   - Custom SMTP

#### Using Custom SMTP (Recommended):
```
SMTP Host: smtp.example.com
SMTP Port: 587
SMTP User: your-smtp-user
SMTP Password: your-smtp-password
Sender Email: noreply@your-domain.com
Sender Name: VolunteerFlow
```

### 4. Auth Provider Settings

1. Navigate to: **Authentication → Providers**
2. Ensure **Email** is enabled
3. Configure settings:

```
Enable Email provider: ✓
Confirm email: ✓ (Recommended for production)
Secure email change: ✓
```

### 5. Database Policies (Row Level Security)

Verify that the following RLS policies are in place:

```sql
-- Allow authenticated users to read volunteers table
CREATE POLICY "Volunteers can view their own data"
ON volunteers FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow authenticated users to update their own volunteer record
CREATE POLICY "Volunteers can update their own data"
ON volunteers FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Admins can do everything
CREATE POLICY "Admins can do everything on volunteers"
ON volunteers
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid()
  )
);
```

### 6. Edge Function Deployment (For Automated Invites)

See [VOLUNTEER_INVITE_SETUP.md](./VOLUNTEER_INVITE_SETUP.md) for detailed instructions on deploying the invite edge function.

Quick steps:
```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the edge function
supabase functions deploy invite-volunteer
```

## Testing the Configuration

### Test Redirect URLs
1. Logout of the application
2. Click "Forgot Password"
3. Enter your email
4. Check that the reset link redirects back to your application

### Test Email Invites
1. Login as admin
2. Go to Volunteers tab
3. Click the mail icon next to a volunteer
4. Choose invite method
5. Check volunteer's email inbox (and spam folder)

### Test Complete Signup Flow
1. Volunteer receives invite email
2. Clicks the link in email
3. Sets password
4. Redirected to application
5. Sees welcome screen
6. Completes profile (name, phone, address)
7. Accesses volunteer dashboard

## Troubleshooting

### Issue: "Invalid redirect URL"
**Solution**: Ensure your URL is added to the Redirect URLs list in Supabase. Check for typos and ensure the protocol (http/https) matches exactly.

### Issue: "Email not received"
**Solutions**:
- Check spam/junk folder
- Verify SMTP settings are correct
- Check rate limits on Supabase's built-in email service
- Review logs in Supabase Dashboard → Project API Logs

### Issue: "User not redirected after password reset"
**Solution**:
- Check that Site URL is set correctly
- Verify redirect URL includes your domain
- Check browser console for errors

### Issue: "Volunteer sees login page instead of welcome screen"
**Solutions**:
- Verify `user_id` is set on the volunteer record in database
- Check that volunteer's profile fields are empty (triggering welcome screen)
- Review browser console for errors

## Environment Variables

If you're using the edge function, ensure these environment variables are set in your Supabase project:

- `SUPABASE_URL`: Your project URL (automatically set)
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (automatically set)
- `SUPABASE_ANON_KEY`: Anonymous key (automatically set)

These are automatically available to edge functions when deployed via Supabase CLI.

## Security Checklist

- [ ] Confirm email is enabled for production
- [ ] Row Level Security (RLS) is enabled on all tables
- [ ] Service role key is never exposed to client-side code
- [ ] Redirect URLs are limited to your domains only
- [ ] Email templates don't contain sensitive information
- [ ] SMTP credentials are secured
- [ ] Rate limiting is configured for auth endpoints

## Next Steps

1. Complete this configuration in Supabase Dashboard
2. Deploy the edge function (see VOLUNTEER_INVITE_SETUP.md)
3. Test the complete flow in development
4. Update configuration for production environment
5. Monitor auth logs for any issues

## Support

For Supabase-specific issues:
- Supabase Documentation: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Support: https://supabase.com/support

For application issues:
- Check browser console for errors
- Review Supabase Project API Logs
- Check the VOLUNTEER_INVITE_SETUP.md troubleshooting section
