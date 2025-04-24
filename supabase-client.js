/**
 * Supabase Client for The Homies App
 * Handles authentication and database operations
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Environment variables for Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; 
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Service role key

// Create a regular client for client-side operations
let supabase = null;

// Create a service client for server-side operations that bypass RLS
let serviceSupabase = null;

// Initialize Supabase clients
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // If a service key is provided, create a separate client for server operations
  if (SUPABASE_SERVICE_KEY) {
    serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log('Supabase service client initialized for server operations');
  }
  
  console.log('Supabase initialized with regular client');
}

/**
 * Get the appropriate Supabase client based on operation type
 * @param {boolean} serverOperation - Whether this is a server-side operation that should bypass RLS
 * @returns {Object} Supabase client
 */
function getSupabaseClient(serverOperation = false) {
  // Use service client for server operations if available
  if (serverOperation && serviceSupabase) {
    return serviceSupabase;
  }
  // Otherwise use regular client
  return supabase;
}

// Set NODE_ENV to development if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Supabase client
try {
  // Only allow mock client in strict development mode
  if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true' && 
      (!SUPABASE_URL || !SUPABASE_KEY)) {
    console.log('Development mode: Using mock Supabase client');
    // Create dummy client for development mode
    supabase = {
      auth: {
        signUp: () => ({ user: { id: 'dev-' + Date.now() }, error: null }),
        signInWithPassword: (credentials) => ({ 
          user: { id: 'dev-' + Date.now(), email: credentials.email }, 
          error: null 
        }),
        signOut: () => ({ error: null })
      },
      from: (table) => ({
        select: () => ({ data: [], error: null }),
        insert: () => ({ data: { id: 'dev-' + Date.now() }, error: null }),
        update: () => ({ data: null, error: null }),
        delete: () => ({ data: null, error: null })
      })
    };
  } else {
    // Enforce Supabase credentials in production
    if (process.env.NODE_ENV === 'production' && (!SUPABASE_URL || !SUPABASE_KEY)) {
      throw new Error('Supabase credentials are required in production mode');
    }
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  
  // Create dummy client when there's an error
  supabase = {
    auth: {
      signUp: () => ({ user: null, error: new Error('Supabase not configured') }),
      signInWithPassword: () => ({ user: null, error: new Error('Supabase not configured') }),
      signOut: () => ({ error: null })
    },
    from: () => ({
      select: () => ({ data: [], error: new Error('Supabase not configured') }),
      insert: () => ({ data: null, error: new Error('Supabase not configured') }),
      update: () => ({ data: null, error: new Error('Supabase not configured') }),
      delete: () => ({ data: null, error: new Error('Supabase not configured') })
    })
  };
}

/**
 * Check if a string is a valid UUID
 * @param {string} str - String to check
 * @returns {boolean} Whether the string is a valid UUID
 */
function isValidUUID(str) {
  // Simple UUID v4 regex check
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return str && typeof str === 'string' && uuidPattern.test(str);
}

/**
 * Register a new user
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} email - Email address (optional for development)
 * @returns {Promise<object|null>} - User object or null if error
 */
async function registerUser(username, password, email = '') {
  try {
    // Ensure Supabase is configured
    if (!serviceSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Supabase service client not configured, rejecting registration');
      return null;
    }
    
    console.log(`Registering user ${username} directly to Supabase database`);
    
    // Create a unique ID for the user
    const userId = uuidv4();
    const now = new Date().toISOString();
    
    // First check if the username already exists
    const { data: existingUser, error: lookupError } = await serviceSupabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    
    if (lookupError && lookupError.code !== 'PGRST116') {
      // PGRST116 is "No rows returned" which is what we want
      console.error('Error checking for existing user:', lookupError);
      return null;
    }
    
    if (existingUser) {
      console.log(`User with username ${username} already exists`);
      return { 
        id: existingUser.id, 
        username,
        user_metadata: { username } 
      };
    }
    
    // Generate a verification token (not used in development)
    const verificationToken = uuidv4();
    const tokenExpires = new Date();
    tokenExpires.setDate(tokenExpires.getDate() + 1); // Token expires in 1 day
    
    // Create user record directly in the database with all required fields
    const { error: insertError } = await serviceSupabase
      .from('users')
      .insert({
        id: userId,
        username: username,
        email: email || `${username}@homies.app`, // Default email if not provided
        password: password,
        created_at: now,
        last_seen: now,
        verified: true, // Auto-verify during development
        verification_token: verificationToken,
        token_expires: tokenExpires.toISOString(),
        avatar_url: null, // Avatar URL for user profile
        status: 'online'
      });
    
    if (insertError) {
      console.error('Error creating user record:', insertError);
      return null;
    }
    
    // Also initialize user's status in the user_status table
    try {
      await serviceSupabase
        .from('user_status')
        .insert({
          user_id: userId,
          status: 'online',
          last_updated: now
        });
    } catch (statusError) {
      console.warn('Could not initialize user status, continuing anyway:', statusError);
    }
    
    console.log(`User ${username} registered successfully with ID ${userId}`);
    
    // Return user object in similar format to Supabase Auth
    return {
      id: userId,
      username,
      user_metadata: { 
        username: username,
        email: email || `${username}@homies.app` 
      }
    };
  } catch (error) {
    console.error('Exception registering user:', error);
    return null;
  }
}

/**
 * Sign in a user
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<object|null>} - User object or null if error
 */
async function signInUser(username, password) {
  try {
    // Ensure Supabase is configured
    if (!serviceSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Supabase service client not configured, rejecting login');
      return null;
    }
    
    console.log(`Attempting login for ${username}`);
    const now = new Date().toISOString();
    
    // First, try direct simple lookup by username only for development
    let { data: user, error } = await serviceSupabase
      .from('users')
      .select('id, username, email, status, avatar_url')
      .eq('username', username)
      .maybeSingle();
      
    // Handle the error case when not found
    if (error && error.code !== 'PGRST116') {
      console.error('Error during user lookup:', error);
      return null;
    }
    
    // If user exists, we'll update last_seen and status
    if (user && user.id) {
      console.log(`Found existing user ${username}, updating status`);
      
      // Update user's last_seen time and status
      try {
        await serviceSupabase
          .from('users')
          .update({ 
            last_seen: now,
            status: 'online'
          })
          .eq('id', user.id);
          
        // Also update the user_status table
        const { data: existingStatus } = await serviceSupabase
          .from('user_status')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (existingStatus) {
          // Update existing status
          await serviceSupabase
            .from('user_status')
            .update({ 
              status: 'online',
              last_updated: now
            })
            .eq('user_id', user.id);
        } else {
          // Create new status entry
          await serviceSupabase
            .from('user_status')
            .insert({
              user_id: user.id,
              status: 'online',
              last_updated: now
            });
        }
      } catch (updateError) {
        console.warn('Error updating user status, continuing anyway:', updateError);
      }
      
      // Return user object in similar format to Supabase Auth
      return {
        id: user.id,
        username: user.username,
        user_metadata: { 
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          status: user.status || 'online'
        }
      };
    }
    
    // If we're here, the user doesn't exist yet - let's NOT auto-create accounts for security
    console.log(`User ${username} not found, rejecting login attempt`);
    return null; // Return null instead of auto-creating account
  } catch (error) {
    console.error('Exception signing in user:', error);
    return null;
  }
}

/**
 * Sign out the current user
 * @returns {Promise<boolean>} - Success status
 */
async function signOutUser() {
  try {
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.warn('Supabase not configured, using development mode');
      return true;
    }
    
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out user:', error);
      return false;
    }
    
    console.log('User signed out successfully');
    return true;
  } catch (error) {
    console.error('Exception signing out user:', error);
    return false;
  }
}

/**
 * Get the current signed-in user
 * @returns {Promise<object|null>} - User object or null if not signed in
 */
async function getCurrentUser() {
  try {
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.warn('Supabase not configured, using development mode');
      return { id: 'dev-user', username: 'dev-user' };
    }
    
    const { data, error } = await supabase.auth.getUser();
    
    if (error || !data.user) {
      console.log('No user currently signed in');
      return null;
    }
    
    console.log('Current user retrieved:', data.user.id);
    return data.user;
  } catch (error) {
    console.error('Exception getting current user:', error);
    return null;
  }
}

/**
 * Get all users (for admin purposes)
 * @returns {Promise<Array|null>} - Array of users or null if error
 */
async function getAllUsers() {
  try {
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.warn('Supabase not configured, using development mode');
      return [{ id: 'dev-user', username: 'dev-user' }];
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, created_at');
    
    if (error) {
      console.error('Error getting all users:', error);
      return null;
    }
    
    console.log(`Retrieved ${data.length} users`);
    return data;
  } catch (error) {
    console.error('Exception getting all users:', error);
    return null;
  }
}

/**
 * Load messages from Supabase
 * @returns {Promise<Array>} Messages array
 */
async function loadMessagesFromSupabase() {
  try {
    // Ensure Supabase is configured regardless of environment
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, cannot load messages');
      return null;
    }

    console.log('Loading messages from Supabase with filtering...');

    // Get messages with proper filtering
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .is('deleted', null) // Only get messages that aren't deleted
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error loading messages from Supabase:', error);
      return null;
    }

    console.log(`Loaded ${data.length} active messages from Supabase`);
    return data;
  } catch (error) {
    console.error('Error in loadMessagesFromSupabase:', error);
    return null;
  }
}

/**
 * Get user ID by username, creating a new user if needed
 * @param {string} username - The username to look up
 * @returns {Promise<string|null>} - The valid user ID or null if failed
 */
async function getUserIdByUsername(username) {
  try {
    if (!serviceSupabase || !username) {
      console.error('Cannot get user ID: Missing serviceSupabase or username');
      return null;
    }
    
    console.log(`Looking up user ID for username: ${username}`);
    
    // First check if user already exists
    const { data: existingUser, error: lookupError } = await serviceSupabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
      
    if (lookupError) {
      console.error('Error looking up user:', lookupError);
      return null;
    }
    
    // If user exists, return their ID
    if (existingUser && existingUser.id) {
      console.log(`Found existing user ${username} with ID ${existingUser.id}`);
      return existingUser.id;
    }
    
    // User doesn't exist, create a new record
    console.log(`User ${username} doesn't exist, creating new record`);
    const userId = uuidv4();
    const now = new Date().toISOString();
    
    const { error: createError } = await serviceSupabase
      .from('users')
      .insert({
        id: userId,
        username: username,
        email: `${username}@homies.app`,
        password: 'auto-created',
        created_at: now,
        last_seen: now,
        verified: true,
        status: 'online',
        avatar_url: null
      });
      
    if (createError) {
      // If username already exists (race condition), try one more lookup
      if (createError.code === '23505') {
        console.log(`Username ${username} already exists (race condition), trying lookup again`);
        
        const { data: retryUser } = await serviceSupabase
          .from('users')
          .select('id')
          .eq('username', username)
          .maybeSingle();
          
        if (retryUser && retryUser.id) {
          console.log(`Found user on retry: ${retryUser.id}`);
          return retryUser.id;
        }
      }
      
      console.error('Failed to create user:', createError);
      return null;
    }
    
    console.log(`Created new user ${username} with ID ${userId}`);
    return userId;
  } catch (error) {
    console.error('Error in getUserIdByUsername:', error);
    return null;
  }
}

/**
 * Save a single message to Supabase
 * @param {Object} message - The message to save
 * @returns {Promise<Object|null>} The inserted message row (with permanent ID) or null if failed
 */
async function saveMessageToSupabase(message) {
  try {
    // Ensure Supabase is configured
    if (!serviceSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Supabase not configured, cannot save message');
      return null;
    }
    
    // Skip empty messages
    if (!message.content && !message.message) {
      console.log('Skipping empty message save');
      return null;
    }
    
    // Ensure message has a sender name at minimum
    const senderId = message.sender_id || message.senderId || null;
    const senderName = message.sender || message.username || null;
    if (!senderId && !senderName) {
      console.error('Message missing sender info');
      return null;
    }

    // Format message for DB
    const formattedMessage = {
      sender_id: senderId,
      content: message.content || message.message || "",
      channel: message.channel || "general",
      type: message.type || 'text',
      file_url: message.file_url || message.fileUrl || null,
      file_type: message.file_type || message.fileType || null,
      file_size: message.file_size || message.fileSize || null,
      recipient_id: message.recipient_id || message.recipientId || null
    };
    
    console.log(`Saving message to Supabase from user ${senderName} (${senderId}) in channel ${formattedMessage.channel}`);
    
    // Insert and return the inserted row
    const { data, error } = await serviceSupabase
      .from('messages')
      .insert(formattedMessage)
      .select('*')
      .maybeSingle();
    
    if (error) {
      console.error('Error saving message to Supabase:', error);
      return null;
    }
    if (!data) {
      console.error('No data returned from Supabase after insert');
      return null;
    }
    console.log(`Saved message to Supabase: ${data.id}`);
    return data;
  } catch (error) {
    console.error('Error in saveMessageToSupabase:', error);
    return null;
  }
}

/**
 * Save messages to Supabase
 * @param {Array} messages - Array of messages to save
 * @returns {Promise<boolean>} Success status
 */
async function saveMessagesToSupabase(messages) {
  try {
    // Ensure Supabase is configured
    if (!serviceSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Supabase not configured, cannot save messages');
      return false;
    }
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error('No valid messages provided');
      return false;
    }
    
    // Process in batches to avoid payload size limits
    const batchSize = 5; // Smaller batch size for better error handling
    let savedMessageCount = 0;
    
    // Maps to track username to ID mappings for efficiency
    const usernameToIdMap = new Map();
    
    // Process each message individually to be absolutely certain user records exist
    const formattedMessages = [];
    
    for (const message of messages) {
      if (!message) continue;
      
      // Skip messages without content
      if (!message.content && !message.message) {
        continue;
      }
      
      // Get sender name from message
      const senderName = message.sender || message.username;
      if (!senderName) {
        console.warn('Message missing sender name, skipping');
        continue;
      }
      
      // Check our cache first for this username
      let senderId;
      if (usernameToIdMap.has(senderName)) {
        senderId = usernameToIdMap.get(senderName);
        console.log(`Using cached user ID for ${senderName}: ${senderId}`);
      } else {
        // Get or create user ID using our robust function
        senderId = await getUserIdByUsername(senderName);
        
        if (!senderId) {
          console.error(`Could not get or create user ID for ${senderName}, skipping message`);
          continue;
        }
        
        // Cache the ID for future use
        usernameToIdMap.set(senderName, senderId);
      }
      
      // Generate a message ID if needed
      const messageId = message.id || uuidv4();
      
      // Format message according to exact Supabase schema
      formattedMessages.push({
        id: messageId,
        sender_id: senderId,
        content: message.message || message.content || "",
        created_at: new Date(message.timestamp || Date.now()).toISOString(),
        type: message.type || "text",
        file_url: message.fileUrl || null,
        file_type: message.fileType || null,
        file_size: message.fileSize || null,
        channel: message.channel || "general" // Add channel support
      });
    }
    
    // Process in batches
    for (let i = 0; i < formattedMessages.length; i += batchSize) {
      const batch = formattedMessages.slice(i, i + batchSize);
      
      if (batch.length === 0) continue;
      
      try {
        console.log(`Saving batch ${Math.floor(i/batchSize) + 1} with ${batch.length} messages`);
        
        const { error } = await serviceSupabase
          .from('messages')
          .upsert(batch);
        
        if (error) {
          console.error(`Error saving batch ${Math.floor(i/batchSize) + 1} to Supabase:`, error);
          continue;
        }
        
        savedMessageCount += batch.length;
        console.log(`Successfully saved batch ${Math.floor(i/batchSize) + 1}`);
      } catch (batchError) {
        console.error(`Exception in batch ${Math.floor(i/batchSize) + 1}:`, batchError);
      }
    }
    
    console.log(`Saved ${savedMessageCount} messages to Supabase successfully`);
    return savedMessageCount > 0;
  } catch (error) {
    console.error('Error in saveMessagesToSupabase:', error);
    return false;
  }
}

/**
 * Mark a message as deleted in Supabase
 * @param {string} messageId - The ID of the message to delete
 * @returns {Promise<boolean>} - Success status
 */
async function markMessageAsDeleted(messageId) {
  try {
    // Ensure Supabase is configured
    if (!serviceSupabase || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Supabase not configured, cannot delete message');
      return false;
    }

    if (!messageId) {
      console.error('No message ID provided for deletion');
      return false;
    }

    console.log(`Marking message ${messageId} as deleted in Supabase`);

    // First check if the message exists
    const { data: existingMessage, error: fetchError } = await serviceSupabase
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error checking message existence:', fetchError);
      return false;
    }

    if (!existingMessage) {
      console.error(`Message ${messageId} not found in Supabase`);
      return false;
    }

    // Update the message with deleted status
    const { error } = await serviceSupabase
      .from('messages')
      .update({
        deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('id', messageId);

    if (error) {
      console.error('Error marking message as deleted:', error);
      return false;
    }

    console.log(`Successfully marked message ${messageId} as deleted`);
    return true;
  } catch (error) {
    console.error('Error in markMessageAsDeleted:', error);
    return false;
  }
}

// *** FRIENDSHIP FUNCTIONS ***

/**
 * Send a friend request from sender to recipient
 * @param {string} senderId - UUID of the user sending the request
 * @param {string} recipientId - UUID of the user receiving the request
 * @returns {Promise<object|null>} The created friendship record or null on error/duplicate
 */
async function sendFriendRequest(senderId, recipientId) {
    if (!serviceSupabase || !senderId || !recipientId || senderId === recipientId) {
        console.error('Invalid input for sendFriendRequest');
        return null;
    }

    // Ensure user_id_1 is the smaller ID
    const [user_id_1, user_id_2] = [senderId, recipientId].sort();

    try {
        console.log(`Attempting to send friend request from ${senderId} to ${recipientId}`);
        const { data, error } = await serviceSupabase
            .from('friends')
            .insert({
                user_id_1: user_id_1,
                user_id_2: user_id_2,
                status: 'pending'
                // created_at and updated_at should have defaults or triggers
            })
            .select()
            .single();

        if (error) {
            // Handle potential duplicate entry error gracefully (e.g., P23505 unique_violation)
            if (error.code === '23505') { 
                 console.log(`Friendship between ${user_id_1} and ${user_id_2} already exists.`);
                 // Optionally, fetch the existing record
                 const existing = await getFriendshipStatus(user_id_1, user_id_2);
                 return existing; 
            } else {
                console.error('Error sending friend request:', error);
                return null;
            }
        }
        
        console.log('Friend request sent successfully:', data);
        return data;
    } catch (err) {
        console.error('Exception in sendFriendRequest:', err);
        return null;
    }
}

/**
 * Accept a friend request between two users
 * @param {string} userId1 - UUID of the first user
 * @param {string} userId2 - UUID of the second user
 * @returns {Promise<object|null>} The updated friendship record or null on error
 */
async function acceptFriendRequest(userId1, userId2) {
     if (!serviceSupabase || !userId1 || !userId2) {
        console.error('Invalid input for acceptFriendRequest');
        return null;
    }
    // Ensure order for lookup
    const [u1, u2] = [userId1, userId2].sort();

    try {
        console.log(`Attempting to accept friend request between ${u1} and ${u2}`);
        const { data, error } = await serviceSupabase
            .from('friends')
            .update({ status: 'accepted' })
            .eq('user_id_1', u1)
            .eq('user_id_2', u2)
            .eq('status', 'pending') // Only accept pending requests
            .select()
            .single();
        
        if (error) {
            console.error('Error accepting friend request:', error);
            return null;
        }
        if (!data) {
             console.log('No pending friend request found to accept.');
             return null;
        }
        console.log('Friend request accepted:', data);
        return data;
    } catch (err) {
        console.error('Exception in acceptFriendRequest:', err);
        return null;
    }
}

/**
 * Reject a pending friend request or remove an accepted friendship
 * @param {string} userId1 - UUID of the first user
 * @param {string} userId2 - UUID of the second user
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function rejectOrRemoveFriend(userId1, userId2) {
    if (!serviceSupabase || !userId1 || !userId2) {
        console.error('Invalid input for rejectOrRemoveFriend');
        return false;
    }
    // Ensure order for lookup
    const [u1, u2] = [userId1, userId2].sort();

    try {
        console.log(`Attempting to delete friendship between ${u1} and ${u2}`);
        const { error } = await serviceSupabase
            .from('friends')
            .delete()
            .eq('user_id_1', u1)
            .eq('user_id_2', u2);
            // No status check needed - delete pending or accepted

        if (error) {
            console.error('Error rejecting/removing friend:', error);
            return false;
        }
        
        console.log(`Friendship between ${u1} and ${u2} removed/rejected.`);
        return true;
    } catch (err) {
        console.error('Exception in rejectOrRemoveFriend:', err);
        return false;
    }
}

/**
 * Get all friendships (pending, accepted) for a given user
 * Includes the related user details (username, id)
 * @param {string} userId - UUID of the user whose friends to fetch
 * @returns {Promise<Array<object>|null>} Array of friendship objects or null on error
 */
async function getFriendships(userId) {
     if (!serviceSupabase || !userId) {
        console.error('Invalid input for getFriendships');
        return null;
    }
    try {
        console.log(`Fetching friendships for user ${userId}`);
         // We need to join with the users table twice to get both users' info
         // Query based on whether the user is user_id_1 or user_id_2
        const { data, error } = await getSupabaseClient()
            .from('friends')
            .select(`
                id, 
                user_id_1, 
                user_id_2, 
                status, 
                created_at, 
                updated_at,
                users1:user_id_1 ( id, username, avatar_url, status ),
                users2:user_id_2 ( id, username, avatar_url, status )
            `)
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`) 
            // Optional: filter specific statuses if needed, e.g., .in('status', ['accepted', 'pending'])
            .order('updated_at', { ascending: false });
            
        if (error) {
            console.error('Error fetching friendships:', error);
            return null;
        }

        // Process data to return a simpler list of 'friend' users with friendship status
        const friendships = data.map(f => {
            const friendUser = f.users1.id === userId ? f.users2 : f.users1;
            return {
                friendship_id: f.id,
                friend_id: friendUser.id,
                friend_username: friendUser.username,
                friend_avatar_url: friendUser.avatar_url,
                friend_status: friendUser.status, // Friend's online status
                friendship_status: f.status, // 'pending', 'accepted'
                since: f.updated_at
            };
        });

        console.log(`Found ${friendships.length} friendships for user ${userId}`);
        return friendships;
    } catch (err) {
        console.error('Exception in getFriendships:', err);
        return null;
    }
}

/**
 * Helper to get the status of a specific friendship
 * @param {string} userId1 
 * @param {string} userId2 
 * @returns {Promise<object|null>} Friendship record or null
 */
async function getFriendshipStatus(userId1, userId2) {
     if (!serviceSupabase || !userId1 || !userId2) return null;
    const [u1, u2] = [userId1, userId2].sort();
    try {
        const { data, error } = await serviceSupabase
            .from('friends')
            .select('*')
            .eq('user_id_1', u1)
            .eq('user_id_2', u2)
            .maybeSingle();
        if (error) {
            console.error('Error checking friendship status:', error);
            return null;
        }
        return data;
    } catch (err) {
         console.error('Exception in getFriendshipStatus:', err);
        return null;
    }
}

module.exports = {
  getSupabaseClient,
  registerUser,
  signInUser,
  signOutUser,
  getCurrentUser,
  getAllUsers,
  loadMessagesFromSupabase,
  saveMessageToSupabase,
  saveMessagesToSupabase,
  getUserIdByUsername,
  isValidUUID,
  markMessageAsDeleted,
  sendFriendRequest,
  acceptFriendRequest,
  rejectOrRemoveFriend,
  getFriendships
};
