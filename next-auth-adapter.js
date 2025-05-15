/**
 * NextAuth Adapter for Express.js
 * This file provides NextAuth-like functionality for The Homies Chat
 * while working with the existing Supabase authentication system
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getSupabaseClient, signInUser, registerUser } = require('./supabase-client');

// Create a router for NextAuth-like routes
const nextAuthRouter = express.Router();

// Session storage (in-memory for now, would be database-backed in production)
const sessions = {};

// Token expiration time (24 hours)
const TOKEN_EXPIRATION = 24 * 60 * 60 * 1000;

/**
 * Generate a secure session token
 * @returns {string} Session token
 */
function generateSessionToken() {
  return uuidv4();
}

/**
 * Create a new session for a user
 * @param {Object} user - User object
 * @returns {Object} Session object
 */
function createSession(user) {
  const token = generateSessionToken();
  const expires = new Date(Date.now() + TOKEN_EXPIRATION);
  
  const session = {
    token,
    userId: user.id,
    username: user.username,
    expires,
    user: {
      id: user.id,
      name: user.username,
      email: user.user_metadata?.email || '',
      image: user.user_metadata?.avatar_url || null
    }
  };
  
  // Store session
  sessions[token] = session;
  
  return session;
}

/**
 * Get a session by token
 * @param {string} token - Session token
 * @returns {Object|null} Session object or null if not found or expired
 */
function getSession(token) {
  const session = sessions[token];
  
  if (!session) {
    return null;
  }
  
  // Check if session has expired
  if (new Date() > new Date(session.expires)) {
    delete sessions[token];
    return null;
  }
  
  return session;
}

/**
 * Middleware to check if user is authenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.next_auth_session_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const session = getSession(token);
  
  if (!session) {
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Attach session to request
  req.session = session;
  req.user = session.user;
  
  next();
}

// API Routes

// Sign in route
nextAuthRouter.post('/api/auth/signin', async (req, res) => {
  console.log('[NEXTAUTH_DEBUG] Received sign-in request');
  
  try {
    const { username, password, callbackUrl } = req.body;
    console.log('[NEXTAUTH_DEBUG] Sign-in attempt for username:', username);
    
    if (!username || !password) {
      console.warn('[NEXTAUTH_DEBUG] Sign-in rejected: missing username or password');
      return res.status(400).json({ 
        ok: false, 
        error: 'Username and password are required',
        message: 'Username and password are required'
      });
    }
    
    // Attempt to sign in the user
    console.log('[NEXTAUTH_DEBUG] Attempting to sign in user with signInUser function');
    const user = await signInUser(username, password);
    
    if (!user) {
      console.warn('[NEXTAUTH_DEBUG] Sign-in failed: invalid credentials for user', username);
      return res.status(401).json({ 
        ok: false, 
        error: 'Invalid username or password',
        message: 'Invalid username or password'
      });
    }
    
    console.log('[NEXTAUTH_DEBUG] Sign-in successful for user:', username);
    
    // Create session
    const session = createSession(user);
    console.log('[NEXTAUTH_DEBUG] Created session with token:', session.token.substring(0, 8) + '...');
    
    // Set cookie
    res.cookie('next_auth_session_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TOKEN_EXPIRATION
    });
    console.log('[NEXTAUTH_DEBUG] Set session cookie with expiration:', new Date(Date.now() + TOKEN_EXPIRATION).toISOString());
    
    // Return session info with explicit success flag for client
    console.log('[NEXTAUTH_DEBUG] Returning successful sign-in response');
    return res.status(200).json({
      ok: true,
      success: true, // Add explicit success flag for client
      status: 'success',
      session: {
        ...session,
        user: user // Ensure user is included in session
      },
      user: user, // Include user directly for easier client-side access
      message: 'Login successful', // Add message for client
      callbackUrl: callbackUrl || '/'
    });
  } catch (error) {
    console.error('[NEXTAUTH_DEBUG] Sign-in error:', error);
    return res.status(500).json({ 
      ok: false, 
      success: false,
      error: 'An error occurred during sign in',
      message: error.message || 'An error occurred during sign in'
    });
  }
});

// Sign up route
nextAuthRouter.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password, callbackUrl } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    
    // Check if username already exists
    const { data: existingUser } = await getSupabaseClient(true)
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
      
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Register the user
    const user = await registerUser(username, password, email);
    
    if (!user) {
      return res.status(500).json({ error: 'Registration failed' });
    }
    
    // Create session
    const session = createSession(user);
    
    // Set cookie
    res.cookie('next_auth_session_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TOKEN_EXPIRATION
    });
    
    // Return session info
    return res.json({
      ok: true,
      status: 'success',
      session,
      callbackUrl: callbackUrl || '/'
    });
  } catch (error) {
    console.error('Sign up error:', error);
    return res.status(500).json({ error: 'An error occurred during registration' });
  }
});

// Sign out route
nextAuthRouter.post('/api/auth/signout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.next_auth_session_token;
  
  if (token && sessions[token]) {
    delete sessions[token];
  }
  
  // Clear cookie
  res.clearCookie('next_auth_session_token');
  
  return res.json({ ok: true });
});

// Session route
nextAuthRouter.get('/api/auth/session', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.next_auth_session_token;
  
  if (!token) {
    return res.json({ user: null, expires: null });
  }
  
  const session = getSession(token);
  
  if (!session) {
    return res.json({ user: null, expires: null });
  }
  
  return res.json({
    user: session.user,
    expires: session.expires
  });
});

// Client-side helper functions
const clientHelpers = `
// NextAuth client-side helpers
window.NextAuth = {
  // Sign in with credentials
  async signIn(credentials) {
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });
      
      return await response.json();
    } catch (error) {
      console.error('NextAuth sign in error:', error);
      return { error: 'An error occurred during sign in' };
    }
  },
  
  // Sign up with credentials
  async signUp(credentials) {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });
      
      return await response.json();
    } catch (error) {
      console.error('NextAuth sign up error:', error);
      return { error: 'An error occurred during registration' };
    }
  },
  
  // Sign out
  async signOut() {
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST'
      });
      
      return await response.json();
    } catch (error) {
      console.error('NextAuth sign out error:', error);
      return { error: 'An error occurred during sign out' };
    }
  },
  
  // Get session
  async getSession() {
    try {
      const response = await fetch('/api/auth/session');
      return await response.json();
    } catch (error) {
      console.error('NextAuth get session error:', error);
      return { user: null, expires: null };
    }
  }
};
`;

module.exports = {
  nextAuthRouter,
  requireAuth,
  getSession,
  createSession,
  clientHelpers
};
