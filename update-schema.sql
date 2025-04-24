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

-- Drop the old table if it exists
DROP TABLE IF EXISTS friends;

-- Create the new friends table
CREATE TABLE friends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_1 UUID NOT NULL,
    user_id_2 UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', (optionally: 'blocked')
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT unique_friendship UNIQUE (user_id_1, user_id_2),
    CONSTRAINT fk_user_1 FOREIGN KEY (user_id_1) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_2 FOREIGN KEY (user_id_2) REFERENCES users(id) ON DELETE CASCADE
);

-- Optional: Indexes for faster lookups
CREATE INDEX idx_friends_user_id_1 ON friends(user_id_1);
CREATE INDEX idx_friends_user_id_2 ON friends(user_id_2);
CREATE INDEX idx_friends_status ON friends(status);

-- Trigger to update updated_at on row update
CREATE OR REPLACE FUNCTION update_friends_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_friends_updated_at ON friends;
CREATE TRIGGER set_friends_updated_at
BEFORE UPDATE ON friends
FOR EACH ROW
EXECUTE FUNCTION update_friends_updated_at();

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
