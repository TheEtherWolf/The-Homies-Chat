/**
 * Main application initialization for The Homies App
 * Initializes all modules and sets up Socket.io
 * Uses NextAuth for authentication and ChatManager for chat functionality
 */

// Socket.io connection with authentication token if available
const authToken = localStorage.getItem('auth_token');

// Get user data from session storage or localStorage for more reliable authentication
let userData = null;
try {
    const sessionUser = sessionStorage.getItem('user');
    const localUser = localStorage.getItem('user');
    userData = sessionUser ? JSON.parse(sessionUser) : (localUser ? JSON.parse(localUser) : null);
    console.log('[APP_DEBUG] Using stored user data for socket auth:', userData ? userData.username : 'none');
} catch(e) {
    console.error('[APP_DEBUG] Error parsing stored user data:', e);
}

// Create socket connection with all available auth data
window.socket = io({
    auth: {
        token: authToken || '',
        userData: userData
    },
    query: {
        token: authToken || '',
        userId: userData?.id || '',
        username: userData?.username || ''
    },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

// Log socket connection
window.socket.on('connect', () => {
    console.log('[APP_DEBUG] Socket connected with ID:', window.socket.id);
    
    // Register session if we have user data
    const storedUser = localStorage.getItem('user');
    if (storedUser && authToken) {
        try {
            const user = JSON.parse(storedUser);
            window.socket.emit('register-session', user);
            console.log('[APP_DEBUG] Session registered with socket on connect');
        } catch (e) {
            console.error('[APP_DEBUG] Error registering session on connect:', e);
        }
    }
});

// Global variables for our managers
let chatManager;
let videoCallManager;

// Flag to prevent multiple initializations if DOMContentLoaded fires unexpectedly
let appInitialized = false; 

// Global function to initialize chat for login handler compatibility
window.initializeChat = function(user) {
    console.log('[APP_DEBUG] Global initializeChat function called with user:', user);
    if (window.chatManager) {
        // If chatManager already exists, just initialize it with the user
        window.chatManager.initialize(user);
    } else {
        // Otherwise, create a new ChatManager and initialize it
        console.log('[APP_DEBUG] Creating new ChatManager instance from global initializeChat');
        const chatManager = new ChatManager(window.socket, user);
        window.chatManager = chatManager;
        chatManager.initialize(user);
    }
};

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    if (appInitialized) { 
        console.warn('[APP_DEBUG] App already initialized. Skipping DOMContentLoaded handler.');
        return;
    }
    appInitialized = true; // Set flag immediately
    console.log('[APP_DEBUG] DOMContentLoaded event fired. Initializing app...');
    
    // Initialize Auth client first
    if (window.AuthClient) {
        try {
            const session = await window.AuthClient.init();
            if (session && session.user) {
                console.log('[APP_DEBUG] User is already authenticated, initializing chat');
                initializeChatManager(session.user);
            }
        } catch (error) {
            console.error('[APP_DEBUG] Error initializing Auth client:', error);
        }
    } else {
        console.warn('[APP_DEBUG] Auth client not found, falling back to localStorage');
        // Fallback to localStorage check
        const storedUser = localStorage.getItem('user');
        const authToken = localStorage.getItem('auth_token');
        
        if (storedUser && authToken) {
            try {
                const user = JSON.parse(storedUser);
                console.log('[APP_DEBUG] Found stored user and token, initializing chat');
                
                // Register session with socket
                if (window.socket) {
                    window.socket.emit('register-session', user);
                    console.log('[APP_DEBUG] Session registered with socket');
                }
                
                initializeChatManager(user);
            } catch (e) {
                console.error('[APP_DEBUG] Error parsing stored user:', e);
            }
        }
    }
    
    // Basic socket connection logging
    window.socket.on('connect', () => {
        console.log('[APP_DEBUG] Socket connected with ID:', window.socket.id);
        // If ChatManager is already initialized, let it handle reconnection
        if (chatManager && chatManager.isInitialized) {
            console.log('[APP_DEBUG] Socket connected, telling ChatManager to handle reconnect.');
            chatManager.handleReconnect();
        }
    });
    
    window.socket.on('disconnect', (reason) => {
        console.log('[APP_DEBUG] Socket disconnected:', reason);
        if (chatManager) chatManager.addSystemMessage('Disconnected from server...');
    });
    
    window.socket.on('connect_error', (error) => {
        console.error('[APP_DEBUG] Socket connection error:', error);
        if (chatManager) chatManager.addSystemMessage('Connection error...');
    });
    
    // Manually force reconnection if needed
    setInterval(() => {
        if (window.socket && !window.socket.connected) {
            console.log('[APP_DEBUG] Attempting to reconnect socket...');
            window.socket.connect();
        }
    }, 5000); // Try every 5 seconds
});

/**
 * Initializes the main application components.
 * This is now handled directly in the DOMContentLoaded event listener.
 */
function initializeApp() {
    console.log('[APP_DEBUG] initializeApp is now a no-op. Initialization is handled in DOMContentLoaded.');
    // This function is kept for backward compatibility but does nothing
}

// Event listener for userLoggedIn event to trigger ChatManager initialization
document.addEventListener('userLoggedIn', async (event) => {
    console.log('[APP_DEBUG] userLoggedIn event received in app.js with data:', event.detail);
    
    try {
        // Get user data from event or try to get it from NextAuth/localStorage
        let user = event.detail?.user;
        
        if (!user) {
            console.log('[APP_DEBUG] No user data in event, checking NextAuth');
            try {
                // Try to get user from NextAuth first
                if (window.NextAuthSimplified) {
                    const session = await window.NextAuthSimplified.getSession();
                    if (session?.user) {
                        user = session.user;
                        console.log('[APP_DEBUG] Found user in NextAuth session');
                    }
                }
                
                // Fall back to localStorage if NextAuth doesn't have the user
                if (!user) {
                    console.warn('[APP_DEBUG] No user in NextAuth, checking localStorage');
                    const storedUser = localStorage.getItem('user');
                    if (storedUser) {
                        try {
                            user = JSON.parse(storedUser);
                            console.log('[APP_DEBUG] Found user in localStorage');
                        } catch (e) {
                            console.error('[APP_DEBUG] Error parsing stored user:', e);
                            throw new Error('Invalid user data in localStorage');
                        }
                    } else {
                        console.warn('[APP_DEBUG] No user data found in localStorage');
                    }
                }
            } catch (e) {
                console.error('[APP_DEBUG] Error getting user data:', e);
                showLoginScreen();
                return;
            }
        }
        
        if (!user) {
            console.error('[APP_DEBUG] No valid user data available, showing login screen');
            showLoginScreen();
            return;
        }
        
        // Store user in localStorage for persistence
        localStorage.setItem('user', JSON.stringify(user));
        console.log('[APP_DEBUG] User data stored in localStorage');
        
        // Initialize ChatManager with user data
        initializeChatManager(user);
        
        // Hide login screen and show chat
        hideLoginScreen();
        
    } catch (error) {
        console.error('[APP_DEBUG] Error in userLoggedIn handler:', error);
        showLoginScreen();
    }
});

/**
 * Shows the login screen and hides the chat interface
 */
function showLoginScreen() {
    const loginContainer = document.getElementById('login-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (loginContainer) loginContainer.style.display = 'block';
    if (chatContainer) chatContainer.style.display = 'none';
    
    console.log('[APP_DEBUG] Showing login screen');
}

/**
 * Hides the login screen and shows the chat interface
 */
function hideLoginScreen() {
    const loginContainer = document.getElementById('login-container');
    const authContainer = document.getElementById('auth-container');
    const chatContainer = document.getElementById('chat-container');
    
    // Hide all authentication containers
    if (loginContainer) loginContainer.style.display = 'none';
    if (authContainer) authContainer.style.display = 'none';
    
    // Show chat container with proper grid display
    if (chatContainer) {
        chatContainer.classList.remove('d-none');
        chatContainer.style.display = 'grid';
        chatContainer.style.opacity = '1';
        chatContainer.style.pointerEvents = 'auto';
        
        // Ensure main content and sidebar are visible
        const mainContent = document.getElementById('main-content');
        const leftSidebar = document.getElementById('left-sidebar');
        
        if (mainContent) {
            mainContent.style.opacity = '1';
            mainContent.style.pointerEvents = 'auto';
        }
        
        if (leftSidebar) {
            leftSidebar.style.opacity = '1';
            leftSidebar.style.pointerEvents = 'auto';
        }
    }
    
    console.log('[APP_DEBUG] Showing chat interface with grid layout');
}

/**
 * Checks if ChatManager is available and initializes it
 * @param {Object} user - The user object to initialize ChatManager with
 */
function initializeChatWithUser(user) {
    // Check if ChatManager class is available
    if (typeof ChatManager === 'undefined') {
        console.log('[APP_DEBUG] ChatManager class is not defined. Trying to use chat.js version.');
        // Try to dynamically load the chat.js script if needed
        if (!document.querySelector('script[src*="chat.js"]')) {
            console.log('[APP_DEBUG] Attempting to load chat.js');
            const script = document.createElement('script');
            script.src = '/js/chat.js';
            document.head.appendChild(script);
            
            script.onload = () => {
                console.log('[APP_DEBUG] chat.js loaded successfully');
                initializeChatManager(user);
            };
            
            script.onerror = () => {
                console.error('[APP_DEBUG] Failed to load chat.js');
            };
            
            document.head.appendChild(script);
        }
    } else {
        // ChatManager class is available, proceed with initialization
        initializeChatManager(user);
    }
}

/**
 * Helper function to initialize the ChatManager
 */
function initializeChatManager(user) {
    console.log('[APP_DEBUG] Initializing ChatManager with user:', user);
    
    // Ensure we have valid user data
    if (!user || !user.username) {
        console.error('[APP_DEBUG] Cannot initialize ChatManager: Invalid user data');
        // Try to get user from localStorage as a last resort
        try {
            const storedUser = localStorage.getItem('user');
            const authToken = localStorage.getItem('auth_token');
            
            if (storedUser && authToken) {
                user = JSON.parse(storedUser);
                // Make sure the user has a token
                if (!user.token) {
                    user.token = authToken;
                }
                console.log('[APP_DEBUG] Retrieved user from localStorage for ChatManager:', user);
                
                // Register session with socket if not already done
                if (window.socket) {
                    window.socket.emit('register-session', user);
                    console.log('[APP_DEBUG] Session registered with socket from initializeChatManager');
                }
            } else {
                console.error('[APP_DEBUG] No user data or auth token available in localStorage');
                return;
            }
        } catch (e) {
            console.error('[APP_DEBUG] Error retrieving user from localStorage:', e);
            return;
        }
    }
    
    // Check if ChatManager is already initialized
    if (window.chatManager) {
        console.log('[APP_DEBUG] ChatManager already initialized, skipping re-initialization');
        return;
    }
    
    try {
        // Check if ChatManager class is available
        if (typeof ChatManager === 'undefined') {
            console.log('[APP_DEBUG] ChatManager class not found, loading chat.js');
            // Dynamically load the chat.js script
            const script = document.createElement('script');
            script.src = 'js/chat.js';
            script.onload = function() {
                console.log('[APP_DEBUG] chat.js loaded successfully, initializing ChatManager');
                // Create new ChatManager instance after script is loaded
                try {
                    const chatManager = new ChatManager(window.socket, user);
                    window.chatManager = chatManager;
                    
                    // Initialize ChatManager
                    chatManager.initialize(user);
                    
                    // Show chat interface
                    document.getElementById('auth-container')?.classList.add('d-none');
                    document.getElementById('chat-container')?.classList.remove('d-none');
                    
                    console.log('[APP_DEBUG] ChatManager initialized successfully');
                } catch (initError) {
                    console.error('[APP_DEBUG] Error initializing ChatManager after loading script:', initError);
                }
            };
            script.onerror = function() {
                console.error('[APP_DEBUG] Failed to load chat.js');
            };
            document.head.appendChild(script);
            return;
        }
        
        // Create new ChatManager instance
        console.log('[APP_DEBUG] Creating new ChatManager instance');
        const chatManager = new ChatManager(window.socket, user);
        window.chatManager = chatManager;
        
        // Initialize ChatManager
        chatManager.initialize(user);
        
        // Show the chat container
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            // Remove d-none class if it exists
            chatContainer.classList.remove('d-none');
            
            // Force grid display with explicit styling
            chatContainer.style.display = 'grid';
            chatContainer.style.gridTemplateColumns = '280px 1fr';
            chatContainer.style.gridTemplateAreas = '"sidebar content"';
            chatContainer.style.height = '100vh';
            chatContainer.style.width = '100%';
            chatContainer.style.opacity = '1';
            chatContainer.style.pointerEvents = 'auto';
            chatContainer.style.zIndex = '1';
            chatContainer.style.position = 'relative';
            
            // Make sure sidebar and main content are visible and interactive
            const leftSidebar = document.getElementById('left-sidebar');
            const mainContent = document.getElementById('main-content');
            
            if (leftSidebar) {
                leftSidebar.style.opacity = '1';
                leftSidebar.style.pointerEvents = 'auto';
                leftSidebar.style.zIndex = '2';
                leftSidebar.style.display = 'flex';
            }
            
            if (mainContent) {
                mainContent.style.opacity = '1';
                mainContent.style.pointerEvents = 'auto';
                mainContent.style.zIndex = '1';
                mainContent.style.display = 'flex';
            }
            
            // Hide auth container to make sure it doesn't overlap
            const authContainer = document.getElementById('auth-container');
            if (authContainer) {
                authContainer.style.display = 'none';
            }
            
            console.log('[APP_DEBUG] Chat container shown with enhanced styling');
        } else {
            console.warn('[APP_DEBUG] Chat container element not found');
        }
        
        // Hide the login container
        const loginContainer = document.getElementById('login-container');
        if (loginContainer) {
            loginContainer.style.display = 'none';
            console.log('[APP_DEBUG] Login container hidden');
        }
        
        // Hide the register container
        const registerContainer = document.getElementById('register-container');
        if (registerContainer) {
            registerContainer.style.display = 'none';
            console.log('[APP_DEBUG] Register container hidden');
        }
        
        // Emit an event that chat is ready
        try {
            const chatReadyEvent = new CustomEvent('chatReady', {
                detail: { user: user }
            });
            document.dispatchEvent(chatReadyEvent);
            console.log('[APP_DEBUG] Dispatched chatReady event');
        } catch (eventError) {
            console.error('[APP_DEBUG] Error dispatching chatReady event:', eventError);
        }
    } catch (error) {
        console.error('[APP_DEBUG] Error initializing ChatManager:', error);
        
        // Force socket reconnection if needed
        if (window.socket && !window.socket.connected) {
            console.log('[APP_DEBUG] Forcing socket reconnection...');
            window.socket.connect();
        }
    }
}

// Helper function to format dates (keep as is)
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Helper function to securely encrypt data
function encryptData(data, key) {
    try {
        return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
    } catch (error) {
        console.error('Encryption error:', error);
        return null;
    }
}

// Helper function to decrypt data
function decryptData(encryptedData, key) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, key);
        return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

// Send a message
function sendMessage() {
    // Get user data from session
    const userData = sessionStorage.getItem('user');
    if (!userData) {
        console.error('User not authenticated');
        showError('Please log in to send messages');
        return;
    }
    
    // Get message content
    const messageInput = document.getElementById('message-input');
    const messageContent = messageInput.value.trim();
    
    // Don't send empty messages
    if (!messageContent) {
        console.log('Prevented sending empty message');
        return;
    }
    
    // Parse user data
    let user;
    try {
        user = JSON.parse(userData);
    } catch (error) {
        console.error('Error parsing user data:', error);
        showError('Session data is corrupted. Please log in again.');
        return;
    }
    
    // Create message object
    const message = {
        senderId: user.id,
        message: messageContent,
        timestamp: Date.now()
    };
    
    // Clear input field
    messageInput.value = '';
    
    // Send message to server
    socket.emit('chat-message', message);
    
    // Show success feedback
    messageInput.focus();
}