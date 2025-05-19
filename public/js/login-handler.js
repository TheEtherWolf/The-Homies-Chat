/**
 * Login Handler for The Homies Chat
 * Provides a reliable login experience with clear error handling
 * Uses the NextAuth client for authentication and ChatManager for chat functionality
 */

class LoginHandler {
    constructor() {
        this.initialized = false;
        this.loginForm = null;
        this.loginError = null;
        this.loginBtn = null;
        this.authContainer = null;
        this.chatContainer = null;
        this.authScriptLoaded = false;
        
        // Initialize when the DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    /**
     * Load the NextAuth client
     */
    async loadNextAuth() {
        if (window.NextAuth) {
            this.log('NextAuth already loaded');
            return true;
        }
        
        return new Promise((resolve) => {
            this.log('Loading NextAuth client...');
            
            const script = document.createElement('script');
            script.src = '/js/nextauth-fixed.js';
            
            script.onload = () => {
                this.log('NextAuth client loaded');
                this.authScriptLoaded = true;
                resolve(true);
            };
            
            script.onerror = () => {
                console.error('Failed to load NextAuth client');
                this.showError('Failed to load authentication service. Please refresh the page.');
                resolve(false);
            };
            
            document.head.appendChild(script);
        });
    }
    
    /**
     * Initialize NextAuth
     */
    async initNextAuth() {
        try {
            if (!window.NextAuth) {
                throw new Error('NextAuth client not loaded');
            }
            
            await window.NextAuth.init();
            this.log('NextAuth initialized');
            return true;
        } catch (error) {
            console.error('Error initializing NextAuth:', error);
            this.showError('Failed to initialize authentication. Please try again.');
            return false;
        }
    }
    
    /**
     * Initialize the login handler
     */
    async init() {
        if (this.initialized) return;
        
        this.log('Initializing login handler...');
        
        // Get DOM elements
        this.loginForm = document.getElementById('login-form');
        this.loginError = document.getElementById('login-error');
        this.loginBtn = document.getElementById('login-btn');
        this.authContainer = document.getElementById('auth-container');
        this.chatContainer = document.getElementById('chat-container');
        
        if (!this.loginForm || !this.loginBtn) {
            this.log('Login form or button not found');
            return;
        }
        
        // Set up form submission
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        
        // Load NextAuth client
        const loaded = await this.loadNextAuth();
        if (!loaded) return;
        
        // Initialize NextAuth
        const initialized = await this.initNextAuth();
        if (!initialized) return;
        
        // Check for existing session
        await this.checkLoggedInState();
        
        this.initialized = true;
        this.log('Login handler initialized');
    }
    
    /**
     * Check if user is already logged in
     */
    async checkLoggedInState() {
        this.log('Checking for existing session...');
        
        try {
            if (!window.NextAuth) {
                throw new Error('NextAuth client not available');
            }
            
            const session = await window.NextAuth.getSession();
            if (session) {
                this.log('Found valid session, initializing chat...');
                await this.showChatInterface(session.user);
            } else {
                this.log('No valid session found, showing login form');
                this.showLoginForm();
            }
        } catch (error) {
            console.error('Error checking session:', error);
            this.showError('Failed to check login status. Please try again.');
            this.showLoginForm();
        }
    }
    
    /**
     * Handle login form submission
     * @param {Event} e - The form submit event
     */
    async handleLogin(e) {
        e.preventDefault();
        
        if (!this.loginForm) return;
        
        const email = this.loginForm.querySelector('input[type="email"]')?.value;
        const password = this.loginForm.querySelector('input[type="password"]')?.value;
        
        if (!email || !password) {
            this.showError('Please enter both email and password');
            return;
        }
        
        this.setLoading(true);
        
        try {
            if (!window.NextAuth) {
                throw new Error('Authentication service not available');
            }
            
            // Sign in using NextAuth
            const result = await window.NextAuth.signIn({
                email,
                password,
                redirect: false
            });
            
            if (result && result.ok) {
                // Get the updated session
                const session = await window.NextAuth.getSession();
                if (session && session.user) {
                    // Show chat interface
                    await this.showChatInterface(session.user);
                } else {
                    throw new Error('Failed to get user data after login');
                }
            } else {
                throw new Error(result?.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError(error.message || 'Login failed. Please try again.');
        } finally {
            this.setLoading(false);
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
    }
    
    /**
     * Show the chat interface
     * @param {Object} user - The authenticated user
     */
    async showChatInterface(user) {
        if (!user) {
            this.showError('No user data available');
            return;
        }
        
        this.log('Showing chat interface for user:', user.username || user.email);
        
        // Hide login form
        if (this.authContainer) {
            this.authContainer.style.display = 'none';
        }
        
        // Show chat container
        if (this.chatContainer) {
            this.chatContainer.style.display = 'block';
        }
        
        // Initialize chat with user
        if (window.initializeChatWithUser) {
            try {
                await window.initializeChatWithUser(user);
            } catch (error) {
                console.error('Error initializing chat:', error);
                this.showError('Failed to initialize chat. Please refresh the page.');
                this.showLoginForm();
            }
        } else {
            console.error('initializeChatWithUser function not found');
            this.showError('Chat functionality not available. Please refresh the page.');
            this.showLoginForm();
        }
    }
    
    /**
     * Show an error message
     * @param {string} message - The error message to show
     */
    showError(message) {
        console.error('[LOGIN] Error:', message);
        
        if (this.loginError) {
            this.loginError.textContent = message;
            this.loginError.style.display = 'block';
            
            // Auto-hide error after 5 seconds
            setTimeout(() => {
                if (this.loginError) {
                    this.loginError.style.display = 'none';
                }
            }, 5000);
        } else {
            console.error('Error element not found for message:', message);
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
