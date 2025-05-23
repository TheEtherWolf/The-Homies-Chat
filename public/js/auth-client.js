/**
 * Simple Authentication Client for The Homies Chat
 * This provides a reliable authentication flow with clear error handling
 */

class AuthClient {
    constructor() {
        this._session = null;
        this._debug = true;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.getSession = this.getSession.bind(this);
        this.signIn = this.signIn.bind(this);
        this.signUp = this.signUp.bind(this);
        this.signOut = this.signOut.bind(this);
        
        // Initialize when constructed
        this.init();
    }
    
    /**
     * Log debug messages if debug mode is enabled
     */
    log(...args) {
        if (this._debug) {
            console.log('[AUTH_CLIENT]', ...args);
        }
    }
    
    /**
     * Initialize auth client
     * @returns {Promise<Object>} Session data if available
     */
    async init() {
        this.log('Initializing Auth Client');
        try {
            // Try to get session from localStorage
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    this.log('Found stored user:', user);
                    this._session = { user };
                    return { user };
                } catch (parseError) {
                    this.log('Error parsing stored user:', parseError);
                    localStorage.removeItem('user');
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
            this.log('Error initializing Auth Client:', error);
            return null;
        } finally {
            this.log('Initialized', this._session);
            
            // Dispatch auth state change event
            const event = new CustomEvent('auth-state-changed', { 
                detail: { session: this._session } 
            });
            document.dispatchEvent(event);
        }
    }
    
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
            
            if (result.success && result.user) {
                this.log('Session fetch successful');
                return { user: result.user };
            } else {
                return null;
            }
        } catch (error) {
            this.log('Error fetching session:', error);
            return null;
        }
    }
    
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
            
            if (response.ok && result.success) {
                this.log('Sign in successful');
                
                // Store user data in localStorage
                localStorage.setItem('user', JSON.stringify(result.user));
                this._session = { user: result.user };
                
                // Dispatch custom event for auth state change
                const event = new CustomEvent('auth-state-changed', { 
                    detail: { session: this._session } 
                });
                document.dispatchEvent(event);
                
                return { ok: true, user: result.user };
            } else {
                throw new Error(result.message || 'Authentication failed');
            }
        } catch (error) {
            this.log('Sign in error:', error);
            throw error;
        }
    }
    
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
            
            if (response.ok && result.success) {
                this.log('Sign up successful');
                
                // Store user data in localStorage
                localStorage.setItem('user', JSON.stringify(result.user));
                this._session = { user: result.user };
                
                // Dispatch custom event for auth state change
                const event = new CustomEvent('auth-state-changed', { 
                    detail: { session: this._session } 
                });
                document.dispatchEvent(event);
                
                return { ok: true, user: result.user };
            } else {
                throw new Error(result.message || 'Registration failed');
            }
        } catch (error) {
            this.log('Sign up error:', error);
            throw error;
        }
    }
    
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
    }
}

// Initialize and expose the auth client
window.AuthClient = new AuthClient();
