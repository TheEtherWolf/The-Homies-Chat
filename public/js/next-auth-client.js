/**
 * NextAuth Client-Side Library for The Homies Chat
 * This provides NextAuth-like functionality for authentication in the browser
 */

// Simple UUID v4 generator function
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// NextAuth client namespace
window.NextAuth = {
  // Current session data
  _session: null,
  
  /**
   * Initialize NextAuth client
   * @returns {Promise<Object>} Session data if available
   */
  async init() {
    try {
      // Try to get session from cookie or localStorage
      const token = this._getStoredToken();
      
      if (token) {
        // Validate the token with the server
        const session = await this.getSession();
        
        if (session && session.user) {
          this._session = session;
          return session;
        }
      }
      
      return null;
    } catch (error) {
      console.error('NextAuth init error:', error);
      return null;
    }
  },
  
  /**
   * Sign in with credentials
   * @param {Object} credentials - Username and password
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result of sign in attempt
   */
  async signIn(credentials, options = {}) {
    console.log('[NEXTAUTH_DEBUG] Attempting sign in with credentials:', { ...credentials, password: '***' });
    
    try {
      // First try the REST API endpoint
      try {
        console.log('[NEXTAUTH_DEBUG] Trying REST API endpoint for login');
        const response = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(credentials)
        });
        
        console.log('[NEXTAUTH_DEBUG] REST API response status:', response.status);
        
        const result = await response.json();
        console.log('[NEXTAUTH_DEBUG] REST API login response:', result);
        
        if (result.ok === true) {
          console.log('[NEXTAUTH_DEBUG] REST API login successful, storing session');
          this._storeToken(result.session.token);
          this._session = result.session;
          return {
            success: true,
            user: result.user, // Use user directly from the response
            message: 'Login successful'
          };
        } else {
          console.warn('[NEXTAUTH_DEBUG] REST API login failed:', result.error || 'Unknown error');
        }
      } catch (restError) {
        console.warn('[NEXTAUTH_DEBUG] REST signin failed, trying socket:', restError);
        // REST API failed, fall back to socket
      }
      
      // Fall back to socket.io for backward compatibility
      console.log('[NEXTAUTH_DEBUG] Falling back to socket.io for login');
      return new Promise((resolve) => {
        if (!window.socket) {
          console.error('[NEXTAUTH_DEBUG] No socket connection available');
          return resolve({ 
            success: false, 
            message: 'No socket connection available' 
          });
        }
        
        console.log('[NEXTAUTH_DEBUG] Emitting login-user event to socket');
        window.socket.emit('login-user', credentials, (result) => {
          console.log('[NEXTAUTH_DEBUG] Received login response from socket:', result);
          
          if (result && result.success) {
            console.log('[NEXTAUTH_DEBUG] Socket login successful, storing user data');
            
            // Create a session object even if one wasn't returned
            const sessionData = result.session || {
              token: uuidv4(), // Generate a token if none was provided
              expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
            };
            
            this._storeToken(sessionData.token);
            this._session = {
              user: result.user,
              expires: sessionData.expires
            };
            
            // Return a standardized success response
            resolve({
              success: true,
              user: result.user,
              message: 'Login successful'
            });
          } else {
            console.error('[NEXTAUTH_DEBUG] Socket login failed:', result ? result.message : 'No response');
            resolve(result || { 
              success: false, 
              message: 'Login failed with no response from server' 
            });
          }
        });
      });
    } catch (error) {
      console.error('[NEXTAUTH_DEBUG] NextAuth sign in error:', error);
      return { 
        success: false, 
        message: 'An error occurred during sign in: ' + (error.message || 'Unknown error')
      };
    }
  },
  
  /**
   * Sign up with credentials
   * @param {Object} credentials - Registration data
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result of sign up attempt
   */
  async signUp(credentials, options = {}) {
    try {
      // First try the REST API endpoint
      try {
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(credentials)
        });
        
        const result = await response.json();
        
        if (result.ok) {
          this._storeToken(result.session.token);
          this._session = result.session;
          return result;
        }
      } catch (restError) {
        console.warn('REST signup failed, trying socket:', restError);
        // REST API failed, fall back to socket
      }
      
      // Fall back to socket.io for backward compatibility
      return new Promise((resolve) => {
        if (!window.socket) {
          return resolve({ 
            success: false, 
            message: 'No socket connection available' 
          });
        }
        
        window.socket.emit('register-user', credentials, (result) => {
          if (result.success && result.session) {
            this._storeToken(result.session.token);
            this._session = {
              user: result.user,
              expires: result.session.expires
            };
          }
          resolve(result);
        });
      });
    } catch (error) {
      console.error('NextAuth sign up error:', error);
      return { 
        success: false, 
        message: 'An error occurred during registration' 
      };
    }
  },
  
  /**
   * Sign out the current user
   * @returns {Promise<Object>} Result of sign out attempt
   */
  async signOut() {
    try {
      // First try the REST API endpoint
      try {
        const response = await fetch('/api/auth/signout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this._getStoredToken()}`
          }
        });
        
        const result = await response.json();
        
        if (result.ok) {
          this._clearToken();
          this._session = null;
          return result;
        }
      } catch (restError) {
        console.warn('REST signout failed:', restError);
      }
      
      // Clear local session regardless
      this._clearToken();
      this._session = null;
      
      return { success: true };
    } catch (error) {
      console.error('NextAuth sign out error:', error);
      
      // Still clear token on error
      this._clearToken();
      this._session = null;
      
      return { 
        success: false, 
        message: 'An error occurred during sign out' 
      };
    }
  },
  
  /**
   * Get the current session
   * @returns {Promise<Object>} Session data
   */
  async getSession() {
    try {
      // If we have a cached session and it's not expired, return it
      if (this._session) {
        const expires = new Date(this._session.expires);
        if (expires > new Date()) {
          return this._session;
        }
      }
      
      // Otherwise fetch from the server
      const token = this._getStoredToken();
      
      if (!token) {
        return { user: null, expires: null };
      }
      
      const response = await fetch('/api/auth/session', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const session = await response.json();
      
      if (session && session.user) {
        this._session = session;
      } else {
        this._clearToken();
        this._session = null;
      }
      
      return session;
    } catch (error) {
      console.error('NextAuth get session error:', error);
      return { user: null, expires: null };
    }
  },
  
  /**
   * Check if the user is authenticated
   * @returns {Promise<boolean>} True if authenticated
   */
  async isAuthenticated() {
    const session = await this.getSession();
    return !!(session && session.user);
  },
  
  /**
   * Get the current user
   * @returns {Promise<Object>} User data or null
   */
  async getUser() {
    const session = await this.getSession();
    return session?.user || null;
  },
  
  /**
   * Store authentication token
   * @param {string} token - Authentication token
   * @private
   */
  _storeToken(token) {
    if (!token) return;
    
    // Store in localStorage for persistence
    try {
      localStorage.setItem('next_auth_token', token);
    } catch (e) {
      console.warn('Failed to store token in localStorage:', e);
    }
  },
  
  /**
   * Get stored authentication token
   * @returns {string|null} Authentication token
   * @private
   */
  _getStoredToken() {
    // Try to get from localStorage
    try {
      return localStorage.getItem('next_auth_token');
    } catch (e) {
      console.warn('Failed to get token from localStorage:', e);
    }
    
    return null;
  },
  
  /**
   * Clear authentication token
   * @private
   */
  _clearToken() {
    try {
      localStorage.removeItem('next_auth_token');
    } catch (e) {
      console.warn('Failed to clear token from localStorage:', e);
    }
  }
};

// Initialize NextAuth when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await NextAuth.init();
    console.log('NextAuth initialized');
  } catch (error) {
    console.error('Failed to initialize NextAuth:', error);
  }
});
