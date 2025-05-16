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
        
        // Debug log for element initialization
        console.log('[AUTH_DEBUG] Elements initialized:', {
            loginForm: !!this.loginForm,
            loginError: !!this.loginError,
            loginBtn: !!this.loginBtn,
            chatContainer: !!this.chatContainer
        });
        
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
                console.log('[AUTH_DEBUG] Checking NextAuth session');
                const session = await window.NextAuth.getSession();
                
                if (session && session.user && session.token) {
                    console.log('[AUTH_DEBUG] Valid NextAuth session found');
                    // Verify the token is still valid with the server
                    try {
                        const verifyResponse = await fetch('/api/auth/verify-session', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ token: session.token })
                        });
                        
                        if (verifyResponse.ok) {
                            console.log('[AUTH_DEBUG] Session verified with server');
                            this.currentUser = session.user;
                            this.showChatInterface();
                            return;
                        } else {
                            console.warn('[AUTH_DEBUG] Server rejected session token');
                            // Clear invalid session
                            localStorage.removeItem('user');
                            sessionStorage.removeItem('user');
                            window.NextAuth.signOut();
                            this.showLoginForm();
                            return;
                        }
                    } catch (verifyError) {
                        console.error('[AUTH_DEBUG] Error verifying session:', verifyError);
                        // If we can't verify, err on the side of caution and show login
                        this.showLoginForm();
                        return;
                    }
                } else {
                    console.log('[AUTH_DEBUG] No valid NextAuth session found');
                }
            }
            
            // Always show login form - we're removing the local storage fallback
            // for security reasons to prevent bypassing authentication
            console.log('[AUTH_DEBUG] No valid session found, showing login form');
            this.showLoginForm();
        } catch (error) {
            console.error('[AUTH_DEBUG] Error checking login state:', error);
            this.showLoginForm();
        }
    }
    
    /**
     * Handle login form submission using NextAuth
     */
    async handleLogin(event) {
        if (event) {
            event.preventDefault();
        }
        
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            this.showLoginError('Username and password are required');
            return;
        }
        
        // Get reference to login button
        const loginBtn = document.getElementById('login-btn');
        
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';
        }
        
        // Clear previous errors
        this.hideLoginError();
        
        try {
            console.log('[AUTH_DEBUG] Starting login process for user:', username);
            
            // Try to use NextAuth if available
            if (window.NextAuth) {
                console.log('[AUTH_DEBUG] Using NextAuth for login');
                
                try {
                    const response = await window.NextAuth.signIn({ username, password });
                    console.log('[AUTH_DEBUG] NextAuth login response:', response);
                    
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Login';
                    }
                    
                    if (response && response.success) {
                        console.log('[AUTH_DEBUG] Login successful, user:', response.user);
                        this.currentUser = response.user;
                        
                        // Store in both localStorage and sessionStorage
                        localStorage.setItem('user', JSON.stringify(this.currentUser));
                        sessionStorage.setItem('user', JSON.stringify(this.currentUser));
                        
                        // Emit the userLoggedIn event
                        const userLoggedInEvent = new CustomEvent('userLoggedIn', {
                            detail: { user: this.currentUser }
                        });
                        document.dispatchEvent(userLoggedInEvent);
                        
                        // Show chat interface
                        console.log('[AUTH_DEBUG] Showing chat interface...');
                        this.showChatInterface();
                    } else {
                        const errorMsg = response && response.message ? response.message : 'Login failed';
                        console.error('[AUTH_DEBUG] Login failed:', errorMsg);
                        this.showLoginError(errorMsg);
                    }
                } catch (nextAuthError) {
                    console.error('[AUTH_DEBUG] NextAuth login error:', nextAuthError);
                    
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Login';
                    }
                    
                    this.showLoginError('Authentication error: ' + (nextAuthError.message || 'Unknown error'));
                }
                return;
            }
            
            // Fall back to socket.io if NextAuth is not available
            if (window.socket) {
                console.log('[AUTH_DEBUG] NextAuth not available, falling back to socket.io login for', username);
                
                window.socket.emit('login-user', { username, password }, (response) => {
                    console.log('[AUTH_DEBUG] Socket.io login response received:', response);
                    
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Login';
                    }
                    
                    if (response && response.success) {
                        console.log('[AUTH_DEBUG] Socket.io login successful, user:', response.user);
                        this.currentUser = response.user;
                        
                        // Store in both localStorage and sessionStorage
                        localStorage.setItem('user', JSON.stringify(this.currentUser));
                        sessionStorage.setItem('user', JSON.stringify(this.currentUser));
                        
                        // Emit the userLoggedIn event
                        const userLoggedInEvent = new CustomEvent('userLoggedIn', {
                            detail: { user: this.currentUser }
                        });
                        document.dispatchEvent(userLoggedInEvent);
                        
                        console.log('[AUTH_DEBUG] Showing chat interface...');
                        this.showChatInterface();
                    } else {
                        const errorMsg = response && response.message ? response.message : 'Login failed';
                        console.error('[AUTH_DEBUG] Socket.io login failed:', errorMsg);
                        this.showLoginError(errorMsg);
                    }
                });
            } else {
                console.error('[AUTH_DEBUG] Neither NextAuth nor socket.io available for login');
                
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Login';
                }
                
                this.showLoginError('Connection to server lost. Please refresh the page.');
            }
        } catch (error) {
            console.error('[AUTH_DEBUG] Unexpected login error:', error);
            
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            }
            
            this.showLoginError('An error occurred during login: ' + (error.message || 'Please try again.'));
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
        console.log('[AUTH_DEBUG] Login form shown');
    }
    
    /**
     * Show registration form
     */
    showRegisterForm() {
        if (this.loginContainer) this.loginContainer.style.display = 'none';
        if (this.registerContainer) this.registerContainer.style.display = 'block';
        if (this.chatContainer) this.chatContainer.style.display = 'none';
        console.log('[AUTH_DEBUG] Register form shown');
    }
    
    /**
     * Show the chat interface
     * @param {Object} user - The user object to use for display
     */
    showChatInterface(user) {
        console.log('[AUTH_DEBUG] Showing chat interface for user:', user || this.currentUser);
        
        // Make sure we have a current user set
        if (user && !this.currentUser) {
            this.currentUser = user;
            console.log('[AUTH_DEBUG] Setting current user from parameter:', user);
        } else if (!this.currentUser) {
            // Try to get user from localStorage as a fallback
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                try {
                    this.currentUser = JSON.parse(storedUser);
                    console.log('[AUTH_DEBUG] Retrieved user from localStorage:', this.currentUser);
                } catch (e) {
                    console.error('[AUTH_DEBUG] Error parsing stored user:', e);
                }
            }
        }
        
        if (!this.currentUser) {
            console.error('[AUTH_DEBUG] Cannot show chat interface: No user data available');
            this.showLoginError('User data is missing. Please try logging in again.');
            return;
        }
        
        // Get the auth container (parent container for login/register forms)
        const authContainer = document.getElementById('auth-container');
        if (authContainer) {
            authContainer.style.display = 'none';
            console.log('[AUTH_DEBUG] Auth container hidden');
        } else {
            console.warn('[AUTH_DEBUG] Auth container not found');
        }
        
        // Get the chat container - try multiple selectors to ensure we find it
        let chatContainer = document.getElementById('chat-container');
        
        if (!chatContainer) {
            // Try to find it by query selector
            chatContainer = document.querySelector('#chat-container');
            console.log('[AUTH_DEBUG] Trying to find chat container with querySelector: ', !!chatContainer);
        }
        
        if (!chatContainer) {
            // If still not found, create it
            console.log('[AUTH_DEBUG] Chat container not found, creating it');
            chatContainer = document.createElement('div');
            chatContainer.id = 'chat-container';
            
            // Add the basic structure from index.html
            chatContainer.innerHTML = `
                <!-- Left Sidebar -->
                <div id="left-sidebar">
                    <!-- App Logo -->
                    <div class="app-logo">
                        <img src="https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1747408645553" alt="The Homies Chat" class="app-icon">
                        <span>The Homies Chat</span>
                    </div>
                    
                    <!-- Main Navigation -->
                    <div class="main-nav">
                        <button class="nav-button active" id="home-button" title="Home">
                            <i class="bi bi-house-fill"></i>
                            <span>Home</span>
                        </button>
                        <button class="nav-button" id="dm-button" title="Direct Messages">
                            <i class="bi bi-chat-fill"></i>
                            <span>DMs</span>
                        </button>
                    </div>
                    
                    <!-- Channels Section -->
                    <div id="channels-section">
                        <div class="section-header">
                            <span>CHANNELS</span>
                            <button id="add-channel-btn" class="btn-icon" title="Add Channel">
                                <i class="bi bi-plus-lg"></i>
                            </button>
                        </div>
                        <div id="channels-list" class="list-container">
                            <div class="list-item active" data-channel="general">
                                <i class="bi bi-hash"></i>
                                <span>general</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Main Content Area -->
                <div id="main-content">
                    <div id="chat-header">
                        <div class="channel-info">
                            <i class="bi bi-hash"></i>
                            <h2 id="chat-title">general</h2>
                        </div>
                    </div>
                    <div id="messages-container" class="flex-grow-1 overflow-auto p-3"></div>
                    <div id="message-input-container" class="p-3 border-top">
                        <div class="input-group">
                            <input type="text" id="message-input" class="form-control" placeholder="Type a message...">
                            <button id="send-button" class="btn btn-primary">
                                <i class="bi bi-send"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Add it to the container
            document.querySelector('.container-fluid').appendChild(chatContainer);
        }
        
        // Now we should have a chat container, either found or created
        console.log('[AUTH_DEBUG] Chat container found/created, removing hiding classes');
        // Remove any classes that might hide it
        chatContainer.classList.remove('d-none', 'hidden');
        // Set display to flex (as per the original HTML structure)
        chatContainer.style.display = 'flex';
        this.chatContainer = chatContainer;
        
        // Add any necessary CSS
        chatContainer.style.height = '100vh';
        chatContainer.style.width = '100%';
        chatContainer.style.position = 'relative';
        
        console.log('[AUTH_DEBUG] Chat container shown and set to flex display');
        
        // Force a reflow to ensure the display change takes effect
        void chatContainer.offsetHeight;
        
        // Update UI with user info
        this.updateCurrentUserDisplay();
        
        // Store user in session storage for other components to access
        sessionStorage.setItem('user', JSON.stringify(this.currentUser));
        localStorage.setItem('user', JSON.stringify(this.currentUser));
        console.log('[AUTH_DEBUG] User data stored in sessionStorage and localStorage');
        
        // Force a small delay to ensure DOM updates have processed
        setTimeout(() => {
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
        }, 100);
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
     * Update UI with current user information
     */
    updateCurrentUserDisplay() {
        console.log('[AUTH_DEBUG] Updating current user display with:', this.currentUser);
        
        // Update username display
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay && this.currentUser) {
            usernameDisplay.textContent = this.currentUser.username || this.currentUser.name;
            console.log('[AUTH_DEBUG] Updated username display to:', this.currentUser.username || this.currentUser.name);
        } else {
            console.warn('[AUTH_DEBUG] Could not update username display:', 
                          usernameDisplay ? 'currentUser missing' : 'usernameDisplay element not found');
        }
        
        // Update user avatar if available
        const userAvatar = document.querySelector('.user-avatar img');
        if (userAvatar && this.currentUser && this.currentUser.avatarUrl) {
            userAvatar.src = this.currentUser.avatarUrl;
            console.log('[AUTH_DEBUG] Updated user avatar');
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
