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
        
        console.log('[AUTH_DEBUG] AuthManager constructor complete. Ready for initialization.');
        // Removed automatic initialization to prevent double initialization
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
        
        // Set up logout - check if button exists first
        if (this.logoutButton) {
            this.logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        } else {
            console.warn('[AUTH_DEBUG] Logout button not found in the DOM');
            // Look for any element that might be serving as logout button
            const possibleLogoutBtn = document.querySelector('[title="Logout"], .user-control-button');
            if (possibleLogoutBtn) {
                console.log('[AUTH_DEBUG] Found alternative logout button');
                possibleLogoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleLogout();
                });
            }
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
        
        console.log('[AUTH_DEBUG] Attempting to sign in user:', username);
        
        // Check if socket is available
        if (!window.socket) {
            console.error('[AUTH_DEBUG] Socket connection not available');
            this.showMessage('Connection error. Please refresh the page.', 'danger');
            return;
        }
        
        console.log('[AUTH_DEBUG] Emitting login-user event...');
        window.socket.emit('login-user', { username, password }, (response) => {
            console.log('[AUTH_DEBUG] Login response received:', response);
            if (response.success) {
                // Store user data in session storage
                sessionStorage.setItem('user', JSON.stringify({
                    username: username,
                    id: response.userId || response.id || 'unknown'
                }));
                
                console.log('[AUTH_DEBUG] Login successful, calling showLoginSuccess...');
                this.showLoginSuccess();
            } else {
                // User not found or incorrect credentials, show appropriate message
                this.showMessage(response.message || 'Login failed. Please check your credentials or create an account.', 'danger');
                console.error('[AUTH_DEBUG] Login failed:', response.message);
            }
        });
    }
    
    /**
     * Handle successful login
     */
    showLoginSuccess() {
        console.log('[AUTH_DEBUG] Inside showLoginSuccess...');
        let user = null;
        try {
            user = JSON.parse(sessionStorage.getItem('user'));
        } catch (e) {
            console.error('[AUTH_DEBUG] Error parsing user from sessionStorage in showLoginSuccess:', e);
            this.showMessage('An error occurred retrieving user data after login.', 'danger');
            return;
        }
        
        if (!user || !user.username) {
            console.error('[AUTH_DEBUG] Login success called but user data is invalid in sessionStorage.');
            this.showMessage('An error occurred after login. Please try again.', 'danger');
            return;
        }

        // Update UI
        console.log('[AUTH_DEBUG] Updating UI with username:', user.username);
        this.currentUserDisplay.textContent = user.username;

        // ** Dispatch the userLoggedIn event for app.js **
        console.log('[AUTH_DEBUG] Dispatching userLoggedIn event from showLoginSuccess with user:', user);
        const event = new CustomEvent('userLoggedIn', { detail: { user } });
        document.dispatchEvent(event);
        
        // Show success message briefly
        this.showMessage('Login successful! Redirecting...', 'success');
        
        // Hide auth container and show app
        setTimeout(() => {
            this.authContainer.classList.add('d-none');
            this.appContainer.classList.remove('d-none');
            
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
        // Email is no longer required
        const password = this.registerPassword.value;
        const confirmPassword = this.registerConfirmPassword.value;
        
        // Basic validation
        if (!username || !password || !confirmPassword) {
            this.showMessage('Please fill out username and password fields', 'danger');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showMessage('Passwords do not match', 'danger');
            return;
        }
        
        // Show loading message
        this.showMessage('Creating your account...', 'info');
        
        console.log('[AUTH_DEBUG] Attempting to register user:', username);
        
        // Check if socket is available
        if (!window.socket) {
            console.error('[AUTH_DEBUG] Socket connection not available');
            this.showMessage('Connection error. Please refresh the page.', 'danger');
            return;
        }
        
        // Send registration request to the updated register-user event
        window.socket.emit('register-user', { username, password }, (response) => {
            console.log('[AUTH_DEBUG] Registration response:', response);
            
            if (response.success) {
                console.log('[AUTH_DEBUG] Registration successful');
                
                // If email verification is required (no longer used but kept for compatibility)
                if (response.verificationRequired) {
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
                console.error('[AUTH_DEBUG] Registration failed:', response.message);
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
        if (window.socket) {
            window.socket.emit('logout-user');
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
        console.log('[AUTH_DEBUG] Checking session...');
        const userData = sessionStorage.getItem('user');
        
        if (userData) {
            console.log('[AUTH_DEBUG] Found user data in sessionStorage:', userData);
            try {
                const user = JSON.parse(userData);
                if (user && user.username && user.id) {
                    console.log('[AUTH_DEBUG] Valid user found in session:', user.username);
                    
                    // Register this session with the server
                    console.log('[AUTH_DEBUG] Registering user session with server:', user.username);
                    window.socket.emit('register-session', user);
                    
                    // Set up listeners for auth responses
                    window.socket.once('auth-success', (response) => {
                        console.log('[AUTH_DEBUG] Server accepted session authentication');
                        
                        // If server returns a different user ID, update our session storage
                        if (response.id && response.id !== user.id) {
                            console.log('[AUTH_DEBUG] Server updated user ID from', user.id, 'to', response.id);
                            user.id = response.id;
                            sessionStorage.setItem('user', JSON.stringify(user));
                        }
                        
                        // Update user display
                        this.currentUserDisplay.textContent = user.username;
                        
                        // Hide auth container and show app
                        console.log('[AUTH_DEBUG] Hiding auth container, showing app container.');
                        this.authContainer.classList.add('d-none');
                        this.appContainer.classList.remove('d-none');
                        
                        // Dispatch the userLoggedIn event for app.js
                        console.log('[AUTH_DEBUG] Dispatching userLoggedIn event from checkSession with user:', user);
                        const event = new CustomEvent('userLoggedIn', { detail: { user } });
                        document.dispatchEvent(event);
                        
                        // Request message history after successful auth
                        window.socket.emit('get-messages', { channel: 'general' });
                    });
                    
                    window.socket.once('auth-error', (error) => {
                        console.warn('[AUTH_DEBUG] Server rejected session authentication:', error.message);
                        sessionStorage.removeItem('user');
                        this.toggleForms('login');
                        this.showMessage('Session expired. Please log in again.', 'warning');
                    });
                } else {
                    console.warn('[AUTH_DEBUG] Invalid user data structure found in session storage.');
                    sessionStorage.removeItem('user'); // Clear invalid data
                    console.log('[AUTH_DEBUG] Cleared invalid user data from sessionStorage.');
                    // Ensure login form is visible if session check fails
                    this.toggleForms('login'); 
                }
            } catch (e) {
                console.error('[AUTH_DEBUG] Error parsing user data from session:', e);
                sessionStorage.removeItem('user'); // Clear corrupted data
                console.log('[AUTH_DEBUG] Cleared corrupted user data from sessionStorage.');
                // Ensure login form is visible if session check fails
                this.toggleForms('login');
            }
        } else {
            console.log('[AUTH_DEBUG] No user data found in sessionStorage. Showing login form.');
            // Ensure login form is visible if no session data
            this.toggleForms('login');
        }
    }
}
