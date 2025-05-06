-- Drop the existing friends table if it exists with incorrect structure
DROP TABLE IF EXISTS friends;

-- Create the friends table with the correct structure
CREATE TABLE friends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_1 UUID NOT NULL,
    user_id_2 UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT unique_friendship UNIQUE (user_id_1, user_id_2),
    CONSTRAINT fk_user_1 FOREIGN KEY (user_id_1) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_2 FOREIGN KEY (user_id_2) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX idx_friends_user_id_1 ON friends(user_id_1);
CREATE INDEX idx_friends_user_id_2 ON friends(user_id_2);

-- Enable RLS (Row Level Security) for the friends table
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to see their own friendships
CREATE POLICY "Users can view their own friendships" 
ON friends 
FOR SELECT 
USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Create policy to allow users to create their own friendships
CREATE POLICY "Users can create their own friendships" 
ON friends 
FOR INSERT 
WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Create policy to allow users to update their own friendships
CREATE POLICY "Users can update their own friendships" 
ON friends 
FOR UPDATE 
USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Create policy to allow users to delete their own friendships
CREATE POLICY "Users can delete their own friendships" 
ON friends 
FOR DELETE 
USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
