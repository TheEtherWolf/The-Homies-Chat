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

-- Add friend_code column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS friend_code VARCHAR(20);

-- Create the friends table (switched from friendships based on error message)
CREATE TABLE IF NOT EXISTS friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id_1 UUID REFERENCES users(id),
    user_id_2 UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    friend_code VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_friendship UNIQUE(user_id_1, user_id_2)
);

-- Add the friend_code column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_code VARCHAR(20);

-- Add recipient_id column to messages table for direct messages if it doesn't exist
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id);

-- Add channel column to messages table if it doesn't exist
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'general';

-- Create an index to speed up message queries by channel
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);

-- Create an index for faster DM queries
CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient ON messages(sender_id, recipient_id);
