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
                    this.log('Found stored user:', user);
                    
                    // Verify the session with the server if possible
                    if (user.token) {
                        try {
                            const isValid = await this.verifySession(user.token);
                            if (isValid) {
                                this._session = { user };
                                this.log('Session verified successfully');
                                return { user };
                            } else {
                                this.log('Stored session is invalid, clearing');
                                localStorage.removeItem('user');
                                sessionStorage.removeItem('user');
                            }
                        } catch (verifyError) {
                            this.log('Error verifying session:', verifyError);
                            // Continue with stored user even if verification fails
                            // This allows offline login with previously stored credentials
                            this._session = { user };
                            return { user };
                        }
                    } else {
                        // No token but we have user data
                        this._session = { user };
                        return { user };
                    }
                } catch (parseError) {
                    this.log('Error parsing stored user:', parseError);
                    localStorage.removeItem('user');
                    sessionStorage.removeItem('user');
                }
            }
            
            this.log('No valid session found');
            return null;
        } catch (error) {
            console.error('NextAuth init error:', error);
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
        
        try {
            // Make the API request
            const response = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',  // Important for cookies/session
                body: JSON.stringify(credentials)
            });
            
            this.log('Sign in response status:', response.status);
            
            // Parse the response
            const result = await response.json();
            this.log('Sign in response:', result);
            
            if (result.ok === true || result.success === true) {
                this.log('Sign in successful');
                
                // Extract user data
                const user = result.user || (result.session && result.session.user) || {
                    username: credentials.username,
                    id: result.userId || 'user-' + Date.now(),
                    name: credentials.username,
                    email: credentials.email || ''
                };
                
                // If we have a session token in the response, use it
                if (result.token) {
                    user.token = result.token;
                } else if (result.session?.token) {
                    user.token = result.session.token;
                }
                
                // Generate a session token if not provided by the server
                if (!user.token) {
                    const session = createSession(user);
                    user.token = session.token;
                    this._session = session;
                    localStorage.setItem('next_auth_session_token', session.token);
                } else {
                    // Create a session object with the token from the server
                    this._session = {
                        token: user.token,
                        user: user,
                        expires: result.expires ? new Date(result.expires) : new Date(Date.now() + 24 * 60 * 60 * 1000) // Default 24h
                    };
                    localStorage.setItem('next_auth_session_token', user.token);
                }
                
                // Store user data in localStorage for persistence
                localStorage.setItem('user', JSON.stringify(user));
                
                return {
                    ok: true,
                    user: user,
                    token: user.token
                };
            } else {
                this.log('Sign in failed:', result.error || 'Unknown error');
                // Clear any existing session on failed login
                this._session = null;
                localStorage.removeItem('next_auth_session_token');
                localStorage.removeItem('user');
                
                return {
                    ok: false,
                    error: result.error || 'Sign in failed',
                    message: result.message || 'Invalid username or password'
                };
            }
        } catch (error) {
            this.log('Sign in error:', error);
            // Clear any existing session on error
            this._session = null;
            localStorage.removeItem('next_auth_session_token');
            localStorage.removeItem('user');
            
            return {
                ok: false,
                error: 'Network error',
                message: 'Could not connect to the server. Please check your connection.'
            };
        }
    },
    
    /**
     * Sign out the current user
     * @returns {Promise<Object>} Result of sign out attempt
     */
    async signOut() {
        this.log('Signing out');
        
        try {
            // Clear local storage
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            
            // Clear session
            this._session = null;
            
            // Try to call the server to clear session
            try {
                const response = await fetch('/api/auth/signout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                const result = await response.json();
                this.log('Sign out response:', result);
            } catch (apiError) {
                this.log('API sign out failed, but local sign out succeeded:', apiError);
                // Continue with local sign out even if API call fails
            }
            
            return {
                ok: true,
                success: true,
                message: 'Signed out successfully'
            };
        } catch (error) {
            console.error('Sign out error:', error);
            return {
                ok: false,
                success: false,
                error: error.message || 'An error occurred during sign out',
                message: error.message || 'An error occurred during sign out'
            };
        }
    },
    
    /**
     * Verify if a session token is valid
     * @param {string} token - Session token to verify
     * @returns {Promise<boolean>} True if session is valid
     */
    async verifySession(token) {
        this.log('Verifying session token');
        
        try {
            const response = await fetch('/api/auth/verify-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',  // Include cookies for session handling
                body: JSON.stringify({ token })
            });
            
            const result = await response.json();
            this.log('Verify session response:', result);
            
            if (result.ok && (result.user || result.session?.user)) {
                const userData = result.user || result.session.user;
                // Update the session with the user data
                this._session = { 
                    user: userData,
                    token: token,
                    expires: result.session?.expires || new Date(Date.now() + 24 * 60 * 60 * 1000)
                };
                // Store user in localStorage for persistence
                localStorage.setItem('user', JSON.stringify(userData));
                localStorage.setItem('next_auth_session_token', token);
                return true;
            }
            
            return false;
        } catch (error) {
            this.log('Verify session error:', error);
            return false;
        }
    },
    
    /**
     * Get the current session
     * @returns {Promise<Object>} Session data or null
     */
    async getSession() {
        // If we have a valid session in memory, verify it's still valid
        if (this._session?.token) {
            try {
                const isValid = await this.verifySession(this._session.token);
                if (isValid) {
                    return this._session;
                }
            } catch (error) {
                console.error('Error verifying session:', error);
            }
            // If we get here, the session is invalid, clear it
            this._session = null;
            localStorage.removeItem('next_auth_session_token');
        }
        
        // Try to get session from localStorage
        try {
            const token = localStorage.getItem('next_auth_session_token');
            if (token) {
                // Verify the token with the server
                const isValid = await this.verifySession(token);
                if (isValid) {
                    // Get the user data from localStorage if available
                    const userData = localStorage.getItem('user');
                    if (userData) {
                        try {
                            const user = JSON.parse(userData);
                            this._session = {
                                token: token,
                                user: user,
                                expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // Default 24h
                            };
                            return this._session;
                        } catch (e) {
                            console.error('Error parsing user data:', e);
                        }
                    }
                } else {
                    // Clear invalid token
                    localStorage.removeItem('next_auth_session_token');
                    localStorage.removeItem('user');
                }
            }
        } catch (error) {
            console.error('Error getting session:', error);
        }
        
        // If we get here, no valid session was found
        return null;
    },
    
    /**
     * Get the current user
     * @returns {Object} User data or null
     */
    /**
     * Get the current user
     * @returns {Object} User data or null
     */
    getUser() {
        return this._session ? this._session.user : null;
    },
    
    /**
     * Check if the user is authenticated
     * @returns {Promise<boolean>} True if authenticated
     */
    async isAuthenticated() {
        try {
            const session = await this.getSession();
            return !!session && !!session.user;
        } catch (error) {
            console.error('Error checking authentication status:', error);
            return false;
        }
    }
};

// Initialize NextAuth when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.NextAuthSimplified.init();
        console.log('[NEXTAUTH_SIMPLE] Initialization complete');
    } catch (error) {
        console.error('[NEXTAUTH_SIMPLE] Initialization error:', error);
    }
});
