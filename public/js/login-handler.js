/**
 * Login Handler for The Homies Chat
 * Provides a reliable login experience with clear error handling
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
        
        // Try to get user from localStorage
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                console.log('[LOGIN] Found stored user:', user);
                
                // Show chat interface for stored user
                this.showChatInterface(user);
                return;
            } catch (e) {
                console.error('[LOGIN] Error parsing stored user:', e);
                localStorage.removeItem('user');
                sessionStorage.removeItem('user');
            }
        }
        
        // If NextAuthSimplified is available, try to use it
        if (window.NextAuthSimplified) {
            try {
                const session = await window.NextAuthSimplified.getSession();
                if (session && session.user) {
                    console.log('[LOGIN] Found NextAuth session:', session);
                    this.showChatInterface(session.user);
                    return;
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
                    
                    // Show chat interface
                    this.showChatInterface(response.user);
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
    showChatInterface(user) {
        console.log('[LOGIN] Showing chat interface for user:', user);
        
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
            
            // Force a reload to ensure everything is initialized properly
            console.log('[LOGIN] Reloading page to initialize chat interface');
            window.location.href = '/index.html?loggedIn=true';
            return;
        }
        
        // Dispatch userLoggedIn event
        const userLoggedInEvent = new CustomEvent('userLoggedIn', {
            detail: { user }
        });
        document.dispatchEvent(userLoggedInEvent);
        console.log('[LOGIN] Dispatched userLoggedIn event');
        
        // If ChatManager exists, initialize it
        if (window.chatManager && typeof window.chatManager.initialize === 'function') {
            console.log('[LOGIN] Initializing existing ChatManager');
            window.chatManager.initialize(user);
        } else if (typeof ChatManager === 'function' && window.socket) {
            console.log('[LOGIN] Creating new ChatManager instance');
            window.chatManager = new ChatManager(window.socket);
            window.chatManager.initialize(user);
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
