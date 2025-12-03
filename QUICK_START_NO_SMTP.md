# Quick Start: Invite Volunteers Without SMTP Setup

## Method 1: Use Supabase Built-in Email (Easiest)

Supabase has email built-in that works without any configuration!

### Setup (30 seconds):

1. Go to Supabase Dashboard → Project Settings → Auth → Email
2. **Disable Custom SMTP** (toggle it OFF)
3. Save

That's it! Supabase will now send emails automatically.

**Limitations:**
- Rate limited to ~30 emails per hour
- May go to spam (but usually works fine)
- Good for testing and small deployments

### Test it:

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Invite User"
3. Enter a test email
4. Check inbox (and spam folder)

---

## Method 2: Manual Invite Method (No Email Needed)

This works without ANY email configuration:

### How it works:

1. **Admin creates volunteer in database** (via bulk upload or manual)
2. **Admin invites volunteer via Supabase Dashboard** (copy the invite link)
3. **Admin sends the link directly** (via text, WhatsApp, etc.)

### Step-by-Step:

1. In your admin dashboard, find the volunteer
2. Click the mail icon next to their name
3. Select "Manual Invite via Dashboard"
4. Copy the instructions
5. Go to Supabase Dashboard → Authentication → Users
6. Click "Invite User" and enter volunteer's email
7. Copy the invite link from the email Supabase sends YOU
8. Send that link to the volunteer however you want (text, WhatsApp, email)

---

## Method 3: Generate Magic Links (No Email Required)

Create a one-time setup link for volunteers:

### Implementation:

I can modify the app so you can:
1. Click a button to generate a setup link
2. Copy the link
3. Send it to the volunteer any way you want
4. Link allows them to set password and complete profile

This bypasses email entirely!

---

## Method 4: Simple Password Reset Links

For existing volunteers who forgot password:

1. Admin can generate reset links
2. Send them directly to volunteers
3. No email infrastructure needed

---

## Recommended Approach

**For immediate use:** Method 1 (Supabase built-in)
- Works right now
- No setup
- Fine for most use cases

**For better control:** Method 3 (Magic Links)
- I can implement this in ~10 minutes
- Most flexible
- No email dependencies

---

## Other SMTP Providers (If you want to try email again)

### Gmail SMTP (Free, Easy):
```
Host: smtp.gmail.com
Port: 587
User: your-email@gmail.com
Pass: (App Password - not your regular password)
```

### SendGrid (Free tier: 100 emails/day):
```
Host: smtp.sendgrid.net
Port: 587
User: apikey
Pass: (your SendGrid API key)
```

### Mailgun (Free tier: 5,000 emails/month):
```
Host: smtp.mailgun.org
Port: 587
User: (from Mailgun dashboard)
Pass: (from Mailgun dashboard)
```

---

## What would you like to do?

1. **Quick fix**: Use Supabase built-in email (disable Custom SMTP)
2. **Best solution**: I'll implement magic link generation (no email needed)
3. **Try different SMTP**: I can help configure Gmail, SendGrid, or Mailgun
4. **Manual process**: Use the manual invite method

Let me know and I'll get you working immediately!
