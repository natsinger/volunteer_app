# Automated Monthly Reminder System

This feature sends automatic reminders to volunteers to update their preferences 7 days before the end of each month.

## Current Implementation

### ✅ What's Already Working:

1. **Visual Indicators** - Admins can see which volunteers updated preferences in last 7 days
   - Green "Updated" badge next to volunteer names
   - Summary banner showing count of recently updated volunteers
   - "Go to Auto-Schedule" button when volunteers are active

2. **Manual Reminders** - Admin can manually send reminders
   - "Send Reminder" button in Volunteers tab
   - Sends to all active volunteers
   - Shows confirmation with count sent

### 🔧 Setup Required for Automated Emails:

## Option 1: Supabase Edge Function with Cron (Recommended)

### Step 1: Deploy the Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy monthly-reminders
```

### Step 2: Set up Cron Trigger

In your Supabase Dashboard:
1. Go to **Database** → **Functions**
2. Find `monthly-reminders` function
3. Click **Add Trigger** → **Cron**
4. Set schedule: `0 10 * * *` (runs daily at 10 AM)
   - The function checks internally if it's 7 days before month end
5. Save the trigger

### Step 3: Configure Email Service

Choose one of these email services:

#### Option A: Resend (Easiest)

1. Sign up at https://resend.com
2. Get your API key
3. Add to Supabase secrets:
   ```bash
   supabase secrets set RESEND_API_KEY=your_api_key
   supabase secrets set APP_URL=https://your-app-url.com
   ```
4. Uncomment the Resend code in `supabase/functions/monthly-reminders/index.ts`

#### Option B: SendGrid

1. Sign up at https://sendgrid.com
2. Get your API key
3. Add to Supabase secrets:
   ```bash
   supabase secrets set SENDGRID_API_KEY=your_api_key
   supabase secrets set APP_URL=https://your-app-url.com
   ```
4. Update the Edge Function to use SendGrid API

#### Option C: Supabase Auth Emails

Use Supabase's built-in email system (requires custom SMTP setup in Supabase dashboard)

## Option 2: Manual Reminders Only (Current Setup)

If you prefer to send reminders manually:

1. Navigate to **Volunteers** tab in Admin Dashboard
2. Click **Send Reminder** button
3. Confirm to send emails to all active volunteers

**Recommended Schedule:**
- Send manually on the 23rd of each month (for 30-day months)
- Send manually on the 24th (for 31-day months)

## Customizing the Email Content

Edit `/services/reminderService.ts` → `generateReminderEmail()` function:

```typescript
function generateReminderEmail(volunteerName: string): string {
  return `
    Hi ${volunteerName},

    Your custom message here...
  `;
}
```

## Testing

### Test the Edge Function:
```bash
# Test locally
supabase functions serve monthly-reminders

# Invoke manually
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-reminders \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Test Manual Reminders:
1. Log in as admin
2. Go to Volunteers tab
3. Click "Send Reminder"
4. Check console for logs

## Monitoring

- **Edge Function Logs**: Supabase Dashboard → Functions → Logs
- **Email Delivery**: Check your email service dashboard
- **Volunteer Activity**: Green badges show who updated preferences

## Troubleshooting

### Reminders not sending:
1. Check Edge Function logs
2. Verify email service API key
3. Confirm cron trigger is active
4. Test manually via dashboard

### Wrong timing:
- Function checks if it's exactly 7 days before month end
- Adjust the condition in `index.ts` if needed

### Email delivery issues:
- Verify DNS records for your domain
- Check spam folders
- Review email service quota limits
