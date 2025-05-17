/**
 * Login Handler for The Homies Chat
 * Provides a reliable login experience with clear error handling
 * Relies solely on NextAuthSimplified for authentication and ChatManager for chat functionality
 */

class LoginHandler {
    constructor() {
        this.initialized = false;
        this.loginForm = null;
        this.loginError = null;
        this.loginBtn = null;
        this.authContainer = null;
        this.chatContainer = null;
        
        // Initialize when the DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    /**
     * Initialize the login handler
     */
    init() {
        if (this.initialized) return;
        
        console.log('[LOGIN] Initializing login handler');
        
        // Get DOM elements
        this.loginForm = document.getElementById('login-form');
        this.loginError = document.getElementById('login-error');
        this.loginBtn = document.getElementById('login-btn');
        this.authContainer = document.getElementById('auth-container');
        this.chatContainer = document.getElementById('chat-container');
        
        // Log initialization status
        console.log('[LOGIN] Elements initialized:', {
            loginForm: !!this.loginForm,
            loginError: !!this.loginError,
            loginBtn: !!this.loginBtn,
            authContainer: !!this.authContainer,
            chatContainer: !!this.chatContainer
        });
        
        // Add event listeners
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
            console.log('[LOGIN] Added submit handler to login form');
        }
        
        // Check if user is already logged in
        this.checkLoggedInState();
        
        this.initialized = true;
    }
    
    /**
     * Check if user is already logged in
     */
    async checkLoggedInState() {
        console.log('[LOGIN] Checking logged in state');
        
        // Helper function to verify and handle user session
        const verifyAndHandleUser = async (user, source) => {
            if (!user) return false;
            
            try {
                console.log(`[LOGIN] Found user in ${source}:`, user);
                
                // If we have a token, verify it first
                if (user.token && window.NextAuthSimplified) {
                    console.log(`[LOGIN] Verifying session from ${source}`);
                    const isValid = await window.NextAuthSimplified.verifySession(user.token);
                    
                    if (!isValid) {
                        console.log(`[LOGIN] Session from ${source} is invalid`);
                        return false;
                    }
                    console.log(`[LOGIN] Session from ${source} is valid`);
                }
                
                // Show chat interface for valid user
                await this.showChatInterface(user);
                return true;
                
            } catch (e) {
                console.error(`[LOGIN] Error processing user from ${source}:`, e);
                // Clean up invalid data
                if (source === 'localStorage') {
                    localStorage.removeItem('user');
                    sessionStorage.removeItem('user');
                }
                return false;
            }
        };
        
        // Try to get user from localStorage first
        try {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                const user = JSON.parse(storedUser);
                const isHandled = await verifyAndHandleUser(user, 'localStorage');
                if (isHandled) return;
            }
        } catch (e) {
            console.error('[LOGIN] Error parsing stored user:', e);
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
        }
        
        // If NextAuthSimplified is available, try to use it
        if (window.NextAuthSimplified) {
            try {
                console.log('[LOGIN] Checking NextAuth session');
                const session = await window.NextAuthSimplified.getSession();
                if (session?.user) {
                    const isHandled = await verifyAndHandleUser(session.user, 'NextAuth');
                    if (isHandled) return;
                }
            } catch (e) {
                console.error('[LOGIN] Error getting NextAuth session:', e);
            }
        }
        
        // If we get here, user is not logged in
        console.log('[LOGIN] User is not logged in, showing login form');
        this.showLoginForm();
    }
    
    /**
     * Handle login form submission
     * @param {Event} event - Form submit event
     */
    async handleLogin(event) {
        event.preventDefault();
        
        // Get form data
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            this.showError('Username and password are required');
            return;
        }
        
        console.log('[LOGIN] Attempting login for user:', username);
        
        // Disable login button and show loading state
        if (this.loginBtn) {
            this.loginBtn.disabled = true;
            this.loginBtn.textContent = 'Logging in...';
        }
        
        // Clear previous errors
        this.hideError();
        
        try {
            // Try to use NextAuthSimplified if available
            if (window.NextAuthSimplified) {
                console.log('[LOGIN] Using NextAuthSimplified for login');
                
                const response = await window.NextAuthSimplified.signIn({ username, password });
                console.log('[LOGIN] Login response:', response);
                
                // Re-enable login button
                if (this.loginBtn) {
                    this.loginBtn.disabled = false;
                    this.loginBtn.textContent = 'Sign In';
                }
                
                if (response && (response.ok === true || response.success === true)) {
                    console.log('[LOGIN] Login successful');
                    
                    // Verify session before showing chat interface
                    if (response.user && response.user.token) {
                        console.log('[LOGIN] Verifying session after login');
                        const isValid = await window.NextAuthSimplified.verifySession(response.user.token);
                        
                        if (!isValid) {
                            console.error('[LOGIN] Session verification failed after login');
                            this.showError('Session verification failed. Please try again.');
                            return;
                        }
                        console.log('[LOGIN] Session verified successfully after login');
                    }
                    
                    // Show chat interface
                    await this.showChatInterface(response.user);
                } else {
                    const errorMsg = response && response.message ? response.message : 'Login failed';
                    console.error('[LOGIN] Login failed:', errorMsg);
                    this.showError(errorMsg);
                }
                return;
            }
            
            // Fall back to NextAuth if available
            if (window.NextAuth && typeof window.NextAuth.signIn === 'function') {
                console.log('[LOGIN] Using NextAuth for login');
                
                const response = await window.NextAuth.signIn({ username, password });
                console.log('[LOGIN] NextAuth login response:', response);
                
                // Re-enable login button
                if (this.loginBtn) {
                    this.loginBtn.disabled = false;
                    this.loginBtn.textContent = 'Sign In';
                }
                
                if (response && (response.ok === true || response.success === true || response.user)) {
                    console.log('[LOGIN] Login successful');
                    
                    // Show chat interface
                    this.showChatInterface(response.user);
                } else {
                    const errorMsg = response && response.message ? response.message : 'Login failed';
                    console.error('[LOGIN] Login failed:', errorMsg);
                    this.showError(errorMsg);
                }
                return;
            }
            
            // Fall back to direct API call
            console.log('[LOGIN] No auth provider available, making direct API call');
            
            const response = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            console.log('[LOGIN] API login response:', result);
            
            // Re-enable login button
            if (this.loginBtn) {
                this.loginBtn.disabled = false;
                this.loginBtn.textContent = 'Sign In';
            }
            
            if (result.ok === true || result.success === true) {
                console.log('[LOGIN] API login successful');
                
                // Extract user data
                const user = result.user || (result.session && result.session.user) || {
                    username,
                    id: result.userId || 'user-' + Date.now(),
                    name: username
                };
                
                // Show chat interface
                this.showChatInterface(user);
            } else {
                const errorMsg = result.error || result.message || 'Login failed';
                console.error('[LOGIN] API login failed:', errorMsg);
                this.showError(errorMsg);
            }
        } catch (error) {
            console.error('[LOGIN] Error during login:', error);
            
            // Re-enable login button
            if (this.loginBtn) {
                this.loginBtn.disabled = false;
                this.loginBtn.textContent = 'Sign In';
            }
            
            this.showError('An error occurred during login. Please try again.');
        }
    }
    
    /**
     * Show the login form
     */
    showLoginForm() {
        if (this.authContainer) {
            this.authContainer.style.display = 'block';
        }
        
        if (this.chatContainer) {
            this.chatContainer.style.display = 'none';
        }
        
        console.log('[LOGIN] Login form shown');
    }
    
    /**
     * Show the chat interface
     * @param {Object} user - User data
     */
    async showChatInterface(user) {
        console.log('[LOGIN] Showing chat interface for user:', user);
        
        try {
            // Store user data
            localStorage.setItem('user', JSON.stringify(user));
            sessionStorage.setItem('user', JSON.stringify(user));
            
            // Hide auth container
            if (this.authContainer) {
                this.authContainer.style.display = 'none';
                console.log('[LOGIN] Auth container hidden');
            }
            
            // Show chat container
            if (this.chatContainer) {
                this.chatContainer.classList.remove('d-none', 'hidden');
                this.chatContainer.style.display = 'flex';
                console.log('[LOGIN] Chat container shown');
            } else {
                console.warn('[LOGIN] Chat container not found, creating it');
                
                // Create chat container if it doesn't exist
                this.chatContainer = document.createElement('div');
                this.chatContainer.id = 'chat-container';
                this.chatContainer.style.display = 'flex';
                
                // Add it to the document
                document.body.appendChild(this.chatContainer);
            }
            
            // Initialize ChatManager with the user data (wait for it to complete)
            await this.initializeChatManager(user);
            
            // Only dispatch the event if ChatManager was initialized successfully
            const userLoggedInEvent = new CustomEvent('userLoggedIn', {
                detail: { user },
                bubbles: true,
                cancelable: true
            });
            
            const eventDispatched = document.dispatchEvent(userLoggedInEvent);
            console.log('[LOGIN] Dispatched userLoggedIn event, default prevented:', !eventDispatched);
            
        } catch (error) {
            console.error('[LOGIN] Error in showChatInterface:', error);
            this.showError('Failed to initialize chat interface. Please try again.');
            this.showLoginForm();
        }
    }
    
    /**
     * Initialize the ChatManager with user data after verifying session
     * @param {Object} user - User data
     */
    async initializeChatManager(user) {
        try {
            // Verify session first
            if (window.NextAuthSimplified && user && user.token) {
                console.log('[LOGIN] Verifying session before initializing ChatManager');
                const isValid = await window.NextAuthSimplified.verifySession(user.token);
                
                if (!isValid) {
                    console.error('[LOGIN] Session verification failed, cannot initialize ChatManager');
                    this.showError('Session verification failed. Please log in again.');
                    this.showLoginForm();
                    return;
                }
                console.log('[LOGIN] Session verified successfully');
            }
            
            // If ChatManager exists, initialize it
            if (window.chatManager && typeof window.chatManager.initialize === 'function') {
                console.log('[LOGIN] Initializing existing ChatManager');
                window.chatManager.initialize(user);
            } else if (typeof ChatManager === 'function' && window.socket) {
                console.log('[LOGIN] Creating new ChatManager instance');
                window.chatManager = new ChatManager(window.socket);
                window.chatManager.initialize(user);
            } else {
                console.error('[LOGIN] ChatManager not available');
                throw new Error('ChatManager not available');
            }
        } catch (error) {
            console.error('[LOGIN] Error initializing ChatManager:', error);
            this.showError('Failed to initialize chat. Please refresh and try again.');
            this.showLoginForm();
        }
    }
    
    /**
     * Show an error message
     * @param {string} message - Error message
     */
    showError(message) {
        if (this.loginError) {
            this.loginError.textContent = message;
            this.loginError.style.display = 'block';
        } else {
            alert(message);
        }
    }
    
    /**
     * Hide the error message
     */
    hideError() {
        if (this.loginError) {
            this.loginError.style.display = 'none';
        }
    }
}

// Initialize the login handler
window.loginHandler = new LoginHandler();
