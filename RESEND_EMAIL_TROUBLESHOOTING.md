# Resend Email Configuration Troubleshooting

## Quick Diagnostic Steps

### 1. Check Supabase Email Settings

Go to your Supabase Dashboard and verify these settings:

**Path:** Project Settings → Auth → Email

#### Required Settings for Resend:

```
SMTP Host: smtp.resend.com
SMTP Port: 465 (SSL) or 587 (TLS)
SMTP User: resend
SMTP Password: re_YourAPIKey (your Resend API key)
Sender Email: noreply@yourdomain.com (must be verified in Resend)
Sender Name: VolunteerFlow
Enable Custom SMTP: ✓
```

**Important Notes:**
- The SMTP password should be your Resend API key (starts with `re_`)
- The sender email MUST be from a domain you've verified in Resend
- You cannot use @gmail.com, @yahoo.com, etc. with Resend

### 2. Verify Your Domain in Resend

If you haven't already:

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Add your domain
3. Add the DNS records they provide (SPF, DKIM, DMARC)
4. Wait for verification (can take a few minutes to hours)

**For Testing Without a Custom Domain:**
Resend gives you a free testing domain: `onboarding@resend.dev`
- You can use this for testing but it has limitations
- Emails may go to spam
- Not recommended for production

### 3. Test Email Delivery

#### Option A: Test via Supabase Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Invite User"
3. Enter a test email address
4. Check if the email arrives

#### Option B: Test via SQL

Run this in your Supabase SQL Editor:

```sql
-- Check if any auth users exist
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- Check for any recent invite attempts
SELECT * FROM auth.audit_log_entries
WHERE action = 'user_invited'
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Check Supabase Logs

1. Go to Supabase Dashboard → Project API
2. Look for any SMTP errors in the logs
3. Common errors:
   - "SMTP authentication failed" = Wrong API key
   - "Sender email not verified" = Domain not verified in Resend
   - "Connection timeout" = Wrong port or host

### 5. Common Resend Issues & Solutions

#### Issue 1: "Sender email not verified"
**Solution:**
```
1. Verify your domain in Resend
2. Or use onboarding@resend.dev for testing
3. Update Sender Email in Supabase to match verified domain
```

#### Issue 2: "SMTP authentication failed"
**Solution:**
```
1. Get a new API key from Resend Dashboard → API Keys
2. Use the FULL API key (starts with re_)
3. Update SMTP Password in Supabase with the new key
```

#### Issue 3: "Connection timeout"
**Solution:**
```
Try different port configurations:
- Port 465 with SSL
- Port 587 with TLS
- Port 2587 (Resend alternative)
```

#### Issue 4: Emails go to spam
**Solution:**
```
1. Verify SPF, DKIM, and DMARC DNS records in Resend
2. Use a real reply-to address
3. Avoid spammy content in email templates
4. Warm up your domain (send gradually increasing emails)
```

### 6. Resend-Specific Configuration

#### Getting Your Resend API Key:

1. Go to [Resend Dashboard](https://resend.com/api-keys)
2. Click "Create API Key"
3. Give it a name (e.g., "VolunteerFlow")
4. Select "Sending access"
5. Copy the API key (starts with `re_`)

#### Resend SMTP Configuration:

**Option 1: SSL (Port 465)**
```
Host: smtp.resend.com
Port: 465
User: resend
Password: re_YOUR_API_KEY
Encryption: SSL/TLS
```

**Option 2: TLS (Port 587)**
```
Host: smtp.resend.com
Port: 587
User: resend
Password: re_YOUR_API_KEY
Encryption: STARTTLS
```

**Option 3: Alternative Port (2587)**
```
Host: smtp.resend.com
Port: 2587
User: resend
Password: re_YOUR_API_KEY
Encryption: STARTTLS
```

### 7. Test Resend Connection Directly

You can test if Resend is working using curl:

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer re_YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "noreply@yourdomain.com",
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<p>This is a test email</p>"
  }'
```

If this works, the issue is with Supabase configuration.

### 8. Alternative: Use Resend API Instead of SMTP

If SMTP continues to fail, you can use Resend's API directly via an edge function:

Create: `supabase/functions/send-invite-email/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  const { email, inviteUrl, volunteerName } = await req.json()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'VolunteerFlow <noreply@yourdomain.com>',
      to: email,
      subject: 'Welcome to VolunteerFlow - Set Up Your Account',
      html: `
        <h2>Welcome to VolunteerFlow!</h2>
        <p>Hi ${volunteerName},</p>
        <p>You've been invited to join VolunteerFlow as a volunteer.</p>
        <p><a href="${inviteUrl}">Click here to set up your password</a></p>
        <p>This link will expire in 24 hours.</p>
      `,
    }),
  })

  const data = await res.json()
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Set the environment variable:
```bash
supabase secrets set RESEND_API_KEY=re_YOUR_API_KEY
```

### 9. Debugging Checklist

Run through this checklist:

- [ ] Resend API key is correct and active
- [ ] Domain is verified in Resend (or using onboarding@resend.dev)
- [ ] DNS records (SPF, DKIM, DMARC) are set correctly
- [ ] SMTP settings in Supabase are correct
- [ ] Port 465 or 587 is not blocked by firewall
- [ ] Sender email matches verified domain
- [ ] Email templates are enabled in Supabase
- [ ] Checked spam/junk folder
- [ ] Tested with multiple email providers (Gmail, Outlook, etc.)
- [ ] Supabase logs show no errors

### 10. Quick Test Commands

Run these to diagnose:

```sql
-- Check auth configuration
SELECT * FROM auth.config;

-- Check recent auth events
SELECT * FROM auth.audit_log_entries
WHERE action LIKE '%invite%'
ORDER BY created_at DESC
LIMIT 10;

-- Check if user was created
SELECT id, email, email_confirmed_at, invited_at
FROM auth.users
WHERE email = 'test@example.com';
```

## Recommended Next Steps

1. **Verify Resend Setup First:**
   - Check domain verification status
   - Test sending an email via Resend dashboard
   - Confirm API key is working

2. **Configure Supabase SMTP:**
   - Use exact settings from Resend documentation
   - Try port 587 first (most compatible)
   - Save and test

3. **Test Invite Flow:**
   - Use the manual invite method first
   - Check Supabase logs for errors
   - Verify email arrives (check spam)

4. **If Still Not Working:**
   - Share specific error messages from Supabase logs
   - Try the Resend API approach instead of SMTP
   - Contact Resend support for SMTP issues

## Need Help?

If you're still stuck, please provide:
- Error messages from Supabase Dashboard → Project API logs
- Your current SMTP configuration (hide the API key)
- Whether domain is verified in Resend
- Whether test email via Resend dashboard works
