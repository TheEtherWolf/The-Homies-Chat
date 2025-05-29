/**
 * Simplified NextAuth Client for The Homies Chat
 * This provides a reliable authentication flow with clear error handling
 */

window.NextAuthSimplified = {
    // Current session data
    _session: null,
    _debug: true,
    
    /**
     * Log debug messages if debug mode is enabled
     */
    log(...args) {
        if (this._debug) {
            console.log('[NEXTAUTH_SIMPLE]', ...args);
        }
    },
    
    /**
     * Initialize NextAuth client
     * @returns {Promise<Object>} Session data if available
     */
    async init() {
        this.log('Initializing NextAuth Simplified');
        try {
            // Try to get session from localStorage
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    this._session = { user };
                    this.log('Found stored user in localStorage', user.username);
                    return this._session;
                } catch (e) {
                    this.log('Failed to parse stored user', e);
                    // Clear invalid session data
                    localStorage.removeItem('user');
                }
            }
            
            // No valid session in localStorage, try to fetch from server
            const session = await this.getSession();
            return session;
        } catch (error) {
            this.log('Error initializing NextAuth', error);
            return null;
        }
    },
    
    /**
     * Get the current session from the server
     * @returns {Promise<Object>} Session data if available
     */
    async getSession() {
        try {
            const response = await fetch('/api/auth/session', {
                credentials: 'include'
            });
            
            const data = await response.json();
            this.log('Session response:', data);
            
            if (data && data.user) {
                this._session = { user: data.user };
                localStorage.setItem('user', JSON.stringify(data.user));
                this.log('Session fetch successful');
                return this._session;
            }
            
            return null;
        } catch (error) {
            this.log('Error getting session', error);
            return null;
        }
    },
    
    /**
     * Sign in with credentials
     * @param {Object} credentials - Username and password
     * @returns {Promise<Object>} Result of sign in attempt
     */
    async signIn(credentials) {
        this.log('Attempting sign in for user:', credentials.username);
        
        if (!credentials.username || !credentials.password) {
            return { ok: false, error: 'Username and password are required' };
        }
        
        try {
            // Make the API request to our custom signin endpoint
            const response = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials),
                credentials: 'include'
            });
            
            const result = await response.json();
            this.log('Sign in result:', result);
            
            if (result.ok && result.user) {
                // Store auth token if provided
                if (result.token) {
                    localStorage.setItem('auth_token', result.token);
                }
                
                // Get full session data
                const sessionResponse = await fetch('/api/auth/session', {
                    credentials: 'include'
                });
                
                const sessionData = await sessionResponse.json();
                const user = sessionData.user || result.user;
                
                if (user) {
                    // Store user data in localStorage
                    localStorage.setItem('user', JSON.stringify(user));
                    this._session = { user };
                    
                    // Dispatch custom event for auth state change
                    const event = new CustomEvent('auth-state-changed', { 
                        detail: { session: this._session } 
                    });
                    document.dispatchEvent(event);
                }
                
                return { ok: true, user };
            } else {
                throw new Error(result.error || 'Authentication failed');
            }
        } catch (error) {
            this.log('Sign in error:', error);
            throw error;
        }
    },
    
    /**
     * Sign up with credentials
     * @param {Object} credentials - Username, email, password, and confirmPassword
     * @returns {Promise<Object>} Result of sign up attempt
     */
    async signUp(credentials) {
        this.log('Attempting sign up for user:', credentials.username);
        
        try {
            // Make the API request to our custom signup endpoint
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials),
                credentials: 'include'
            });
            
            const result = await response.json();
            this.log('Sign up result:', result);
            
            if (result.ok) {
                // Return success but don't automatically sign in
                return { ok: true, message: result.message || 'Registration successful' };
            } else {
                throw new Error(result.error || 'Registration failed');
            }
        } catch (error) {
            this.log('Sign up error:', error);
            throw error;
        }
    },
    
    /**
     * Sign out the current user
     * @returns {Promise<Object>} Result of sign out attempt
     */
    async signOut() {
        this.log('Signing out user');
        
        try {
            // Make the API request to our custom signout endpoint
            const response = await fetch('/api/auth/signout', {
                method: 'POST',
                credentials: 'include'
            });
            
            // Clear local storage regardless of server response
            localStorage.removeItem('user');
            localStorage.removeItem('auth_token');
            sessionStorage.removeItem('user');
            this._session = null;
            
            // Dispatch custom event for auth state change
            const event = new CustomEvent('auth-state-changed', { 
                detail: { session: null } 
            });
            document.dispatchEvent(event);
            
            const result = await response.json();
            this.log('Sign out result:', result);
            
            return { ok: true, message: 'Signed out successfully' };
        } catch (error) {
            this.log('Sign out error:', error);
            // Still return success even if API call fails, as we've cleared local data
            return { ok: true, message: 'Signed out locally' };
        }
    },
    
    /**
     * Verify if a session token is valid
     * @param {string} token - Session token to verify
     * @returns {Promise<boolean>} True if session is valid
     */
    async verifySession(token) {
        this.log('Verifying session token');
        
        if (!token) {
            return false;
        }
        
        try {
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token }),
                credentials: 'include'
            });
            
            const result = await response.json();
            this.log('Verify session result:', result);
            
            return result.valid === true;
        } catch (error) {
            this.log('Verify session error:', error);
            return false;
        }
    }
};

// Initialize NextAuth when the page loads
window.NextAuth = window.NextAuth || window.NextAuthSimplified;

// Helper function to get the current session
window.getSession = async function() {
    if (!window.NextAuth) return null;
    
    try {
        return await window.NextAuth.getSession();
    } catch (e) {
        console.error('Error getting session:', e);
        return null;
    }
};

// Initialize NextAuth
(async function() {
    try {
        await window.NextAuthSimplified.init();
    } catch (e) {
        console.error('Error initializing NextAuth:', e);
    }
})();
