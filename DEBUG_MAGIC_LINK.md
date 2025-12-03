# Debug Magic Link Issue

## Step 1: Check Browser Console

Open your browser console (F12) and try clicking "Generate Magic Link" again.
Look for any errors in red.

Common errors:
- "Function not found" = Edge function not deployed or wrong name
- "CORS error" = CORS issue (should be fixed in our function)
- "Network error" = Supabase URL or key issue

## Step 2: Check Supabase Function Logs

Run this command to see what's happening:

```bash
supabase functions logs invite-volunteer --follow
```

Then click "Generate Magic Link" and watch the logs.

## Step 3: Test the Edge Function Directly

Run this to test the function:

```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/invite-volunteer' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "volunteerId": "test-id",
    "volunteerName": "Test User",
    "generateLinkOnly": true
  }'
```

Replace:
- YOUR_PROJECT_REF with your Supabase project reference
- YOUR_ANON_KEY with your anon key from Supabase Dashboard → Project Settings → API

## Step 4: Common Issues

### Issue: "Function not found"
**Solution:**
```bash
# List deployed functions
supabase functions list

# If not listed, deploy again
supabase functions deploy invite-volunteer
```

### Issue: No error but no link appears
**Check the response in browser console Network tab:**
1. Open DevTools → Network tab
2. Click "Generate Magic Link"
3. Find the request to "invite-volunteer"
4. Check the Response

### Issue: "Invalid JWT" or "Unauthorized"
**This means the function can't access Supabase admin features**

Check your Supabase project settings:
- Dashboard → Project Settings → API
- Make sure you have both ANON_KEY and SERVICE_ROLE_KEY

## Step 5: Quick Fix - Add Debug Logging

I'll add console logging to help us see what's happening.
