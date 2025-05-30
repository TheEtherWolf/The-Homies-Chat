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
        this.log('Attempting sign in for user:', credentials.email);
        
        try {
            // Make the API request
            const response = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(credentials)
            });
            
            this.log('Sign in response status:', response.status);
            
            // Parse the response
            const result = await response.json();
            this.log('Sign in response:', result);
            
            if (result.ok === true || result.success === true) {
                this.log('Sign in successful');
                
                // Store user data in localStorage
                const user = result.user || (result.session && result.session.user);
                if (user) {
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
     * Sign out the current user
     * @returns {Promise<Object>} Result of sign out attempt
     */
    async signOut() {
        this.log('Signing out user');
        
        try {
            // Clear local session data
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            this._session = null;
            
            // Notify server if available
            try {
                await fetch('/api/auth/signout', {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (serverError) {
                this.log('Server signout failed, continuing with local signout:', serverError);
            }
            
            // Dispatch auth state change event
            const event = new CustomEvent('auth-state-changed', { 
                detail: { session: null } 
            });
            document.dispatchEvent(event);
            
            this.log('Sign out successful');
            return { ok: true };
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
        if (!token) return false;
        
        this.log('Verifying session token');
        
        try {
            const response = await fetch('/api/auth/session', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                this.log('Session verification failed:', response.status);
                return false;
            }
            
            const data = await response.json();
            return data.valid === true;
        } catch (error) {
            this.log('Error verifying session:', error);
            return false;
        }
    },
    
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
                credentials: 'include',
                body: JSON.stringify(credentials)
            });
            
            this.log('Sign in response status:', response.status);
            
            // Parse the response
            const result = await response.json();
            this.log('Sign in response:', result);
    /**
     * Get the current session
     * @returns {Promise<Object|null>} The current session or null if not authenticated
     */
    async getSession() {
        try {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                const user = JSON.parse(storedUser);
                this._session = { user };
                return this._session;
            }
            return null;
        } catch (error) {
            console.error('Error getting session:', error);
            return null;
        }
    }
};

// Initialize NextAuth when the page loads
window.NextAuth = window.NextAuth || window.NextAuthSimplified;

// Add getSession method if it doesn't exist
if (!window.NextAuth.getSession) {
    window.NextAuth.getSession = async () => {
        try {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                return { user: JSON.parse(storedUser) };
            }
            return null;
        } catch (error) {
            console.error('Error getting session:', error);
            return null;
        }
    };
}

// Initialize NextAuth
(async function() {
    try {
        const session = await window.NextAuthSimplified.init();
        console.log('[NEXTAUTH_SIMPLE] Initialized', session);
        
        // Dispatch custom event when auth state changes
        const event = new CustomEvent('auth-state-changed', { 
            detail: { session } 
        });
        document.dispatchEvent(event);
    } catch (error) {
        console.error('[NEXTAUTH_SIMPLE] Initialization error:', error);
    }
})();
            const userData = result.user || result.session.user;
            const sessionData = {
                user: userData,
                token: token,
                expires: new Date((result.session && result.session.expires) || Date.now() + 24 * 60 * 60 * 1000)
            };

            // Update the session
            this._session = sessionData;

            // Store in localStorage for persistence
            localStorage.setItem('user', JSON.stringify(userData));
            localStorage.setItem('next_auth_session_token', token);

            this.log(`Session verified for user: ${userData.username || userData.email || 'unknown'}`);
            return true;
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
window.NextAuth = window.NextAuth || {};

// Add getSession method if it doesn't exist
if (!window.NextAuth.getSession) {
    window.NextAuth.getSession = async () => {
        try {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                return { user: JSON.parse(storedUser) };
            }
            return null;
        } catch (error) {
            console.error('Error getting session:', error);
            return null;
        }
    };
}

// Initialize NextAuth
(async function() {
    try {
        const session = await window.NextAuthSimplified.init();
        console.log('[NEXTAUTH_SIMPLE] Initialized', session);
        
        // Dispatch custom event when auth state changes
        const event = new CustomEvent('auth-state-changed', { 
            detail: { session } 
        });
        document.dispatchEvent(event);
    } catch (error) {
        console.error('[NEXTAUTH_SIMPLE] Initialization error:', error);
    }
})();
