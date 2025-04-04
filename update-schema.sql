-- Update users table to add password_hash column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL;

-- Update users table to add verification columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_token UUID,
ADD COLUMN IF NOT EXISTS token_expires TIMESTAMP;

-- Update users table to add created_at column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update users table to add user_id column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT gen_random_uuid();
