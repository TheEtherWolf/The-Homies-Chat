-- Add deleted flag and deleted_at timestamp to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries on deleted messages
CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON messages(is_deleted);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at);

-- Create a function to permanently delete messages that have been marked as deleted for more than 1 day
CREATE OR REPLACE FUNCTION permanently_delete_old_messages()
RETURNS void AS $$
BEGIN
  -- Delete messages that have been marked as deleted for more than 1 day
  DELETE FROM messages 
  WHERE is_deleted = true 
  AND deleted_at < (CURRENT_TIMESTAMP - INTERVAL '1 day');
  
  RAISE NOTICE 'Permanently deleted messages marked as deleted more than 1 day ago';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run the cleanup function daily
-- Note: This requires the pg_cron extension to be enabled in your Supabase project
-- You may need to contact Supabase support to enable this extension if it's not already available
DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Schedule the job to run daily at 3:00 AM
    PERFORM cron.schedule(
      'delete-old-messages', -- job name
      '0 3 * * *',          -- cron schedule (daily at 3:00 AM)
      'SELECT permanently_delete_old_messages()'
    );
  ELSE
    RAISE NOTICE 'pg_cron extension is not available. Please contact Supabase support to enable it.';
  END IF;
END $$;

-- Create a function to mark a message as deleted
CREATE OR REPLACE FUNCTION mark_message_as_deleted(message_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  success BOOLEAN;
BEGIN
  UPDATE messages 
  SET is_deleted = true, 
      deleted_at = CURRENT_TIMESTAMP,
      content = '[This message has been deleted]' -- Optional: replace content with a placeholder
  WHERE id = message_id;
  
  GET DIAGNOSTICS success = ROW_COUNT;
  RETURN success > 0;
END;
$$ LANGUAGE plpgsql;

-- Create an API function that can be called from the client
CREATE OR REPLACE FUNCTION delete_message(message_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_owner BOOLEAN;
  success BOOLEAN;
BEGIN
  -- Check if the user is the owner of the message
  SELECT EXISTS(
    SELECT 1 FROM messages 
    WHERE id = message_id AND sender_id = user_id
  ) INTO is_owner;
  
  -- Only allow deletion if the user is the owner
  IF is_owner THEN
    SELECT mark_message_as_deleted(message_id) INTO success;
    RETURN success;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION delete_message(UUID, UUID) TO authenticated;
