-- Function to generate a random alphanumeric code of specified length
CREATE OR REPLACE FUNCTION generate_random_code(length INTEGER) RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER := 0;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to generate and update a unique friend code for a user
CREATE OR REPLACE FUNCTION generate_unique_friend_code(user_id UUID) RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a new 8-character code
    new_code := generate_random_code(8);
    
    -- Check if this code already exists
    SELECT EXISTS(SELECT 1 FROM users WHERE friend_code = new_code) INTO code_exists;
    
    -- If the code is unique, update the user and return the code
    IF NOT code_exists THEN
      UPDATE users SET friend_code = new_code WHERE id = user_id;
      RETURN new_code;
    END IF;
    
    -- If we get here, the code was not unique, so we loop and try again
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically generate a friend code for new users if one isn't provided
CREATE OR REPLACE FUNCTION set_default_friend_code() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.friend_code IS NULL THEN
    NEW.friend_code := generate_random_code(8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_friend_code ON users;
CREATE TRIGGER ensure_friend_code
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION set_default_friend_code();
