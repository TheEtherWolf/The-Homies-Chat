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
                            // This allows offline login with previously stored credentials
                            this._session = { user };
                            return { user };
                        }
                    } else {
                        // No token, but we have user data
                        this._session = { user };
                        return { user };
                    }
                } catch (parseError) {
                    this.log('Error parsing stored user:', parseError);
                    localStorage.removeItem('user');
                    sessionStorage.removeItem('user');
                }
            }
            
            // Try to get session from server
            const session = await this.getSession();
            if (session) {
                this.log('Found server session:', session);
                this._session = session;
                return session;
            }
            
            this.log('No valid session found');
            return null;
        } catch (error) {
            this.log('Error initializing NextAuth:', error);
            return null;
        } finally {
            this.log('Initialized', this._session);
            
            // Dispatch auth state change event
            const event = new CustomEvent('auth-state-changed', { 
                detail: { session: this._session } 
            });
            document.dispatchEvent(event);
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
            
            if (!response.ok) {
                this.log('Session fetch failed with status:', response.status);
                return null;
            }
            
            // Parse the response
            const result = await response.json();
            this.log('Session response:', result);
            
            if (response.ok) {
                this.log('Session fetch successful');
                return result;
            } else {
                throw new Error(result.error || 'Session fetch failed');
            }
        } catch (error) {
            this.log('Error fetching session:', error);
            throw error;
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
            // Make the API request to our custom signin endpoint
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
            
            if (response.ok) {
                this.log('Sign in successful');
                
                // Get session data
                const sessionResponse = await fetch('/api/auth/session', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
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
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(credentials)
            });
            
            this.log('Sign up response status:', response.status);
            
            // Parse the response
            const result = await response.json();
            this.log('Sign up response:', result);
            
            if (response.ok) {
                this.log('Sign up successful');
                
                // Get session data
                const sessionResponse = await fetch('/api/auth/session', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
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
            this.log('Sign out error:', error);
            throw error;
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
            
            // Get session data
            const sessionResponse = await fetch('/api/auth/session', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
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
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(credentials)
        });
        
        this.log('Sign up response status:', response.status);
        
        // Parse the response
        const result = await response.json();
        this.log('Sign up response:', result);
        
        if (response.ok) {
            this.log('Sign up successful');
            
            // Get session data
            const sessionResponse = await fetch('/api/auth/session', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
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
        this.log('Sign out error:', error);
        throw error;
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
    },
    
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
