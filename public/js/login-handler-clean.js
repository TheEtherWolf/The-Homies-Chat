/**
 * Login Handler for The Homies Chat
 * Provides a reliable login experience with clear error handling
 * Uses the NextAuth client for authentication
 */

class LoginHandler {
    constructor() {
        this.initialized = false;
        this.loginForm = null;
        this.loginError = null;
        this.loginBtn = null;
        this.loginBtnText = null;
        this.loginSpinner = null;
        this.authContainer = null;
        this.chatContainer = null;
        this.authScriptLoaded = false;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.handleLogin = this.handleLogin.bind(this);
        this.loadNextAuth = this.loadNextAuth.bind(this);
        this.initNextAuth = this.initNextAuth.bind(this);
        this.checkLoggedInState = this.checkLoggedInState.bind(this);
        this.setLoading = this.setLoading.bind(this);
        this.showError = this.showError.bind(this);
        this.showLoginForm = this.showLoginForm.bind(this);
        this.showChatInterface = this.showChatInterface.bind(this);
        
        // Initialize when the DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    /**
     * Log a message to the console
     * @param {string} message - The message to log
     * @param {...any} args - Additional arguments to log
     */
    log(message, ...args) {
        console.log(`[LoginHandler] ${message}`, ...args);
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
            script.src = '/js/nextauth-clean.js';
            
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
            
            // Initialize with required configuration
            await window.NextAuth.init({
                baseUrl: window.location.origin,
                basePath: '/api/auth',
                csrfToken: document.querySelector('meta[name="csrf-token"]')?.content
            });
            
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
        
        try {
            // Get DOM elements
            this.loginForm = document.getElementById('login-form');
            this.loginError = document.getElementById('login-error');
            this.loginBtn = document.getElementById('login-btn');
            this.loginBtnText = document.getElementById('login-btn-text');
            this.loginSpinner = document.getElementById('login-spinner');
            this.authContainer = document.getElementById('auth-container');
            this.chatContainer = document.getElementById('chat-container');
            
            if (!this.loginForm || !this.loginBtn || !this.loginBtnText || !this.loginSpinner) {
                throw new Error('Required login elements not found');
            }
            
            // Set up form submission
            this.loginForm.addEventListener('submit', this.handleLogin);
            
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
        } catch (error) {
            console.error('Error initializing login handler:', error);
            this.showError('Failed to initialize login handler. Please refresh the page.');
        }
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
            if (session && session.user) {
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
     * Set loading state for the login button
     * @param {boolean} isLoading - Whether the login button should show loading state
     */
    setLoading(isLoading) {
        if (!this.loginBtn || !this.loginBtnText || !this.loginSpinner) return;
        
        this.loginBtn.disabled = isLoading;
        
        if (isLoading) {
            this.loginBtnText.textContent = 'Signing in...';
            this.loginSpinner.classList.remove('d-none');
        } else {
            this.loginBtnText.textContent = 'Sign In';
            this.loginSpinner.classList.add('d-none');
        }
    }
    
    /**
     * Handle login form submission
     * @param {Event} e - The form submit event
     */
    async handleLogin(e) {
        e.preventDefault();
        
        if (!this.loginForm) return;
        
        const username = this.loginForm.querySelector('input[name="username"]').value.trim();
        const password = this.loginForm.querySelector('input[name="password"]').value;
        
        if (!username) {
            this.showError('Please enter your username');
            return;
        }
        
        if (!password) {
            this.showError('Please enter your password');
            return;
        }
        
        this.setLoading(true);
        
        try {
            if (!window.NextAuth || !window.NextAuth.signIn) {
                throw new Error('Authentication service not available. Please refresh the page.');
            }
            
            // Sign in using NextAuth
            const result = await window.NextAuth.signIn({
                username,
                password
            });
            
            if (!result.ok || !result.user) {
                throw new Error('Login failed. Please check your credentials and try again.');
            }
            
            // If we get here, login was successful
            this.log('Login successful:', result.user);
            
            // Show chat interface
            await this.showChatInterface(result.user);
            
            // Redirect to chat page
            window.location.href = '/chat.html';
        } catch (error) {
            console.error('Login error:', error);
            this.showError(error.message || 'Login failed. Please check your credentials and try again.');
        } finally {
            this.setLoading(false);
        }
    }
    
    /**
     * Show error message
     * @param {string} message - The error message to display
     */
    showError(message) {
        if (this.loginError) {
            this.loginError.textContent = message;
            this.loginError.style.display = 'block';
            
            // Auto-hide error after 5 seconds
            setTimeout(() => {
                if (this.loginError) {
                    this.loginError.style.display = 'none';
                }
            }, 5000);
        }
    }
    
    /**
     * Show the login form
     */
    showLoginForm() {
        if (this.authContainer) {
            this.authContainer.style.display = 'flex';
        }
        if (this.chatContainer) {
            this.chatContainer.style.display = 'none';
        }
    }
    
    /**
     * Show the chat interface
     * @param {object} user - The authenticated user object
     */
    async showChatInterface(user) {
        if (!user) return;
        
        this.log('Showing chat interface for user:', user);
        
        if (this.authContainer) {
            this.authContainer.style.display = 'none';
        }
        
        if (this.chatContainer) {
            this.chatContainer.style.display = 'flex';
        }
        
        // Initialize chat interface here if needed
        if (window.chatManager) {
            await window.chatManager.init(user);
        }
    }
}

// Initialize the login handler when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.loginHandler = new LoginHandler();
});
