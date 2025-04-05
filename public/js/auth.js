/**
 * Authentication Module for The Homies App
 * Handles user login, registration, and session management
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
        
        this.initialize();
    }
    
    /**
     * Initialize the authentication manager
     */
    initialize() {
        // Set up form toggling
        this.showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleForms('register');
        });
        
        this.showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleForms('login');
        });
        
        // Set up form submissions
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        this.registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegistration();
        });
        
        // Set up logout
        this.logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });
        
        // Check if user is already logged in
        this.checkSession();
        
        console.log('Authentication manager initialized');
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
            document.getElementById('auth-title').textContent = 'Welcome to The Homies App';
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
        
        // Debug log
        console.log(`Attempting to sign in user: ${username}`);
        
        // Check if socket is available
        if (!socket) {
            console.error('Socket connection not available');
            this.showMessage('Connection error. Please refresh the page.', 'danger');
            return;
        }
        
        // Emit login event to server
        socket.emit('login-user', { username, password }, (response) => {
            console.log('Login response:', response);
            if (response.success) {
                // Store user data in session storage
                sessionStorage.setItem('user', JSON.stringify({
                    username: username,
                    id: response.userId || response.id || 'unknown'
                }));
                
                this.showLoginSuccess();
            } else {
                this.showMessage(response.message || 'Login failed. Please check your credentials.', 'danger');
                console.error('Login failed:', response.message);
            }
        });
    }
    
    /**
     * Handle successful login
     */
    showLoginSuccess() {
        const user = JSON.parse(sessionStorage.getItem('user'));
        
        // Update UI
        this.currentUserDisplay.textContent = user.username;
        
        // Show success message briefly
        this.showMessage('Login successful! Redirecting...', 'success');
        
        // Hide auth container and show app
        setTimeout(() => {
            this.authContainer.classList.add('d-none');
            this.appContainer.classList.remove('d-none');
            
            // Trigger chat initialization if needed
            if (typeof chatManager !== 'undefined' && chatManager.initialize) {
                chatManager.initialize();
            }
            
            // Reset forms
            this.loginForm.reset();
            this.registerForm.reset();
            this.showMessage('', 'none');
        }, 1000);
    }
    
    /**
     * Handle the registration form submission
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
        this.showMessage('Creating your account...', 'info');
        
        // Debug log
        console.log(`Attempting to register user: ${username} with email: ${email}`);
        
        // Check if socket is available
        if (!socket) {
            console.error('Socket connection not available');
            this.showMessage('Connection error. Please refresh the page.', 'danger');
            return;
        }
        
        // Emit registration event to server
        socket.emit('register-user', { username, email, password }, (response) => {
            console.log('Registration response:', response);
            
            if (response.success) {
                if (response.requireVerification) {
                    // Show verification message
                    this.showMessage(`${response.message}`, 'success');
                    // Switch to login form after a delay
                    setTimeout(() => {
                        this.toggleForms('login');
                    }, 5000);
                } else {
                    // If no verification required, proceed to login
                    this.showMessage('Account created successfully! You can now log in.', 'success');
                    // Switch to login form after a delay
                    setTimeout(() => {
                        this.toggleForms('login');
                    }, 2000);
                }
                
                // Reset form
                this.registerForm.reset();
            } else {
                this.showMessage(response.message || 'Registration failed. Please try again.', 'danger');
                console.error('Registration failed:', response.message);
            }
        });
    }
    
    /**
     * Handle user logout
     */
    handleLogout() {
        // Clear session storage
        sessionStorage.removeItem('user');
        
        // Emit logout event to server
        if (socket) {
            socket.emit('logout-user');
        }
        
        // Show auth container and hide app
        this.appContainer.classList.add('d-none');
        this.authContainer.classList.remove('d-none');
        
        // Reset forms
        this.loginForm.reset();
        this.registerForm.reset();
        this.toggleForms('login');
        
        console.log('User logged out');
    }
    
    /**
     * Check if user is already logged in from session storage
     */
    checkSession() {
        const userData = sessionStorage.getItem('user');
        
        if (userData) {
            try {
                const user = JSON.parse(userData);
                if (user && user.username) {
                    // Update user display
                    this.currentUserDisplay.textContent = user.username;
                    
                    // Hide auth container and show app
                    this.authContainer.classList.add('d-none');
                    this.appContainer.classList.remove('d-none');
                    
                    console.log('User already logged in:', user.username);
                    return true;
                }
            } catch (e) {
                console.error('Error parsing user data from session:', e);
            }
        }
        
        // No valid session found
        return false;
    }
}

// Initialize authentication when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create global auth manager instance
    window.authManager = new AuthManager();
});
