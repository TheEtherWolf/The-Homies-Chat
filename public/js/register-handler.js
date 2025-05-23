/**
 * Registration Handler for The Homies Chat
 * Provides a reliable registration experience with clear error handling
 * Uses the NextAuth client for authentication
 */
class RegisterHandler {
    constructor() {
        this.initialized = false;
        this.registerForm = null;
        this.registerError = null;
        this.registerBtn = null;
        this.registerBtnText = null;
        this.registerSpinner = null;
        
        // Bind methods
        this.init = this.init.bind(this);
        this.handleRegister = this.handleRegister.bind(this);
        this.setLoading = this.setLoading.bind(this);
        this.showError = this.showError.bind(this);
        this.validateForm = this.validateForm.bind(this);
        
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
        console.log('[REGISTER_HANDLER]', message, ...args);
    }
    
    /**
     * Initialize the registration handler
     */
    async init() {
        try {
            // Find the registration form and related elements
            this.registerForm = document.getElementById('register-form');
            this.registerError = document.getElementById('register-error');
            this.registerBtn = document.getElementById('register-btn');
            this.registerBtnText = document.getElementById('register-btn-text');
            this.registerSpinner = document.getElementById('register-spinner');
            
            if (!this.registerForm) {
                console.warn('Registration form not found');
                return;
            }
            
            // Add event listeners
            this.registerForm.addEventListener('submit', this.handleRegister);
            
            // Add password match validation
            const passwordInput = this.registerForm.querySelector('input[id="register-password"]');
            const confirmPasswordInput = this.registerForm.querySelector('input[id="register-confirm-password"]');
            const passwordMatchError = document.getElementById('password-match-error');
            
            if (passwordInput && confirmPasswordInput && passwordMatchError) {
                const validatePasswordMatch = () => {
                    if (confirmPasswordInput.value && passwordInput.value !== confirmPasswordInput.value) {
                        passwordMatchError.style.display = 'block';
                    } else {
                        passwordMatchError.style.display = 'none';
                    }
                };
                
                passwordInput.addEventListener('input', validatePasswordMatch);
                confirmPasswordInput.addEventListener('input', validatePasswordMatch);
            }
            
            this.initialized = true;
            this.log('Registration handler initialized');
        } catch (error) {
            console.error('Error initializing registration handler:', error);
        }
    }
    
    /**
     * Set loading state for the register button
     * @param {boolean} isLoading - Whether the register button should show loading state
     */
    setLoading(isLoading) {
        if (!this.registerBtn || !this.registerBtnText || !this.registerSpinner) return;
        
        if (isLoading) {
            this.registerBtn.disabled = true;
            this.registerBtnText.textContent = 'Creating Account...';
            this.registerSpinner.classList.remove('d-none');
        } else {
            this.registerBtn.disabled = false;
            this.registerBtnText.textContent = 'Create Account';
            this.registerSpinner.classList.add('d-none');
        }
    }
    
    /**
     * Show an error message
     * @param {string} message - The error message to display
     */
    showError(message) {
        if (!this.registerError) return;
        
        this.registerError.textContent = message;
        this.registerError.style.display = 'block';
        
        // Scroll to error
        this.registerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    /**
     * Validate the registration form
     * @returns {Object|null} Validated form data or null if validation fails
     */
    validateForm() {
        const username = this.registerForm.querySelector('input[id="register-username"]').value.trim();
        const email = this.registerForm.querySelector('input[id="register-email"]').value.trim();
        const password = this.registerForm.querySelector('input[id="register-password"]').value;
        const confirmPassword = this.registerForm.querySelector('input[id="register-confirm-password"]').value;
        
        // Check required fields
        if (!username) {
            this.showError('Please enter a username');
            return null;
        }
        
        if (!email) {
            this.showError('Please enter your email address');
            return null;
        }
        
        if (!password) {
            this.showError('Please create a password');
            return null;
        }
        
        if (!confirmPassword) {
            this.showError('Please confirm your password');
            return null;
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showError('Please enter a valid email address');
            return null;
        }
        
        // Validate username (alphanumeric, underscores, 3-20 chars)
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            this.showError('Username must be 3-20 characters long and can only contain letters, numbers, and underscores');
            return null;
        }
        
        // Validate password length
        if (password.length < 6) {
            this.showError('Password must be at least 6 characters long');
            return null;
        }
        
        // Check if passwords match
        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return null;
        }
        
        return { username, email, password, confirmPassword };
    }
    
    /**
     * Handle registration form submission
     * @param {Event} e - The form submit event
     */
    async handleRegister(e) {
        e.preventDefault();
        
        if (!this.registerForm) return;
        
        // Hide any previous errors
        if (this.registerError) {
            this.registerError.style.display = 'none';
        }
        
        // Validate form
        const formData = this.validateForm();
        if (!formData) return;
        
        this.setLoading(true);
        
        try {
            // Sign up using direct API call
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Registration failed. Please try again.');
            }
            
            const result = await response.json();
            
            if (!result.success || !result.user) {
                throw new Error('Registration failed. Please try again.');
            }
            
            // If we get here, registration was successful
            this.log('Registration successful:', result.user);
            
            // Store user in localStorage
            localStorage.setItem('user', JSON.stringify(result.user));
            
            // Redirect to chat page
            window.location.href = '/chat.html';
        } catch (error) {
            console.error('Registration error:', error);
            this.showError(error.message || 'Registration failed. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }
}

// Initialize the registration handler
window.registerHandler = new RegisterHandler();
