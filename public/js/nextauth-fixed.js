/**
 * Fixed NextAuth Client for The Homies Chat
 * Simplified and robust authentication flow with proper error handling
 */

window.NextAuth = {
    // Current session data
    _session: null,
    _debug: true,
    
    /**
     * Log debug messages if debug mode is enabled
     */
    log(...args) {
        if (this._debug) {
            console.log('[NEXTAUTH]', ...args);
        }
    },
    
    /**
     * Initialize NextAuth client
     * @returns {Promise<Object>} Session data if available
     */
    async init() {
        this.log('Initializing NextAuth');
        try {
            // Try to get session from localStorage
            const storedUser = localStorage.getItem('user');
            const storedToken = localStorage.getItem('next_auth_session_token');
            
            if (storedUser && storedToken) {
                try {
                    const user = JSON.parse(storedUser);
                    this.log('Found stored user:', user.username || user.email || 'unknown');
                    
                    // Verify the session with the server
                    const isValid = await this.verifySession(storedToken);
                    if (isValid) {
                        this._session = { 
                            user,
                            token: storedToken,
                            expires: new Date(Date.now() + 24 * 60 * 60 * 1000)
                        };
                        this.log('Session verified successfully');
                        return this._session;
                    } else {
                        this.log('Stored session is invalid, clearing');
                        this._clearSession();
                    }
                } catch (error) {
                    this.log('Error initializing session:', error);
                    this._clearSession();
                }
            } else {
                this.log('No stored session found');
            }
            
            return null;
        } catch (error) {
            this.log('Error during initialization:', error);
            return null;
        }
    },
    
    /**
     * Sign in with credentials
     * @param {Object} credentials - Username and password
     * @returns {Promise<Object>} Result of sign in attempt
     */
    async signIn(credentials) {
        this.log('Attempting sign in with credentials');
        
        try {
            const response = await fetch('/api/auth/signin/email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: credentials.email,
                    password: credentials.password,
                    redirect: false,
                    callbackUrl: '/chat'
                })
            });
            
            let result;
            try {
                result = await response.json();
            } catch (e) {
                throw new Error('Invalid response from server');
            }
            
            this.log('Sign in response:', result);
            
            if (result.ok || (result.user && result.token)) {
                // If we got a token directly in the response
                const token = result.token || result.user?.token;
                const user = result.user || result;
                
                if (!token) {
                    throw new Error('No token received in response');
                }
                
                // Store the token and user data
                localStorage.setItem('next_auth_session_token', token);
                localStorage.setItem('user', JSON.stringify(user));
                
                // Update the current session
                this._session = {
                    user: user,
                    token: token,
                    expires: new Date(result.expires || Date.now() + 24 * 60 * 60 * 1000)
                };
                
                this.log('Sign in successful for user:', user.username || user.email || 'unknown');
                return { ok: true, user: result.user };
            } else {
                throw new Error(result.error || 'Authentication failed');
            }
        } catch (error) {
            this.log('Sign in error:', error);
            this._clearSession();
            return { 
                ok: false, 
                error: error.message || 'Failed to sign in. Please try again.' 
            };
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
            this._clearSession();
            
            // Call server-side sign out
            await fetch('/api/auth/signout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    callbackUrl: '/login',
                    redirect: false
                })
            });
            
            this.log('Sign out successful');
            return { ok: true };
        } catch (error) {
            this.log('Sign out error:', error);
            return { 
                ok: false, 
                error: error.message || 'Failed to sign out. Please try again.' 
            };
        }
    },
    
    /**
     * Verify if a session token is valid
     * @param {string} token - Session token to verify
     * @returns {Promise<boolean>} True if session is valid
     */
    async verifySession(token) {
        if (!token) {
            this.log('No token provided for verification');
            return false;
        }
        
        this.log('Verifying session token');
        
        try {
            const response = await fetch('/api/auth/verify-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ token })
            });
            
            const data = await response.json();
            
            if (response.ok && data.valid) {
                this.log('Session verified successfully');
                // Update the stored user data if we got a fresh copy
                if (data.user) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                }
                return true;
            } else {
                this.log('Session verification failed:', data.error || 'Invalid session');
                this._clearSession();
                return false;
            }
        } catch (error) {
            this.log('Error verifying session:', error);
            // Don't clear session on network errors
            if (error.name !== 'TypeError') {
                this._clearSession();
            }
            return false;
        }
    },
    
    /**
     * Get the current session
     * @returns {Promise<Object>} Session data or null
     */
    async getSession() {
        // If we already have a valid session in memory, use it
        if (this._session?.token) {
            try {
                const isValid = await this.verifySession(this._session.token);
                if (isValid) {
                    // Refresh the user data from localStorage in case it was updated
                    const storedUser = localStorage.getItem('user');
                    if (storedUser) {
                        this._session.user = JSON.parse(storedUser);
                    }
                    return this._session;
                }
            } catch (error) {
                this.log('Error verifying existing session:', error);
            }
        }
        
        // Try to get session from localStorage
        const storedToken = localStorage.getItem('next_auth_session_token');
        const storedUser = localStorage.getItem('user');
        
        if (storedToken && storedUser) {
            try {
                const isValid = await this.verifySession(storedToken);
                if (isValid) {
                    this._session = {
                        user: JSON.parse(storedUser),
                        token: storedToken,
                        expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                    };
                    return this._session;
                }
            } catch (error) {
                this.log('Error getting session:', error);
                this._clearSession();
            }
        }
        
        return null;
    },
    
    /**
     * Get the current user
     * @returns {Promise<Object>} User data or null
     */
    async getUser() {
        const session = await this.getSession();
        return session && session.user ? session.user : null;
    },
    
    /**
     * Get the current session token
     * @returns {Promise<string>} Session token or null
     */
    async getToken() {
        const session = await this.getSession();
        return session && session.token ? session.token : null;
    },
    
    /**
     * Clear the current session
     */
    _clearSession() {
        this._session = null;
        localStorage.removeItem('user');
        localStorage.removeItem('next_auth_session_token');
        sessionStorage.removeItem('user');
    }
};

// Initialize NextAuth when the page loads
document.addEventListener('DOMContentLoaded', function() {
    window.NextAuth.init().catch(function(error) {
        console.error('Error initializing NextAuth:', error);
    });
});
