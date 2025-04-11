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
 * @param {string} email - Email address
 * @returns {Promise<object|null>} - User object or null if error
 */
async function registerUser(username, password, email) {
  try {
    // Only use development mode when explicitly allowed
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true') {
      console.log('Development mode: Auto-registering user', username);
      return { id: 'dev-' + Date.now(), username, email };
    }
    
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, rejecting registration');
      return null;
    }
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });
    
    if (error) {
      console.error('Error registering user:', error);
      return null;
    }
    
    console.log('User registered successfully:', data.user.id);
    return data.user;
  } catch (error) {
    console.error('Exception registering user:', error);
    return null;
  }
}

/**
 * Sign in a user
 * @param {string} username - Username or email
 * @param {string} password - Password
 * @returns {Promise<object|null>} - User object or null if error
 */
async function signInUser(username, password) {
  try {
    // Only use development mode when explicitly allowed
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true') {
      console.log('Development mode: Auto-approving sign in for', username);
      return { id: 'dev-user', username, email: `${username}@homies.app` };
    }
    
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, rejecting login');
      return null;
    }
    
    // Check if username is an email
    const isEmail = username.includes('@');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: isEmail ? username : `${username}@homies.app`,
      password
    });
    
    if (error) {
      console.error('Error signing in user:', error);
      return null;
    }
    
    console.log('User signed in successfully:', data.user.id);
    return data.user;
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
    // Only use development mode when explicitly allowed
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true' && 
        (!SUPABASE_URL || !SUPABASE_KEY)) {
      console.log('Development mode: Using mock messages for Supabase');
      return [];
    }

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
    // Only use development mode when explicitly allowed
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true' && 
        (!SUPABASE_URL || !SUPABASE_KEY)) {
      console.log('Development mode: Skipping Supabase single message save');
      return true;
    }

    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, cannot save message');
      return false;
    }

    if (!message) {
      console.error('No message provided to save');
      return false;
    }
    
    // Validate senderId is present and valid
    if (!message.senderId || typeof message.senderId !== 'string') {
        console.error('Invalid or missing senderId in message object:', message);
        return false; // Stop if senderId is missing or not a string
    }

    // Ensure senderId is a valid UUID
    const senderId = isValidUUID(message.senderId) ? message.senderId : uuidv4();
    
    // Always generate a valid UUID for the message ID
    // Don't try to reuse non-UUID IDs from message.id
    const messageId = uuidv4();

    // Format message to match Supabase schema
    const formattedMessage = {
      id: messageId,
      sender_id: senderId,
      content: message.message || message.content || "",
      created_at: new Date(message.timestamp || Date.now()).toISOString(),
      type: message.type || "text",
      // Include file info if available
      file_url: message.fileUrl || null,
      file_type: message.fileType || null,
      file_size: message.fileSize || null
    };

    // Use serviceSupabase for message saving (server operation) if available
    const client = getSupabaseClient(true);
    
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
 * @param {Array} messages - Messages to save
 * @returns {Promise<boolean>} Success status
 */
async function saveMessagesToSupabase(messages) {
  try {
    // Only use development mode when explicitly allowed
    if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true' && 
        (!SUPABASE_URL || !SUPABASE_KEY)) {
      console.log('Development mode: Skipping Supabase messages save');
      return true;
    }

    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, cannot save messages');
      return false;
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('No messages to save to Supabase');
      return true;
    }

    // Process in batches to prevent timeout or payload size issues
    const batchSize = 10; // Adjust if needed
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      // Format messages to match Supabase schema
      const formattedMessages = batch.map(message => {
        // Always generate a fresh UUID for message ID
        const messageId = uuidv4();
        
        // Ensure we have a valid sender ID (UUID format)
        // If message.senderId is not a valid UUID, generate a new one
        let senderId;
        if (message.senderId && typeof message.senderId === 'string') {
          senderId = isValidUUID(message.senderId) ? message.senderId : uuidv4();
        } else {
          // Default fallback sender ID if none provided
          senderId = uuidv4();
          console.warn(`Missing sender ID for message, generated: ${senderId}`);
        }
        
        return {
          id: messageId,
          sender_id: senderId,
          content: message.message || message.content || "",
          created_at: new Date(message.timestamp || Date.now()).toISOString(),
          type: message.type || "text",
          file_url: message.fileUrl || null,
          file_type: message.fileType || null,
          file_size: message.fileSize || null
        };
      });

      // Use serviceSupabase for message saving (server operation) if available
      const client = getSupabaseClient(true);
      
      try {
        const { error } = await client
          .from('messages')
          .upsert(formattedMessages);
        
        if (error) {
          console.error(`Error saving batch ${Math.floor(i/batchSize) + 1} to Supabase:`, error);
          continue; // Continue with next batch even if this one failed
        }
      } catch (batchError) {
        console.error(`Exception in batch ${Math.floor(i/batchSize) + 1}:`, batchError);
        continue;
      }
    }
    
    console.log(`Saved ${messages ? messages.length : 0} messages to Supabase`);
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
  saveMessagesToSupabase,
  saveMessageToSupabase
};
