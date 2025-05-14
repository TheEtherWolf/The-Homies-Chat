/**
 * Authentication Module for The Homies Chat
 * Handles login and registration functionality using NextAuth
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.loginError = document.getElementById('login-error');
        this.registerError = document.getElementById('register-error');
        this.loginBtn = document.getElementById('login-btn');
        this.registerBtn = document.getElementById('register-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.switchToRegisterBtn = document.getElementById('switch-to-register');
        this.switchToLoginBtn = document.getElementById('switch-to-login');
        this.loginContainer = document.getElementById('login-container');
        this.registerContainer = document.getElementById('register-container');
        this.chatContainer = document.getElementById('chat-container');
        
        this.initEventListeners();
        this.checkLoggedInState();
    }
    
    /**
     * Initialize event listeners for auth forms
     */
    initEventListeners() {
        // Login form submission
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }
        
        // Register form submission
        if (this.registerForm) {
            this.registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }
        
        // Logout button click
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }
        
        // Switch between login and register forms
        if (this.switchToRegisterBtn) {
            this.switchToRegisterBtn.addEventListener('click', () => {
                this.showRegisterForm();
            });
        }
        
        if (this.switchToLoginBtn) {
            this.switchToLoginBtn.addEventListener('click', () => {
                this.showLoginForm();
            });
        }
    }
    
    /**
     * Check if user is already logged in using NextAuth
     */
    async checkLoggedInState() {
        try {
            // First check if NextAuth is available
            if (window.NextAuth) {
                const session = await window.NextAuth.getSession();
                
                if (session && session.user) {
                    this.currentUser = session.user;
                    this.showChatInterface();
                    return;
                }
            }
            
            // Fall back to local storage for backward compatibility
            const userData = localStorage.getItem('user');
            
            if (userData) {
                try {
                    this.currentUser = JSON.parse(userData);
                    this.showChatInterface();
                } catch (e) {
                    console.error('Failed to parse user data:', e);
                    localStorage.removeItem('user');
                    this.showLoginForm();
                }
            } else {
                this.showLoginForm();
            }
        } catch (error) {
            console.error('Error checking login state:', error);
            this.showLoginForm();
        }
    }
    
    /**
     * Handle login form submission using NextAuth
     */
    async handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            this.showLoginError('Username and password are required');
            return;
        }
        
        this.loginBtn.disabled = true;
        this.loginBtn.textContent = 'Logging in...';
        
        // Clear previous errors
        this.hideLoginError();
        
        try {
            // Try to use NextAuth if available
            if (window.NextAuth) {
                const response = await window.NextAuth.signIn({ username, password });
                
                this.loginBtn.disabled = false;
                this.loginBtn.textContent = 'Login';
                
                if (response.success) {
                    this.currentUser = response.user;
                    // Still store in localStorage for backward compatibility
                    localStorage.setItem('user', JSON.stringify(this.currentUser));
                    this.showChatInterface();
                } else {
                    this.showLoginError(response.message || 'Login failed');
                }
                return;
            }
            
            // Fall back to socket.io if NextAuth is not available
            if (window.socket) {
                window.socket.emit('login-user', { username, password }, (response) => {
                    this.loginBtn.disabled = false;
                    this.loginBtn.textContent = 'Login';
                    
                    if (response.success) {
                        this.currentUser = response.user;
                        localStorage.setItem('user', JSON.stringify(this.currentUser));
                        this.showChatInterface();
                    } else {
                        this.showLoginError(response.message || 'Login failed');
                    }
                });
            } else {
                this.loginBtn.disabled = false;
                this.loginBtn.textContent = 'Login';
                this.showLoginError('Connection to server lost. Please refresh the page.');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.loginBtn.disabled = false;
            this.loginBtn.textContent = 'Login';
            this.showLoginError('An error occurred during login. Please try again.');
        }
    }
    
    /**
     * Handle register form submission using NextAuth
     */
    async handleRegister() {
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const email = document.getElementById('register-email').value.trim();
        
        if (!username || !password) {
            this.showRegisterError('Username and password are required');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showRegisterError('Passwords do not match');
            return;
        }
        
        this.registerBtn.disabled = true;
        this.registerBtn.textContent = 'Creating account...';
        
        // Clear previous errors
        this.hideRegisterError();
        
        try {
            // Try to use NextAuth if available
            if (window.NextAuth) {
                const response = await window.NextAuth.signUp({ 
                    username, 
                    password, 
                    email 
                });
                
                this.registerBtn.disabled = false;
                this.registerBtn.textContent = 'Create Account';
                
                if (response.success) {
                    this.currentUser = response.user;
                    // Still store in localStorage for backward compatibility
                    localStorage.setItem('user', JSON.stringify(this.currentUser));
                    this.showChatInterface();
                } else {
                    this.showRegisterError(response.message || 'Registration failed');
                }
                return;
            }
            
            // Fall back to socket.io if NextAuth is not available
            if (window.socket) {
                window.socket.emit('register-user', { username, password, email }, (response) => {
                    this.registerBtn.disabled = false;
                    this.registerBtn.textContent = 'Create Account';
                    
                    if (response.success) {
                        this.currentUser = response.user;
                        localStorage.setItem('user', JSON.stringify(this.currentUser));
                        this.showChatInterface();
                    } else {
                        this.showRegisterError(response.message || 'Registration failed');
                    }
                });
            } else {
                this.registerBtn.disabled = false;
                this.registerBtn.textContent = 'Create Account';
                this.showRegisterError('Connection to server lost. Please refresh the page.');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.registerBtn.disabled = false;
            this.registerBtn.textContent = 'Create Account';
            this.showRegisterError('An error occurred during registration. Please try again.');
        }
    }
    
    /**
     * Handle logout using NextAuth
     */
    async handleLogout() {
        try {
            // Try to use NextAuth if available
            if (window.NextAuth) {
                await window.NextAuth.signOut();
            }
            
            // Always clear local storage for backward compatibility
            localStorage.removeItem('user');
            this.currentUser = null;
            this.showLoginForm();
            
            // Reload the page to reset the socket connection
            window.location.reload();
        } catch (error) {
            console.error('Logout error:', error);
            // Still try to logout locally even if NextAuth fails
            localStorage.removeItem('user');
            this.currentUser = null;
            this.showLoginForm();
            window.location.reload();
        }
    }
    
    /**
     * Show login form
     */
    showLoginForm() {
        if (this.loginContainer) this.loginContainer.style.display = 'block';
        if (this.registerContainer) this.registerContainer.style.display = 'none';
        if (this.chatContainer) this.chatContainer.style.display = 'none';
    }
    
    /**
     * Show registration form
     */
    showRegisterForm() {
        if (this.loginContainer) this.loginContainer.style.display = 'none';
        if (this.registerContainer) this.registerContainer.style.display = 'block';
        if (this.chatContainer) this.chatContainer.style.display = 'none';
    }
    
    /**
     * Show chat interface after successful login
     */
    showChatInterface() {
        if (this.loginContainer) this.loginContainer.style.display = 'none';
        if (this.registerContainer) this.registerContainer.style.display = 'none';
        if (this.chatContainer) this.chatContainer.style.display = 'block';
        
        // Update UI with user info
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay && this.currentUser) {
            usernameDisplay.textContent = this.currentUser.username || this.currentUser.name;
        }
        
        // Initialize chat if needed
        if (window.chatManager) {
            window.chatManager.setCurrentUser(this.currentUser);
        }
    }
    
    /**
     * Show login error message
     */
    showLoginError(message) {
        if (this.loginError) {
            this.loginError.textContent = message;
            this.loginError.style.display = 'block';
        }
    }
    
    /**
     * Hide login error message
     */
    hideLoginError() {
        if (this.loginError) {
            this.loginError.textContent = '';
            this.loginError.style.display = 'none';
        }
    }
    
    /**
     * Show registration error message
     */
    showRegisterError(message) {
        if (this.registerError) {
            this.registerError.textContent = message;
            this.registerError.style.display = 'block';
        }
    }
    
    /**
     * Hide registration error message
     */
    hideRegisterError() {
        if (this.registerError) {
            this.registerError.textContent = '';
            this.registerError.style.display = 'none';
        }
    }
    
    /**
     * Get the current logged in user
     */
    async getCurrentUser() {
        // If NextAuth is available, get the user from there
        if (window.NextAuth) {
            try {
                const user = await window.NextAuth.getUser();
                if (user) {
                    this.currentUser = user;
                    return user;
                }
            } catch (error) {
                console.error('Error getting user from NextAuth:', error);
            }
        }
        
        // Fall back to local user
        return this.currentUser;
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.loginError = document.getElementById('login-error');
        this.registerError = document.getElementById('register-error');
        this.loginBtn = document.getElementById('login-btn');
        this.registerBtn = document.getElementById('register-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.switchToRegisterBtn = document.getElementById('switch-to-register');
        this.switchToLoginBtn = document.getElementById('switch-to-login');
        this.loginContainer = document.getElementById('login-container');
        this.registerContainer = document.getElementById('register-container');
        this.chatContainer = document.getElementById('chat-container');
        
        this.initEventListeners();
        this.checkLoggedInState();
    }
    
    /**
     * Initialize event listeners for auth forms
     */
    initEventListeners() {
        // Login form submission
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }
        
        // Register form submission
        if (this.registerForm) {
            this.registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }
        
        // Logout button click
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }
        
        // Switch between login and register forms
        if (this.switchToRegisterBtn) {
            this.switchToRegisterBtn.addEventListener('click', () => {
                this.showRegisterForm();
            });
        }
        
        if (this.switchToLoginBtn) {
            this.switchToLoginBtn.addEventListener('click', () => {
                this.showLoginForm();
            });
        }
    }
    
    /**
     * Check if user is already logged in using NextAuth
     */
    async checkLoggedInState() {
        try {
            // First check if NextAuth is available
            if (window.NextAuth) {
                const session = await window.NextAuth.getSession();
                
                if (session && session.user) {
                    this.currentUser = session.user;
                    this.showChatInterface();
                    return;
                }
            }
            
            // Fall back to local storage for backward compatibility
            const userData = localStorage.getItem('user');
            
            if (userData) {
                try {
                    this.currentUser = JSON.parse(userData);
                    this.showChatInterface();
                } catch (e) {
                    console.error('Failed to parse user data:', e);
                    localStorage.removeItem('user');
                    this.showLoginForm();
                }
            } else {
                this.showLoginForm();
            }
        } catch (error) {
            console.error('Error checking login state:', error);
            this.showLoginForm();
        }
    }
    
    /**
     * Handle login form submission using NextAuth
     */
    async handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            this.showLoginError('Username and password are required');
            return;
        }
        
        this.loginBtn.disabled = true;
        this.loginBtn.textContent = 'Logging in...';
        
        // Clear previous errors
        this.hideLoginError();
        
        try {
            // Try to use NextAuth if available
            if (window.NextAuth) {
                const response = await window.NextAuth.signIn({ username, password });
                
                this.loginBtn.disabled = false;
                this.loginBtn.textContent = 'Login';
                
                if (response.success) {
                    this.currentUser = response.user;
                    // Still store in localStorage for backward compatibility
                    localStorage.setItem('user', JSON.stringify(this.currentUser));
                    this.showChatInterface();
                } else {
                    this.showLoginError(response.message || 'Login failed');
                }
                return;
            }
            
            // Fall back to socket.io if NextAuth is not available
            if (window.socket) {
                window.socket.emit('login-user', { username, password }, (response) => {
                    this.loginBtn.disabled = false;
                    this.loginBtn.textContent = 'Login';
                    
                    if (response.success) {
                        this.currentUser = response.user;
                        localStorage.setItem('user', JSON.stringify(this.currentUser));
                        this.showChatInterface();
                    } else {
                        this.showLoginError(response.message || 'Login failed');
                    }
                });
            } else {
                this.loginBtn.disabled = false;
                this.loginBtn.textContent = 'Login';
                this.showLoginError('Connection to server lost. Please refresh the page.');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.loginBtn.disabled = false;
            this.loginBtn.textContent = 'Login';
            this.showLoginError('An error occurred during login. Please try again.');
        }
    }
    
    /**
     * Handle register form submission using NextAuth
     */
    async handleRegister() {
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const email = document.getElementById('register-email').value.trim();
        
        if (!username || !password) {
            this.showRegisterError('Username and password are required');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showRegisterError('Passwords do not match');
            return;
        }
        
        this.registerBtn.disabled = true;
        this.registerBtn.textContent = 'Creating account...';
        
        // Clear previous errors
        this.hideRegisterError();
        
        try {
            // Try to use NextAuth if available
            if (window.NextAuth) {
                const response = await window.NextAuth.signUp({ 
                    username, 
                    password, 
                    email 
                });
                
                this.registerBtn.disabled = false;
                this.registerBtn.textContent = 'Create Account';
                
                if (response.success) {
                    this.currentUser = response.user;
                    // Still store in localStorage for backward compatibility
                    localStorage.setItem('user', JSON.stringify(this.currentUser));
                    this.showChatInterface();
                } else {
                    this.showRegisterError(response.message || 'Registration failed');
                }
                return;
            }
            
            // Fall back to socket.io if NextAuth is not available
            if (window.socket) {
                window.socket.emit('register-user', { username, password, email }, (response) => {
                    this.registerBtn.disabled = false;
                    this.registerBtn.textContent = 'Create Account';
                    
                    if (response.success) {
                        this.currentUser = response.user;
                        localStorage.setItem('user', JSON.stringify(this.currentUser));
                        this.showChatInterface();
                    } else {
                        this.showRegisterError(response.message || 'Registration failed');
                    }
                });
            } else {
                this.registerBtn.disabled = false;
                this.registerBtn.textContent = 'Create Account';
                this.showRegisterError('Connection to server lost. Please refresh the page.');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.registerBtn.disabled = false;
            this.registerBtn.textContent = 'Create Account';
            this.showRegisterError('An error occurred during registration. Please try again.');
        }
    }
    
    /**
     * Handle logout using NextAuth
     */
    async handleLogout() {
        try {
            // Try to use NextAuth if available
            if (window.NextAuth) {
                await window.NextAuth.signOut();
            }
            
            // Always clear local storage for backward compatibility
            localStorage.removeItem('user');
            this.currentUser = null;
            this.showLoginForm();
            
            // Reload the page to reset the socket connection
            window.location.reload();
        } catch (error) {
            console.error('Logout error:', error);
            // Still try to logout locally even if NextAuth fails
            localStorage.removeItem('user');
            this.currentUser = null;
            this.showLoginForm();
            window.location.reload();
        }
    }
    
    /**
     * Show login form
     */
    showLoginForm() {
        if (this.loginContainer) this.loginContainer.style.display = 'block';
        if (this.registerContainer) this.registerContainer.style.display = 'none';
        if (this.chatContainer) this.chatContainer.style.display = 'none';
    }
    
    /**
     * Show registration form
     */
    showRegisterForm() {
        if (this.loginContainer) this.loginContainer.style.display = 'none';
        if (this.registerContainer) this.registerContainer.style.display = 'block';
        if (this.chatContainer) this.chatContainer.style.display = 'none';
    }
    
    /**
     * Show chat interface after successful login
     */
    showChatInterface() {
        if (this.loginContainer) this.loginContainer.style.display = 'none';
        if (this.registerContainer) this.registerContainer.style.display = 'none';
        if (this.chatContainer) this.chatContainer.style.display = 'block';
        
        // Update UI with user info
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay && this.currentUser) {
            usernameDisplay.textContent = this.currentUser.username || this.currentUser.name;
        }
        
        // Initialize chat if needed
        if (window.chatManager) {
            window.chatManager.setCurrentUser(this.currentUser);
        }
    }
    
    /**
     * Show login error message
     */
    showLoginError(message) {
        if (this.loginError) {
            this.loginError.textContent = message;
            this.loginError.style.display = 'block';
        }
    }
    
    /**
     * Hide login error message
     */
    hideLoginError() {
        if (this.loginError) {
            this.loginError.textContent = '';
            this.loginError.style.display = 'none';
        }
    }
    
    /**
     * Show registration error message
     */
    showRegisterError(message) {
        if (this.registerError) {
            this.registerError.textContent = message;
            this.registerError.style.display = 'block';
        }
    }
    
    /**
     * Hide registration error message
     */
    hideRegisterError() {
        if (this.registerError) {
            this.registerError.textContent = '';
            this.registerError.style.display = 'none';
        }
    }
    
    /**
     * Get the current logged in user
     */
    async getCurrentUser() {
        // If NextAuth is available, get the user from there
        if (window.NextAuth) {
            try {
                const user = await window.NextAuth.getUser();
                if (user) {
                    this.currentUser = user;
                    return user;
                }
            } catch (error) {
                console.error('Error getting user from NextAuth:', error);
            }
        }
        
        // Fall back to local user
        return this.currentUser;
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});
    constructor() {
        this.currentUser = null;
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.loginError = document.getElementById('login-error');
        this.registerError = document.getElementById('register-error');
        this.loginBtn = document.getElementById('login-btn');
        this.registerBtn = document.getElementById('register-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.switchToRegisterBtn = document.getElementById('switch-to-register');
        this.switchToLoginBtn = document.getElementById('switch-to-login');
        this.loginContainer = document.getElementById('login-container');
        this.registerContainer = document.getElementById('register-container');
        this.chatContainer = document.getElementById('chat-container');
        
        this.initEventListeners();
        this.checkLoggedInState();
    }
    
    /**
     * Initialize event listeners for auth forms
     */
    initEventListeners() {
        // Login form submission
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        // Register form submission
        this.registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });
        
        // Logout button click
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }
        
        // Switch between login and register forms
        if (this.switchToRegisterBtn) {
            this.switchToRegisterBtn.addEventListener('click', () => {
                this.showRegisterForm();
            });
        }
        
        if (this.switchToLoginBtn) {
            this.switchToLoginBtn.addEventListener('click', () => {
                this.showLoginForm();
            });
        }
    }
    
    /**
     * Check if user is already logged in using NextAuth
     */
    async checkLoggedInState() {
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
     * Connects to server for registration via Supabase
     * Will be replaced with NextAuth in the future
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
        
        // Check if socket is available
        if (!window.socket) {
            console.error('[AUTH_DEBUG] Socket connection not available');
            this.showMessage('Connection error. Please refresh the page.', 'danger');
            return;
        }
        
        // Show loading message
        this.showMessage('Creating account...', 'info');
        
        console.log('[AUTH_DEBUG] Attempting to register user:', username);
        
        // Send registration request to server via socket
        window.socket.emit('register-user', { username, email, password }, (response) => {
            console.log('[AUTH_DEBUG] Registration response received:', response);
            
            if (response && response.success) {
                // Store user in session storage
                const userData = {
                    ...response.user,
                    authenticated: true
                };
                
                sessionStorage.setItem('user', JSON.stringify(userData));
                console.log('[AUTH_DEBUG] Created user session after registration', userData);
                
                // Show success message
                this.showMessage('Account created successfully! Redirecting...', 'success');
                
                // Proceed to app
                setTimeout(() => {
                    this.showLoginSuccess(userData);
                }, 1500);
            } else {
                // Show error message
                const errorMessage = response && response.message ? response.message : 'Registration failed. Please try again.';
                this.showMessage(errorMessage, 'danger');
                console.error('[AUTH_DEBUG] Registration failed:', errorMessage);
            }
        });
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
