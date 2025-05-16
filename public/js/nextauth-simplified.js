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
                    'Content-Type': 'application/json'
                },
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
                    name: credentials.username
                };
                
                // Add token if available
                if (result.session && result.session.token) {
                    user.token = result.session.token;
                }
                
                // Store the session
                this._session = { user };
                
                // Store in localStorage and sessionStorage
                localStorage.setItem('user', JSON.stringify(user));
                sessionStorage.setItem('user', JSON.stringify(user));
                
                return {
                    ok: true,
                    success: true,
                    user: user,
                    message: 'Login successful'
                };
            } else {
                this.log('Sign in failed:', result.error || result.message || 'Unknown error');
                return {
                    ok: false,
                    success: false,
                    error: result.error || result.message || 'Login failed',
                    message: result.message || result.error || 'Login failed'
                };
            }
        } catch (error) {
            console.error('Sign in error:', error);
            return {
                ok: false,
                success: false,
                error: error.message || 'An error occurred during sign in',
                message: error.message || 'An error occurred during sign in'
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
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });
            
            const result = await response.json();
            this.log('Verify session response:', result);
            
            return result.ok === true;
        } catch (error) {
            this.log('Verify session error:', error);
            return false;
        }
    },
    
    /**
     * Get the current session
     * @returns {Object} Session data or null
     */
    getSession() {
        return this._session;
    },
    
    /**
     * Get the current user
     * @returns {Object} User data or null
     */
    getUser() {
        return this._session ? this._session.user : null;
    },
    
    /**
     * Check if the user is authenticated
     * @returns {boolean} True if authenticated
     */
    isAuthenticated() {
        return !!this._session && !!this._session.user;
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
