# Authentication Setup Guide

This guide will help you set up authentication for your VolunteerFlow application.

## Prerequisites

1. A Supabase project (create one at https://supabase.com)
2. Your `.env` file configured with Supabase credentials

## Step 1: Configure Environment Variables

Make sure your `.env` file has the following variables set:

```env
VITE_SUPABASE_URL=your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_GEMINI_API_KEY=your-gemini-api-key-here
```

You can find these values in your Supabase project:
- Go to https://app.supabase.com
- Select your project
- Navigate to Settings > API
- Copy the Project URL and anon/public key

## Step 2: Run the Database Schema

1. Open your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `supabase-schema.sql`
4. Paste and run it in the SQL Editor

This will create:
- `admins` table for admin users
- `volunteers` table with auth support
- `shifts` table
- Row Level Security (RLS) policies
- Helper functions for role checking

## Step 3: Create Admin Users

You need to create the two admin accounts in Supabase Auth:

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Users
3. Click "Invite User"
4. Enter the email: `info@pnimet.org.il`
5. A confirmation email will be sent to create their password
6. Repeat for: `omri@pnimeet.org.il`

### Option B: Using SQL (for testing)

If you want to create users with passwords directly for testing:

```sql
-- You'll need to do this via the Supabase dashboard or API
-- as direct SQL user creation requires admin privileges
```

## Step 4: Link Admin Users to Admins Table

After creating the auth users, you need to link them to the admins table:

1. Go to Authentication > Users in Supabase dashboard
2. Copy the UUID for each admin user
3. Run this SQL in the SQL Editor:

```sql
-- Replace <user_id_1> and <user_id_2> with the actual UUIDs from step 2
INSERT INTO admins (email, user_id)
VALUES
  ('info@pnimet.org.il', '<user_id_1>'),
  ('omri@pnimeet.org.il', '<user_id_2>');
```

## Step 5: Create Volunteer Accounts

For each volunteer in your system:

### Option A: Via Admin Dashboard (Recommended)
Once logged in as an admin, you can:
1. Add volunteers through the admin portal
2. Each volunteer entry will need a corresponding auth account

### Option B: Manual Creation
1. Create auth user in Supabase Dashboard (Authentication > Users > Invite User)
2. Get the user's UUID
3. When creating the volunteer record, include the `user_id` field

Example SQL:
```sql
INSERT INTO volunteers (
  user_id,
  name,
  email,
  phone,
  role,
  skill_level,
  frequency,
  preferred_location,
  skills,
  preferred_days,
  availability_status
) VALUES (
  '<auth_user_id>',
  'John Doe',
  'john@example.com',
  '555-0000',
  'NOVICE',
  1,
  'ONCE_A_WEEK',
  'HATACHANA',
  ARRAY['Teaching'],
  ARRAY['0', '1'],
  'Active'
);
```

## Step 6: Test the Authentication

1. Run your development server: `npm run dev`
2. You should see the login portal selection screen
3. Select "Admin Portal"
4. Try logging in with one of the admin accounts
5. You should be redirected to the admin dashboard

## Security Features

The authentication system includes:

- **Row Level Security (RLS)**: Database-level security ensuring users can only access their own data
- **Role-based Access**: Admins have full access, volunteers can only see their own records
- **Secure Authentication**: Powered by Supabase Auth with industry-standard security
- **Password Reset**: Built-in password reset functionality via Supabase

## Troubleshooting

### "User found in auth but not in admin or volunteer tables"
- Make sure you've created the link between the auth user and the admins/volunteers table
- Check that the `user_id` in the admins or volunteers table matches the UUID from auth.users

### "Missing Supabase environment variables"
- Verify your `.env` file exists and has the correct variables
- Make sure variable names start with `VITE_` prefix (required for Vite)
- Restart your development server after changing `.env`

### Login fails with no error message
- Check the browser console for detailed error messages
- Verify RLS policies are set up correctly
- Ensure the user exists in both auth.users AND admins/volunteers tables

### Can't see any data after logging in
- Check that you've added the user to either the admins or volunteers table
- Verify RLS policies allow the user to read data
- Check browser console for permission errors

## Next Steps

After setting up authentication:
1. Test both admin and volunteer logins
2. Ensure volunteers can only see their own data
3. Verify admins can manage all volunteers and shifts
4. Set up password reset flows if needed
5. Configure email templates in Supabase for better UX

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
