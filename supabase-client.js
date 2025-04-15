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
        avater_url: null, // Typo in DB column name preserved
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
      .select('id, username, email, status, avater_url')
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
          avatar_url: user.avater_url,
          status: user.status || 'online'
        }
      };
    }
    
    // If we're here, the user doesn't exist yet - let's auto-create one for simplicity during development
    console.log(`User ${username} not found, auto-creating`);
    return registerUser(username, password);
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

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error loading messages from Supabase:', error);
      return null;
    }

    console.log(`Loaded ${data.length} messages from Supabase`);
    return data;
  } catch (error) {
    console.error('Error in loadMessagesFromSupabase:', error);
    return null;
  }
}

/**
 * Save a single message to Supabase
 * @param {Object} message - The message to save
 * @returns {Promise<boolean>} Success status
 */
async function saveMessageToSupabase(message) {
  try {
    // Ensure Supabase is configured regardless of environment
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, cannot save message');
      return false;
    }
    
    // Choose appropriate client
    const client = getSupabaseClient(true);
    
    // Ensure message has a valid sender ID
    if (!message.senderId || !isValidUUID(message.senderId)) {
      console.error('Invalid sender ID for message:', message.senderId);
      
      // If we have serviceSupabase, we can check if user exists and create if needed
      if (serviceSupabase && message.username) {
        try {
          // Try to find a user ID by username
          const { data: userData } = await serviceSupabase
            .from('users')
            .select('id')
            .eq('username', message.username)
            .maybeSingle();
            
          if (userData && userData.id) {
            message.senderId = userData.id;
            console.log(`Found existing user ID for ${message.username}: ${message.senderId}`);
          } else {
            return false; // Can't proceed without a valid user
          }
        } catch (userError) {
          console.error('Error finding user:', userError);
          return false;
        }
      } else {
        return false; // Can't proceed without a valid user
      }
    }

    // Generate a valid UUID for the message ID
    const messageId = uuidv4();

    // Format message to match Supabase schema exactly
    const formattedMessage = {
      id: messageId,
      sender_id: message.senderId,
      content: message.message || message.content || "",
      created_at: new Date(message.timestamp || Date.now()).toISOString(),
      type: message.type || "text",
      file_url: message.fileUrl || null,
      file_type: message.fileType || null,
      file_size: message.fileSize || null
    };
    
    console.log(`Saving message to Supabase:`, formattedMessage);
    
    const { error } = await client
      .from('messages')
      .upsert(formattedMessage);
    
    if (error) {
      console.error('Error saving message to Supabase:', error);
      return false;
    }

    console.log(`Saved message to Supabase: ${formattedMessage.id}`);
    return true;
  } catch (error) {
    console.error('Error in saveMessageToSupabase:', error);
    return false;
  }
}

/**
 * Save messages to Supabase
 * @param {Array} messages - Array of messages to save
 * @returns {Promise<boolean>} Success status
 */
async function saveMessagesToSupabase(messages) {
  try {
    // Ensure Supabase is configured regardless of environment
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, cannot save messages');
      return false;
    }
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error('No valid messages provided');
      return false;
    }
    
    // Use service role client for database operations
    const client = getSupabaseClient(true);
    
    // Process in batches to avoid payload size limits
    const batchSize = 50; // Adjust based on your Supabase plan limits
    let savedMessageCount = 0;
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const formattedMessages = [];
      
      // Format each message in the batch
      for (const message of batch) {
        if (!message) continue;
        
        // Skip messages without content
        if (!message.content && !message.message) {
          continue;
        }
        
        // Ensure sender has a valid ID
        let senderId = message.senderId;
        if (!senderId || !isValidUUID(senderId)) {
          console.warn('Invalid sender ID, trying to find by username:', message.sender);
          
          // Try to lookup user by username
          try {
            const { data: userData } = await client
              .from('users')
              .select('id')
              .eq('username', message.sender || 'Unknown')
              .maybeSingle();
              
            if (userData && userData.id) {
              senderId = userData.id;
            } else {
              console.warn(`Could not find user ID for sender: ${message.sender}`);
              continue; // Skip this message
            }
          } catch (userError) {
            console.error('Failed to lookup user:', userError);
            continue; // Skip this message
          }
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
          file_size: message.fileSize || null
        });
      }
      
      // Skip empty batches
      if (formattedMessages.length === 0) {
        console.log(`Skipping empty batch ${Math.floor(i/batchSize) + 1}`);
        continue;
      }

      try {
        const { error } = await client
          .from('messages')
          .upsert(formattedMessages);
        
        if (error) {
          console.error(`Error saving batch ${Math.floor(i/batchSize) + 1} to Supabase:`, error);
          continue; // Continue with next batch even if this one failed
        }
        
        savedMessageCount += formattedMessages.length;
      } catch (batchError) {
        console.error(`Exception in batch ${Math.floor(i/batchSize) + 1}:`, batchError);
        continue;
      }
    }
    
    console.log(`Saved ${savedMessageCount} messages to Supabase successfully`);
    return true;
  } catch (error) {
    console.error('Error in saveMessagesToSupabase:', error);
    return false;
  }
}

module.exports = {
  registerUser,
  signInUser,
  signOutUser,
  getCurrentUser,
  getAllUsers,
  loadMessagesFromSupabase,
  saveMessageToSupabase,
  saveMessagesToSupabase,
  getSupabaseClient
};
