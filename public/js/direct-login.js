/**
 * Direct Login Fix for The Homies Chat
 * This script provides a simple, direct approach to handling login
 */

// Wait for the document to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('[DIRECT_LOGIN] Direct login script loaded');
    
    // Get the login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('[DIRECT_LOGIN] Found login form, adding submit handler');
        
        // Replace the existing submit handler with our own
        loginForm.onsubmit = async function(event) {
            event.preventDefault();
            
            // Get username and password
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            
            if (!username || !password) {
                showError('Username and password are required');
                return;
            }
            
            // Disable login button and show loading state
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Logging in...';
            }
            
            // Clear any previous errors
            hideError();
            
            try {
                console.log('[DIRECT_LOGIN] Attempting login for user:', username);
                
                // Make a direct fetch request to the server
                const response = await fetch('/api/auth/signin', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const result = await response.json();
                console.log('[DIRECT_LOGIN] Login response:', result);
                
                if (result.ok === true) {
                    console.log('[DIRECT_LOGIN] Login successful');
                    
                    // Store user data
                    const user = result.user || { 
                        username, 
                        id: result.userId || result.session?.userId || 'unknown',
                        name: username
                    };
                    
                    localStorage.setItem('user', JSON.stringify(user));
                    sessionStorage.setItem('user', JSON.stringify(user));
                    
                    // Hide auth container
                    const authContainer = document.getElementById('auth-container');
                    if (authContainer) {
                        authContainer.style.display = 'none';
                    }
                    
                    // Show chat container
                    const chatContainer = document.getElementById('chat-container');
                    if (chatContainer) {
                        chatContainer.classList.remove('d-none', 'hidden');
                        chatContainer.style.display = 'flex';
                        
                        // Force a reload to ensure everything is initialized properly
                        window.location.href = '/index.html?loggedIn=true';
                    } else {
                        console.error('[DIRECT_LOGIN] Chat container not found');
                        showError('Error loading chat interface');
                    }
                } else {
                    console.error('[DIRECT_LOGIN] Login failed:', result.error);
                    showError(result.error || 'Login failed. Please check your credentials.');
                    
                    // Re-enable login button
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Sign In';
                    }
                }
            } catch (error) {
                console.error('[DIRECT_LOGIN] Error during login:', error);
                showError('An error occurred during login. Please try again.');
                
                // Re-enable login button
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Sign In';
                }
            }
        };
    }
    
    // Check if we're logged in (from URL parameter)
    const urlParams = new URLSearchParams(window.location.search);
    const loggedIn = urlParams.get('loggedIn');
    
    if (loggedIn === 'true') {
        console.log('[DIRECT_LOGIN] Detected loggedIn parameter, showing chat interface');
        
        // Hide auth container
        const authContainer = document.getElementById('auth-container');
        if (authContainer) {
            authContainer.style.display = 'none';
        }
        
        // Show chat container
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            chatContainer.classList.remove('d-none', 'hidden');
            chatContainer.style.display = 'flex';
            console.log('[DIRECT_LOGIN] Chat container displayed');
            
            // Clean up the URL
            window.history.replaceState({}, document.title, '/');
        }
    }
    
    // Helper functions
    function showError(message) {
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.textContent = message;
            loginError.style.display = 'block';
        }
    }
    
    function hideError() {
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.style.display = 'none';
        }
    }
});
