/**
 * Authentication Module for The Homies Chat
 * Handles user login, registration, and session management
 * Temporary solution until NextAuth integration
 */

class AuthManager {
    constructor() {
        // Login form elements
        this.loginForm = document.getElementById('login-form');
        this.loginUsername = document.getElementById('login-username');
        this.loginPassword = document.getElementById('login-password');
        
        // Registration form elements
        this.registerForm = document.getElementById('register-form');
        this.registerUsername = document.getElementById('register-username');
        this.registerEmail = document.getElementById('register-email');
        this.registerPassword = document.getElementById('register-password');
        this.registerConfirmPassword = document.getElementById('register-confirm-password');
        
        // Auth container and app container
        this.authContainer = document.getElementById('auth-container');
        this.appContainer = document.getElementById('app-container');
        
        // Form toggling elements
        this.showRegisterLink = document.getElementById('show-register');
        this.showLoginLink = document.getElementById('show-login');
        
        // Message display
        this.authMessage = document.getElementById('auth-message');
        
        // Logout button
        this.logoutButton = document.getElementById('logout-btn');
        
        // User display
        this.currentUserDisplay = document.getElementById('current-user');
        
        console.log('[AUTH_DEBUG] Initializing AuthManager...');
        this.initialize();
    }
    
    /**
     * Initialize the authentication manager
     */
    initialize() {
        // Set up form toggling
        if (this.showRegisterLink) {
            this.showRegisterLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleForms('register');
            });
        }
        
        if (this.showLoginLink) {
            this.showLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleForms('login');
            });
        }
        
        // Set up form submissions
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }
        
        if (this.registerForm) {
            this.registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegistration();
            });
        }
        
        // Set up logout
        if (this.logoutButton) {
            this.logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
        
        console.log('[AUTH_DEBUG] Calling checkSession from initialize...');
        this.checkSession();
        
        console.log('[AUTH_DEBUG] Authentication manager initialization complete.');
    }
    
    /**
     * Toggle between login and registration forms
     * @param {string} form - The form to show ('login' or 'register')
     */
    toggleForms(form) {
        if (form === 'register') {
            this.loginForm.classList.add('d-none');
            this.registerForm.classList.remove('d-none');
            document.getElementById('auth-title').textContent = 'Create an Account';
        } else {
            this.registerForm.classList.add('d-none');
            this.loginForm.classList.remove('d-none');
            document.getElementById('auth-title').textContent = 'Welcome to The Homies Chat';
        }
        
        // Clear any previous messages
        this.showMessage('', 'none');
    }
    
    /**
     * Display a message in the auth container
     * @param {string} message - The message to display
     * @param {string} type - The type of message ('success', 'danger', 'warning', 'info')
     */
    showMessage(message, type) {
        if (!this.authMessage) return;
        
        if (!message) {
            this.authMessage.classList.add('d-none');
            return;
        }
        
        this.authMessage.textContent = message;
        this.authMessage.className = `alert alert-${type}`;
        this.authMessage.classList.remove('d-none');
    }
    
    /**
     * Handle the login form submission
     * Temporary implementation until NextAuth is integrated
     */
    handleLogin() {
        const username = this.loginUsername.value.trim();
        const password = this.loginPassword.value;
        
        if (!username || !password) {
            this.showMessage('Please enter both username and password', 'danger');
            return;
        }
        
        // Show loading message
        this.showMessage('Signing in...', 'info');
        
        console.log('[AUTH_DEBUG] Attempting to sign in user:', username);
        
        // Create user data for session
        const userData = {
            username: username,
            id: 'user-' + Date.now(),
            authenticated: true
        };
        
        // Store user in session storage
        sessionStorage.setItem('user', JSON.stringify(userData));
        console.log('[AUTH_DEBUG] Created user session', userData);
        
        // Show success and proceed to app
        this.showLoginSuccess(userData);
    }
    
    /**
     * Handle successful login
     * @param {Object} user - User data
     */
    showLoginSuccess(user) {
        console.log('[AUTH_DEBUG] Inside showLoginSuccess...');
        
        if (!user) {
            try {
                user = JSON.parse(sessionStorage.getItem('user'));
            } catch (e) {
                console.error('[AUTH_DEBUG] Error parsing user from sessionStorage in showLoginSuccess:', e);
                this.showMessage('An error occurred retrieving user data after login.', 'danger');
                return;
            }
        }
        
        if (!user || !user.username) {
            console.error('[AUTH_DEBUG] Login success called but user data is invalid.');
            this.showMessage('An error occurred after login. Please try again.', 'danger');
            return;
        }

        // Update UI
        console.log('[AUTH_DEBUG] Updating UI with username:', user.username);
        if (this.currentUserDisplay) {
            this.currentUserDisplay.textContent = user.username;
        }

        // Dispatch the userLoggedIn event for app.js
        console.log('[AUTH_DEBUG] Dispatching userLoggedIn event from showLoginSuccess with user:', user);
        const event = new CustomEvent('userLoggedIn', { detail: { user } });
        document.dispatchEvent(event);
        
        // Show success message briefly
        this.showMessage('Login successful! Redirecting...', 'success');
        
        // Hide auth container and show app
        setTimeout(() => {
            if (this.authContainer) this.authContainer.classList.add('d-none');
            if (this.appContainer) this.appContainer.classList.remove('d-none');
            
            // Reset forms
            if (this.loginForm) this.loginForm.reset();
            if (this.registerForm) this.registerForm.reset();
            this.showMessage('', 'none');
        }, 1000);
    }
    
    /**
     * Handle the registration form submission
     * Temporary implementation until NextAuth is integrated
     */
    handleRegistration() {
        const username = this.registerUsername.value.trim();
        const email = this.registerEmail.value.trim();
        const password = this.registerPassword.value;
        const confirmPassword = this.registerConfirmPassword.value;
        
        // Validate input
        if (!username || !email || !password || !confirmPassword) {
            this.showMessage('Please fill out all fields', 'danger');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showMessage('Passwords do not match', 'danger');
            return;
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showMessage('Please enter a valid email address', 'danger');
            return;
        }
        
        // Validate password strength
        if (password.length < 6) {
            this.showMessage('Password must be at least 6 characters long', 'danger');
            return;
        }
        
        // Show loading message
        this.showMessage('Creating account...', 'info');
        
        console.log('[AUTH_DEBUG] Attempting to register user:', username);
        
        // Create user data for session (temporary until NextAuth)
        const userData = {
            username: username,
            email: email,
            id: 'user-' + Date.now(),
            authenticated: true
        };
        
        // Store user in session storage
        sessionStorage.setItem('user', JSON.stringify(userData));
        console.log('[AUTH_DEBUG] Created user session after registration', userData);
        
        // Show success message
        this.showMessage('Account created successfully! Redirecting...', 'success');
        
        // Proceed to app
        setTimeout(() => {
            this.showLoginSuccess(userData);
        }, 1500);
    }
    
    /**
     * Handle logout
     */
    handleLogout() {
        console.log('[AUTH_DEBUG] Logging out user');
        
        // Clear session storage
        sessionStorage.removeItem('user');
        
        // Show auth container and hide app
        if (this.authContainer) this.authContainer.classList.remove('d-none');
        if (this.appContainer) this.appContainer.classList.add('d-none');
        
        // Reset forms
        if (this.loginForm) this.loginForm.reset();
        if (this.registerForm) this.registerForm.reset();
        
        // Show login form
        this.toggleForms('login');
        
        // Dispatch event for app.js
        document.dispatchEvent(new Event('userLoggedOut'));
        
        console.log('[AUTH_DEBUG] User logged out successfully');
    }
    
    /**
     * Check if user is already logged in
     */
    checkSession() {
        console.log('[AUTH_DEBUG] Checking for existing session');
        
        try {
            const userData = sessionStorage.getItem('user');
            if (userData) {
                const user = JSON.parse(userData);
                if (user && user.username) {
                    console.log('[AUTH_DEBUG] Found existing session for user:', user.username);
                    this.showLoginSuccess(user);
                    return;
                }
            }
            
            console.log('[AUTH_DEBUG] No existing session found');
        } catch (e) {
            console.error('[AUTH_DEBUG] Error checking session:', e);
        }
    }
    
    /**
     * Prepare for NextAuth integration
     * This method will be expanded when NextAuth is added
     */
    prepareNextAuthIntegration() {
        console.log('[AUTH_DEBUG] NextAuth integration is planned but not yet implemented');
        // This will be expanded when NextAuth is added to the project
    }
}

// Initialize authentication when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create global auth manager instance
    window.authManager = new AuthManager();
});
