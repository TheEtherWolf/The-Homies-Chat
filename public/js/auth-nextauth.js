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
        
        if (this.loginBtn) {
            this.loginBtn.disabled = true;
            this.loginBtn.textContent = 'Logging in...';
        }
        
        // Clear previous errors
        this.hideLoginError();
        
        try {
            // Try to use NextAuth if available
            if (window.NextAuth) {
                const response = await window.NextAuth.signIn({ username, password });
                
                if (this.loginBtn) {
                    this.loginBtn.disabled = false;
                    this.loginBtn.textContent = 'Login';
                }
                
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
                console.log('[AUTH_DEBUG] Attempting socket.io login for', username);
                window.socket.emit('login-user', { username, password }, (response) => {
                    console.log('[AUTH_DEBUG] Login response received:', response);
                    
                    if (this.loginBtn) {
                        this.loginBtn.disabled = false;
                        this.loginBtn.textContent = 'Login';
                    }
                    
                    if (response && response.success) {
                        console.log('[AUTH_DEBUG] Login successful, user:', response.user);
                        this.currentUser = response.user;
                        
                        // Store in both localStorage and sessionStorage
                        localStorage.setItem('user', JSON.stringify(this.currentUser));
                        sessionStorage.setItem('user', JSON.stringify(this.currentUser));
                        
                        console.log('[AUTH_DEBUG] Showing chat interface...');
                        this.showChatInterface();
                    } else {
                        console.error('[AUTH_DEBUG] Login failed:', response ? response.message : 'No response');
                        this.showLoginError(response && response.message ? response.message : 'Login failed');
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
        console.log('[AUTH_DEBUG] showChatInterface called with currentUser:', this.currentUser);
        
        // Hide login/register containers, show chat container
        if (this.loginContainer) {
            this.loginContainer.style.display = 'none';
            console.log('[AUTH_DEBUG] Login container hidden');
        } else {
            console.warn('[AUTH_DEBUG] Login container not found');
        }
        
        if (this.registerContainer) {
            this.registerContainer.style.display = 'none';
            console.log('[AUTH_DEBUG] Register container hidden');
        } else {
            console.warn('[AUTH_DEBUG] Register container not found');
        }
        
        if (this.chatContainer) {
            this.chatContainer.style.display = 'block';
            console.log('[AUTH_DEBUG] Chat container shown');
        } else {
            console.error('[AUTH_DEBUG] Chat container not found! Cannot show chat interface.');
            // Try to find it by ID as a fallback
            const chatContainerFallback = document.getElementById('chat-container');
            if (chatContainerFallback) {
                console.log('[AUTH_DEBUG] Found chat container by ID, showing it');
                chatContainerFallback.style.display = 'block';
                this.chatContainer = chatContainerFallback;
            } else {
                console.error('[AUTH_DEBUG] Chat container not found by ID either. Login may appear successful but UI won\'t update.');
            }
        }
        
        // Update UI with user info
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay && this.currentUser) {
            usernameDisplay.textContent = this.currentUser.username || this.currentUser.name;
            console.log('[AUTH_DEBUG] Updated username display to:', this.currentUser.username || this.currentUser.name);
        } else {
            console.warn('[AUTH_DEBUG] Could not update username display:', 
                          usernameDisplay ? 'currentUser missing' : 'usernameDisplay element not found');
        }
        
        // Store user in session storage for other components to access
        sessionStorage.setItem('user', JSON.stringify(this.currentUser));
        console.log('[AUTH_DEBUG] User data stored in sessionStorage');
        
        // Dispatch userLoggedIn event to trigger ChatManager initialization in app.js
        console.log('[AUTH_DEBUG] Dispatching userLoggedIn event with user:', this.currentUser);
        try {
            document.dispatchEvent(new CustomEvent('userLoggedIn', {
                detail: { user: this.currentUser }
            }));
            console.log('[AUTH_DEBUG] userLoggedIn event dispatched successfully');
        } catch (error) {
            console.error('[AUTH_DEBUG] Error dispatching userLoggedIn event:', error);
        }
        
        // Initialize chat if needed (legacy support)
        if (window.chatManager) {
            console.log('[AUTH_DEBUG] Found existing chatManager, calling setCurrentUser');
            try {
                window.chatManager.setCurrentUser(this.currentUser);
                console.log('[AUTH_DEBUG] chatManager.setCurrentUser called successfully');
            } catch (error) {
                console.error('[AUTH_DEBUG] Error calling chatManager.setCurrentUser:', error);
            }
        } else {
            console.log('[AUTH_DEBUG] No existing chatManager found, relying on event to initialize it');
        }
        
        console.log('[AUTH_DEBUG] showChatInterface completed');
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
