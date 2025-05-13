-- DM and Friends System Schema for The Homies App

-- 1. Create conversations table for DMs and group chats
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, -- NULL for 1:1 DMs, custom name for group chats
  is_group BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  avatar_url TEXT -- NULL for 1:1 DMs, optional for group chats
);

-- 2. Create conversation_members table to track participants
CREATE TABLE IF NOT EXISTS public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_admin BOOLEAN DEFAULT false,
  last_read_message_id UUID, -- Track last read message for unread indicators
  UNIQUE(conversation_id, user_id)
);

-- 3. Create direct_messages table (separate from channel messages)
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id),
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  type VARCHAR(20) DEFAULT 'text', -- text, image, file, system
  file_url TEXT,
  file_type TEXT,
  file_size INTEGER,
  is_system_message BOOLEAN DEFAULT false -- For system notifications like "You are now friends with X"
);

-- 4. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_id ON public.conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_id ON public.direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON public.direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at ON public.direct_messages(created_at);

-- 5. Add trigger to update conversation updated_at when new message is added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_timestamp_trigger ON public.direct_messages;
CREATE TRIGGER update_conversation_timestamp_trigger
AFTER INSERT ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();

-- 6. Add function to auto-create DM conversation when friendship is accepted
CREATE OR REPLACE FUNCTION create_dm_on_friendship_accept()
RETURNS TRIGGER AS $$
DECLARE
  existing_conversation_id UUID;
  new_conversation_id UUID;
BEGIN
  -- Only proceed if the friendship was just accepted
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status <> 'accepted') THEN
    -- Check if a conversation already exists between these users
    SELECT c.id INTO existing_conversation_id
    FROM public.conversations c
    JOIN public.conversation_members cm1 ON c.id = cm1.conversation_id
    JOIN public.conversation_members cm2 ON c.id = cm2.conversation_id
    WHERE c.is_group = false
      AND cm1.user_id = NEW.user_id
      AND cm2.user_id = NEW.friend_id
      AND (SELECT COUNT(*) FROM public.conversation_members WHERE conversation_id = c.id) = 2;
    
    -- If no conversation exists, create one
    IF existing_conversation_id IS NULL THEN
      -- Create new conversation
      INSERT INTO public.conversations (is_group, created_by)
      VALUES (false, NEW.user_id)
      RETURNING id INTO new_conversation_id;
      
      -- Add both users to the conversation
      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (new_conversation_id, NEW.user_id);
      
      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (new_conversation_id, NEW.friend_id);
      
      -- Add system message about becoming friends
      INSERT INTO public.direct_messages (
        conversation_id, 
        content, 
        is_system_message,
        type
      )
      VALUES (
        new_conversation_id,
        'You are now friends!',
        true,
        'system'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_dm_on_friendship_accept_trigger ON public.friendships;
CREATE TRIGGER create_dm_on_friendship_accept_trigger
AFTER UPDATE ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION create_dm_on_friendship_accept();
