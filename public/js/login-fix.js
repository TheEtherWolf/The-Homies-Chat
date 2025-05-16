/**
 * Login Fix for The Homies Chat
 * This script fixes the login issues by directly handling the transition
 * from login to chat interface
 */

// Wait for the document to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('[LOGIN_FIX] Login fix script loaded');
    
    // Get the login form and add our custom handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('[LOGIN_FIX] Found login form, adding submit handler');
        
        // Add our custom submit handler
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            // Get username and password
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            
            if (!username || !password) {
                showLoginError('Username and password are required');
                return;
            }
            
            // Disable login button and show loading state
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Logging in...';
            }
            
            // Clear any previous errors
            hideLoginError();
            
            try {
                console.log('[LOGIN_FIX] Attempting login for user:', username);
                
                // Try to use NextAuth if available
                if (window.NextAuth) {
                    console.log('[LOGIN_FIX] Using NextAuth for login');
                    
                    try {
                        const response = await window.NextAuth.signIn({ username, password });
                        console.log('[LOGIN_FIX] NextAuth login response:', response);
                        
                        // Check for successful login - the server returns different formats
                        // so we need to check multiple properties
                        if (response && (response.ok === true || response.user || response.session)) {
                            console.log('[LOGIN_FIX] Login successful, showing chat interface');
                            
                            // Store user in session storage and local storage
                            const user = response.user || { 
                                username, 
                                id: response.userId || response.session?.userId || 'unknown',
                                name: username
                            };
                            
                            console.log('[LOGIN_FIX] Storing user data:', user);
                            sessionStorage.setItem('user', JSON.stringify(user));
                            localStorage.setItem('user', JSON.stringify(user));
                            
                            // Hide auth container and show chat container
                            const authContainer = document.getElementById('auth-container');
                            const chatContainer = document.getElementById('chat-container');
                            
                            if (authContainer) {
                                authContainer.style.display = 'none';
                            }
                            
                            if (chatContainer) {
                                chatContainer.classList.remove('d-none', 'hidden');
                                chatContainer.style.display = 'flex';
                                console.log('[LOGIN_FIX] Chat container displayed');
                                
                                // Dispatch userLoggedIn event to trigger ChatManager initialization
                                document.dispatchEvent(new CustomEvent('userLoggedIn', {
                                    detail: { user: user }
                                }));
                                
                                // Initialize the chat interface directly instead of reloading
                                console.log('[LOGIN_FIX] Initializing chat interface directly');
                                
                                // If ChatManager exists, initialize it
                                if (window.chatManager && typeof window.chatManager.initialize === 'function') {
                                    console.log('[LOGIN_FIX] Using existing ChatManager');
                                    window.chatManager.initialize(user);
                                } else if (typeof ChatManager === 'function') {
                                    console.log('[LOGIN_FIX] Creating new ChatManager instance');
                                    // If app.js hasn't created chatManager yet, we can initialize it
                                    if (window.socket) {
                                        const newChatManager = new ChatManager(window.socket);
                                        newChatManager.initialize(user);
                                    }
                                }
                                
                                // Update any user display elements
                                const userDisplayElements = document.querySelectorAll('.user-display, .current-user');
                                userDisplayElements.forEach(el => {
                                    if (el) el.textContent = user.username || user.name;
                                });
                                
                                console.log('[LOGIN_FIX] Chat interface initialization complete');
                            } else {
                                console.error('[LOGIN_FIX] Chat container not found!');
                                showLoginError('Error loading chat interface. Please try again.');
                            }
                        } else {
                            console.error('[LOGIN_FIX] Login failed:', response?.error || 'Unknown error');
                            showLoginError(response?.error || 'Login failed. Please check your credentials.');
                            
                            // Re-enable login button
                            if (loginBtn) {
                                loginBtn.disabled = false;
                                loginBtn.textContent = 'Sign In';
                            }
                        }
                    } catch (error) {
                        console.error('[LOGIN_FIX] Error during login:', error);
                        showLoginError('An error occurred during login. Please try again.');
                        
                        // Re-enable login button
                        if (loginBtn) {
                            loginBtn.disabled = false;
                            loginBtn.textContent = 'Sign In';
                        }
                    }
                } else {
                    console.error('[LOGIN_FIX] NextAuth not available');
                    showLoginError('Authentication system not available. Please try again later.');
                    
                    // Re-enable login button
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Sign In';
                    }
                }
            } catch (error) {
                console.error('[LOGIN_FIX] Unexpected error during login:', error);
                showLoginError('An unexpected error occurred. Please try again.');
                
                // Re-enable login button
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Sign In';
                }
            }
        });
    } else {
        console.warn('[LOGIN_FIX] Login form not found');
    }
    
    // Helper function to show login error
    function showLoginError(message) {
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.textContent = message;
            loginError.style.display = 'block';
        }
    }
    
    // Helper function to hide login error
    function hideLoginError() {
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.style.display = 'none';
        }
    }
    
    // Check if we're already logged in
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            console.log('[LOGIN_FIX] Found stored user:', user);
            
            // Hide auth container and show chat container
            const authContainer = document.getElementById('auth-container');
            const chatContainer = document.getElementById('chat-container');
            
            if (authContainer) {
                authContainer.style.display = 'none';
            }
            
            if (chatContainer) {
                chatContainer.classList.remove('d-none', 'hidden');
                chatContainer.style.display = 'flex';
                console.log('[LOGIN_FIX] Chat container displayed for stored user');
            }
        } catch (e) {
            console.error('[LOGIN_FIX] Error parsing stored user:', e);
        }
    }
});
