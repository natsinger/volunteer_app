-- Add name field to pending_users table
-- This allows us to capture the user's name during signup
-- and use it when creating their volunteer record

-- Add name column to pending_users table
ALTER TABLE pending_users ADD COLUMN IF NOT EXISTS name TEXT;

-- Add display_name column to store Google OAuth display names
ALTER TABLE pending_users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update the comment on the table
COMMENT ON TABLE pending_users IS 'Users who have signed up but are awaiting admin approval. Includes name captured during signup.';

-- Success message
SELECT 'Name field added to pending_users table successfully!' AS message;
SELECT 'Users can now provide their name during signup, which will be used as their default volunteer name.' AS info;
