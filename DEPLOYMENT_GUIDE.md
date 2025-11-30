# VolunteerFlow - Production Deployment Guide

This guide will walk you through deploying your VolunteerFlow application to production using **Supabase** (database) and **Vercel** (hosting).

---

## 📋 Prerequisites

- [x] Supabase account created at https://supabase.com
- [x] Vercel account created at https://vercel.com
- [x] Google Gemini API key from https://aistudio.google.com/app/apikey
- [x] Your application is working locally

---

## 🗄️ Part 1: Supabase Database Setup

### Step 1: Create a New Supabase Project

1. Go to https://app.supabase.com
2. Click **"New Project"**
3. Fill in the details:
   - **Name**: volunteerflow (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine to start
4. Click **"Create new project"**
5. Wait 2-3 minutes for the project to be provisioned

### Step 2: Run the Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the entire contents of `supabase-schema.sql` from this project
4. Paste it into the SQL Editor
5. Click **"Run"** (or press Ctrl/Cmd + Enter)
6. You should see: "Database schema created successfully!"

### Step 3: Get Your Supabase Credentials

1. In your Supabase project, go to **Settings** → **API**
2. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)
3. Save these - you'll need them for Vercel

### Step 4: Verify Your Database

1. Go to **Table Editor** (left sidebar)
2. You should see two tables:
   - `volunteers` (with 3 sample volunteers)
   - `shifts` (empty for now)
3. ✅ Your database is ready!

---

## 🚀 Part 2: Vercel Deployment

### Step 1: Push Your Code to GitHub

If you haven't already pushed your code to GitHub:

```bash
# Your code is already on branch: claude/deploy-supabase-vercel-018ZpAWWLh5DZCoockb1Uvrd
# The deployment files are ready to be committed
```

### Step 2: Connect Vercel to Your Repository

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository (you may need to authorize Vercel first)
4. Select your repository: `natsinger/volunteer_app`

### Step 3: Configure Project Settings

Vercel should auto-detect your Vite project. Configure these settings:

**Framework Preset:** Vite
**Root Directory:** `./` (leave as default)
**Build Command:** `npm run build`
**Output Directory:** `dist`

### Step 4: Add Environment Variables

In the Vercel project setup, scroll to **"Environment Variables"** and add:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL from Part 1, Step 3 |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key from Part 1, Step 3 |
| `VITE_GEMINI_API_KEY` | Your Google Gemini API key |

**Important:** Make sure all three variables are set for **Production**, **Preview**, and **Development** environments.

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes for the build to complete
3. You'll get a URL like: `https://volunteer-app-xxxx.vercel.app`
4. ✅ Your app is live!

---

## 🧪 Part 3: Testing Your Deployment

### Test 1: Access the Application

1. Open your Vercel URL
2. You should see the VolunteerFlow login screen
3. Click **"Admin Portal"** or **"Volunteer Portal"**

### Test 2: Verify Database Connection

1. Log in as Admin
2. Go to the **Volunteers** tab
3. You should see the 3 sample volunteers from the database
4. Try editing a volunteer and saving - changes should persist after page refresh

### Test 3: Test Gemini AI

1. In Admin portal, go to **Shifts** tab
2. Create a few test shifts
3. Use the **"Generate Schedule"** feature
4. If it works, your Gemini API key is configured correctly

---

## 🔄 Part 4: Continuous Deployment

Your deployment is now automatic! Every time you push to your GitHub repository:

1. Vercel will automatically detect the changes
2. Build and deploy a new version
3. Your production site will update in 2-3 minutes

---

## 🛠️ Part 5: Optional - Local Development Setup

To work on your app locally with the production database:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your credentials:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_GEMINI_API_KEY=your-gemini-key
   ```

3. Run locally:
   ```bash
   npm install
   npm run dev
   ```

4. Your local app will now use the production Supabase database

---

## 📊 Part 6: Monitoring & Management

### Supabase Dashboard

- **Table Editor**: View and manually edit data
- **SQL Editor**: Run custom queries
- **Database**: Monitor performance
- **Logs**: View real-time database logs

### Vercel Dashboard

- **Deployments**: View deployment history
- **Analytics**: Monitor site traffic
- **Logs**: View application logs
- **Domains**: Add custom domain (optional)

---

## 🔒 Part 7: Security Recommendations

### Immediate Actions (Before Going Live)

1. **Update Supabase RLS Policies**
   - The current schema allows all operations (for simplicity)
   - Consider implementing proper authentication
   - Restrict who can modify volunteer/shift data

2. **Secure Your API Keys**
   - Never commit `.env` files to GitHub
   - Rotate keys if accidentally exposed
   - Use Vercel's environment variable encryption

3. **Set Up Authentication** (Future Enhancement)
   - Add Supabase Auth for admin login
   - Implement email-based volunteer login
   - Add role-based access control

---

## 🐛 Troubleshooting

### Build Fails on Vercel

**Error:** "Missing environment variables"
- Go to Vercel → Project Settings → Environment Variables
- Verify all three variables are set
- Redeploy

### Can't Connect to Database

**Error:** "Failed to fetch" or CORS errors
- Verify your Supabase URL is correct
- Check that RLS policies are enabled
- Verify the anon key is correct

### Gemini AI Not Working

**Error:** "API Key is missing"
- Check `VITE_GEMINI_API_KEY` is set in Vercel
- Verify the key is valid at https://aistudio.google.com
- Check browser console for errors

### Data Not Persisting

- Verify you're looking at the production site (not localhost)
- Check Supabase Table Editor to see if data is being written
- Look at Vercel logs for errors

---

## 📞 Need Help?

- **Supabase Docs**: https://supabase.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **Vite Docs**: https://vitejs.dev/guide/

---

## ✅ Deployment Checklist

- [ ] Supabase project created
- [ ] Database schema executed successfully
- [ ] Supabase credentials saved
- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] All environment variables added
- [ ] First deployment successful
- [ ] Application loads in browser
- [ ] Database connection working
- [ ] Gemini AI scheduling working
- [ ] Custom domain added (optional)

---

**Congratulations! Your VolunteerFlow app is now in production! 🎉**
