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
    // Ensure Supabase is configured regardless of environment
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, rejecting registration');
      return null;
    }
    
    // First register the user with Supabase Auth
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
    
    // Auto-verify the user without email confirmation using service client
    if (serviceSupabase && data.user) {
      try {
        // Create a record in the users table with verified=true
        const { error: userError } = await serviceSupabase
          .from('users')
          .upsert({
            id: data.user.id,
            username: username,
            email: email,
            verified: true,
            created_at: new Date().toISOString()
          });
        
        if (userError) {
          console.error('Error creating verified user record:', userError);
        } else {
          console.log('Created auto-verified user record for:', username);
        }
      } catch (verifyError) {
        console.error('Error auto-verifying user:', verifyError);
      }
    }
    
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
    // Ensure Supabase is configured regardless of environment
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, rejecting login');
      return null;
    }
    
    // Check if username is an email
    const isEmail = username.includes('@');
    
    // If not an email, we need to find the user's email first
    let email = username;
    
    if (!isEmail) {
      // Look up email by username
      const { data: userData, error: userError } = await getSupabaseClient(true)
        .from('users')
        .select('email')
        .eq('username', username)
        .single();
      
      if (userError || !userData || !userData.email) {
        console.error('Error finding user email by username:', userError || 'User not found');
        return null;
      }
      
      email = userData.email;
      console.log(`Found email ${email} for username ${username}`);
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
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
    
    if (!message) {
      console.error('No message provided to save');
      return false;
    }
    
    // Validate senderId is present, valid, and exists in users table
    if (!message.senderId || !isValidUUID(message.senderId)) {
      console.error('Invalid or missing senderId in message object:', message);
      return false; // Stop if senderId is missing or not a UUID
    }

    // Before saving, verify the sender exists in the users table
    const client = getSupabaseClient(true);
    const { data: userExists, error: userCheckError } = await client
      .from('users')
      .select('id')
      .eq('id', message.senderId)
      .limit(1);

    if (userCheckError) {
      console.error('Error checking if user exists:', userCheckError);
      return false;
    }

    if (!userExists || userExists.length === 0) {
      console.error(`User with ID ${message.senderId} doesn't exist in the database. Creating...`);
      
      // Try to create the user if we have a username
      if (message.username) {
        const { error: insertError } = await client
          .from('users')
          .insert([{
            id: message.senderId,
            username: message.username,
            created_at: new Date().toISOString()
          }]);
          
        if (insertError) {
          console.error('Failed to create user record:', insertError);
          return false;
        }
        console.log(`Created user record for ${message.username} with ID ${message.senderId}`);
      } else {
        return false; // Can't proceed without a valid user
      }
    }

    // Generate a valid UUID for the message ID
    const messageId = uuidv4();

    // Format message to match Supabase schema
    const formattedMessage = {
      id: messageId,
      sender_id: message.senderId,
      sender_username: message.sender || message.username,
      content: message.message || message.content || "",
      created_at: new Date(message.timestamp || Date.now()).toISOString(),
      channel: message.channel || message.channelId || "general",
      type: message.type || "text",
      // Include file info if available
      file_url: message.fileUrl || null,
      file_type: message.fileType || null,
      file_size: message.fileSize || null
    };
    
    console.log(`Saving message to Supabase in channel ${formattedMessage.channel}:`, formattedMessage);
    
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
    // Ensure Supabase is configured regardless of environment
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.error('Supabase not configured, cannot save messages');
      return false;
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('No messages to save to Supabase');
      return true;
    }

    // First, get a list of all valid user IDs from the database
    // This will be used to check if the sender IDs are valid
    const client = getSupabaseClient(true);
    const { data: existingUsers, error: usersError } = await client
      .from('users')
      .select('id');

    if (usersError) {
      console.error('Error fetching users for validation:', usersError);
      return false;
    }

    // Create a set of valid user IDs for quick lookup
    const validUserIds = new Set(existingUsers.map(user => user.id));
    console.log(`Loaded ${validUserIds.size} valid user IDs for message validation`);

    // Process in batches to prevent timeout or payload size issues
    const batchSize = 10; // Adjust if needed
    let savedMessageCount = 0;
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      // Format messages to match Supabase schema
      const formattedMessages = [];
      
      for (const message of batch) {
        // Always generate a fresh UUID for message ID
        const messageId = uuidv4();
        
        // Check if sender ID is valid (exists in our users table)
        let senderId = null;
        let validSender = false;
        
        if (message.senderId && typeof message.senderId === 'string') {
          // First check if it's a valid UUID format
          if (isValidUUID(message.senderId)) {
            // Then check if it exists in our valid users list
            if (validUserIds.has(message.senderId)) {
              senderId = message.senderId;
              validSender = true;
            } else {
              console.warn(`Message has UUID sender_id (${message.senderId}) but it doesn't exist in the users table`);
            }
          } else if (message.senderId.startsWith('dev-')) {
            // It's a development ID - try to find a real user with the matching username
            if (message.username) {
              const { data: userMatch } = await client
                .from('users')
                .select('id')
                .eq('username', message.username)
                .limit(1);
                
              if (userMatch && userMatch.length > 0) {
                senderId = userMatch[0].id;
                validSender = true;
                console.log(`Mapped dev user ${message.username} to valid user ID ${senderId}`);
              }
            }
          }
        }
        
        // Skip messages without valid senders to prevent foreign key violations
        if (!validSender) {
          console.warn(`Skipping message without valid sender ID: ${message.message?.substring(0, 30)}...`);
          continue;
        }
        
        formattedMessages.push({
          id: messageId,
          sender_id: senderId,
          content: message.message || message.content || "",
          created_at: new Date(message.timestamp || Date.now()).toISOString(),
          channel: message.channel || message.channelId || "general",
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
  saveMessagesToSupabase,
  saveMessageToSupabase
};
