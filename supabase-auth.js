/**
 * Supabase Authentication Integration for The Homies App
 * Provides user management and authentication
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Initialize Supabase client
let supabase = null;

/**
 * Initialize Supabase connection
 */
function initializeSupabase() {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.warn('Supabase credentials not provided. Using fallback authentication.');
      return false;
    }

    console.log('Connecting to Supabase...');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    console.log('Supabase client initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return false;
  }
}

/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {object} userData - Additional user data
 * @returns {Promise<object>} - Registration result
 */
async function registerUser(email, password, userData = {}) {
  try {
    if (!supabase) {
      if (!initializeSupabase()) {
        return { success: false, message: 'Supabase not available' };
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    });

    if (error) {
      console.error('Supabase registration error:', error);
      return { success: false, message: error.message };
    }

    return { 
      success: true, 
      user: data.user,
      message: 'Registration successful'
    };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, message: 'Registration failed' };
  }
}

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<object>} - Login result
 */
async function loginUser(email, password) {
  try {
    if (!supabase) {
      if (!initializeSupabase()) {
        return { success: false, message: 'Supabase not available' };
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Supabase login error:', error);
      return { success: false, message: error.message };
    }

    return { 
      success: true, 
      user: data.user,
      session: data.session,
      message: 'Login successful'
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'Login failed' };
  }
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<object>} - User data
 */
async function getUserById(userId) {
  try {
    if (!supabase) {
      if (!initializeSupabase()) {
        return { success: false, message: 'Supabase not available' };
      }
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Get user error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, user: data };
  } catch (error) {
    console.error('Get user error:', error);
    return { success: false, message: 'Failed to get user' };
  }
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {object} updates - Profile updates
 * @returns {Promise<object>} - Update result
 */
async function updateUserProfile(userId, updates) {
  try {
    if (!supabase) {
      if (!initializeSupabase()) {
        return { success: false, message: 'Supabase not available' };
      }
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      console.error('Update profile error:', error);
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Profile updated successfully' };
  } catch (error) {
    console.error('Update profile error:', error);
    return { success: false, message: 'Failed to update profile' };
  }
}

/**
 * Verify token
 * @param {string} token - JWT token
 * @returns {Promise<object>} - Verification result
 */
async function verifyToken(token) {
  try {
    if (!supabase) {
      if (!initializeSupabase()) {
        return { success: false, message: 'Supabase not available' };
      }
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Token verification error:', error);
      return { success: false, message: error.message };
    }

    return { 
      success: true, 
      user: data.user
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return { success: false, message: 'Invalid token' };
  }
}

module.exports = {
  initializeSupabase,
  registerUser,
  loginUser,
  getUserById,
  updateUserProfile,
  verifyToken
};
