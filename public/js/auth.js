/**
 * Authentication module for The Homies App
 * Handles login, registration, and user sessions
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.authToken = localStorage.getItem('authToken');
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.showLoginBtn = document.getElementById('show-login');
        this.showRegisterBtn = document.getElementById('show-register');
        this.authMessage = document.getElementById('auth-message');
        this.authContainer = document.getElementById('auth-container');
        this.appContainer = document.getElementById('app-container');
        this.currentUserDisplay = document.getElementById('current-user');
        this.logoutBtn = document.getElementById('logout-btn');
        
        this.initEventListeners();
    }

    initEventListeners() {
        // Form switching
        this.showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleForms('login');
        });
        
        this.showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleForms('register');
        });
        
        // Form submissions
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        this.registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegistration();
        });
        
        // Logout
        this.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });
        
        // Check if already logged in
        if (this.authToken) {
            this.validateToken();
        }
    }
    
    toggleForms(form) {
        if (form === 'login') {
            this.loginForm.classList.remove('d-none');
            this.registerForm.classList.add('d-none');
            document.getElementById('auth-title').textContent = 'Sign In';
        } else {
            this.loginForm.classList.add('d-none');
            this.registerForm.classList.remove('d-none');
            document.getElementById('auth-title').textContent = 'Create Account';
        }
        this.authMessage.classList.add('d-none');
    }
    
    showMessage(message, isError = false) {
        this.authMessage.textContent = message;
        this.authMessage.classList.remove('d-none', 'alert-success', 'alert-danger');
        this.authMessage.classList.add(isError ? 'alert-danger' : 'alert-success');
    }
    
    handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            return this.showMessage('Please enter both username and password', true);
        }
        
        // Generate a client-side encryption key for secure message storage
        const encryptionKey = CryptoJS.lib.WordArray.random(16).toString();
        
        // Store the encryption key in localStorage for this session
        localStorage.setItem('messageEncryptionKey', encryptionKey);
        
        socket.emit('login', { username, password }, (response) => {
            if (response.success) {
                this.currentUser = response.user;
                
                // Generate session token (in a real app, this would come from the server)
                const token = CryptoJS.SHA256(username + Date.now()).toString();
                localStorage.setItem('authToken', token);
                localStorage.setItem('username', username);
                
                this.showAuthenticatedUI();
            } else {
                this.showMessage(response.message || 'Login failed. Please try again.', true);
            }
        });
    }
    
    handleRegistration() {
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        
        // Validation
        if (!username || !email || !password) {
            return this.showMessage('All fields are required', true);
        }
        
        if (password !== confirmPassword) {
            return this.showMessage('Passwords do not match', true);
        }
        
        if (password.length < 6) {
            return this.showMessage('Password must be at least 6 characters', true);
        }
        
        socket.emit('register', { username, email, password }, (response) => {
            if (response.success) {
                if (response.pendingVerification) {
                    // Show verification pending screen
                    this.showVerificationPending(email, response.message);
                } else {
                    // If auto-verified (email service disabled), show login
                    this.showMessage('Account created successfully! You can now login.');
                    this.toggleForms('login');
                }
            } else {
                this.showMessage(response.message || 'Registration failed. Please try again.', true);
            }
        });
    }
    
    showVerificationPending(email, message) {
        // Hide both login and register forms
        this.loginForm.classList.add('d-none');
        this.registerForm.classList.add('d-none');
        
        // Show verification pending UI
        let pendingDiv = document.getElementById('verification-pending');
        
        if (!pendingDiv) {
            // Create verification pending div if it doesn't exist
            pendingDiv = document.createElement('div');
            pendingDiv.id = 'verification-pending';
            pendingDiv.className = 'mt-3';
            
            const cardHeader = document.querySelector('.auth-card .card-header');
            const cardBody = document.querySelector('.auth-card .card-body');
            
            // Update card title
            document.getElementById('auth-title').textContent = 'Email Verification';
            
            // Create and append the pending verification content
            pendingDiv.innerHTML = `
                <div class="text-center">
                    <i class="bi bi-envelope-check fs-1 mb-3 text-primary"></i>
                    <h4>Verification Email Sent</h4>
                    <p>We've sent a verification link to <strong>${email}</strong></p>
                    <p>Please check your inbox and click the verification link to activate your account.</p>
                    <p class="small text-muted">Can't find the email? Check your spam folder or try again.</p>
                    <button id="back-to-login" class="btn btn-primary mt-3">Back to Login</button>
                </div>
            `;
            
            cardBody.appendChild(pendingDiv);
            
            // Add event listener to the back to login button
            document.getElementById('back-to-login').addEventListener('click', () => {
                pendingDiv.remove();
                this.toggleForms('login');
            });
        } else {
            // Update existing verification pending div
            pendingDiv.classList.remove('d-none');
            const emailElement = pendingDiv.querySelector('strong');
            if (emailElement) emailElement.textContent = email;
        }
        
        // Show success message
        this.showMessage(message || 'Verification email sent!');
    }
    
    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        localStorage.removeItem('messageEncryptionKey');
        
        this.toggleForms('login');
        this.authContainer.classList.remove('d-none');
        this.appContainer.classList.add('d-none');
        
        // Disconnect socket
        if (socket) {
            socket.disconnect();
            // Reconnect for login
            socket.connect();
        }
    }
    
    validateToken() {
        const username = localStorage.getItem('username');
        if (!username) {
            localStorage.removeItem('authToken');
            return;
        }
        
        // In a real app, you would verify the token with the server
        // For now, we'll just use the stored username to re-login automatically
        this.currentUserDisplay.textContent = username;
        this.showAuthenticatedUI();
    }
    
    showAuthenticatedUI() {
        this.authContainer.classList.add('d-none');
        this.appContainer.classList.remove('d-none');
        
        // Update UI
        const username = this.currentUser ? this.currentUser.username : localStorage.getItem('username');
        this.currentUserDisplay.textContent = username;
        
        // Initialize chat and trigger message history load
        if (chatManager) {
            chatManager.initialize();
        }
    }
}

// Will be initialized in app.js
