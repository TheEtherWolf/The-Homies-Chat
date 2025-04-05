/**
 * Supabase Client for The Homies App
 * Handles authentication and database operations
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

let supabase;

// Set NODE_ENV to development if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Supabase client
try {
  if (process.env.NODE_ENV === 'development' && (!SUPABASE_URL || !SUPABASE_KEY)) {
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
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized successfully');
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
 * Register a new user
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {string} email - Email address
 * @returns {Promise<object|null>} - User object or null if error
 */
async function registerUser(username, password, email) {
  try {
    // Use development mode when appropriate
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Auto-registering user', username);
      return { id: 'dev-' + Date.now(), username, email };
    }
    
    if (!supabase || !SUPABASE_URL || !SUPABASE_KEY) {
      console.warn('Supabase not configured, using development mode');
      return { id: 'dev-' + Date.now(), username, email };
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
    // Use development mode when appropriate
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Auto-approving sign in for', username);
      return { id: 'dev-user', username, email: `${username}@homies.app` };
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

module.exports = {
  registerUser,
  signInUser,
  signOutUser,
  getCurrentUser,
  getAllUsers
};
