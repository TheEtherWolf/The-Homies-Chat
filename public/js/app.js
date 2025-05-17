/**
 * Main application initialization for The Homies App
 * Initializes all modules and sets up Socket.io
 * Uses NextAuth for authentication and ChatManager for chat functionality
 */

// Socket.io connection - declare as window.socket to ensure global availability
window.socket = io(); 

// Global variables for our managers
let chatManager;
let videoCallManager;

// Flag to prevent multiple initializations if DOMContentLoaded fires unexpectedly
let appInitialized = false; 

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    if (appInitialized) { 
        console.warn('[APP_DEBUG] App already initialized. Skipping DOMContentLoaded handler.');
        return;
    }
    appInitialized = true; // Set flag immediately
    console.log('[APP_DEBUG] DOMContentLoaded event fired. Initializing app...');
    
    // Initialize NextAuth first
    if (window.NextAuthSimplified) {
        try {
            const session = await window.NextAuthSimplified.init();
            if (session && session.user) {
                console.log('[APP_DEBUG] User is already authenticated, initializing chat');
                initializeChatManager(session.user);
            }
        } catch (error) {
            console.error('[APP_DEBUG] Error initializing NextAuth:', error);
        }
    } else {
        console.warn('[APP_DEBUG] NextAuthSimplified not found, falling back to localStorage');
        // Fallback to localStorage check
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                console.log('[APP_DEBUG] Found stored user, initializing chat');
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
                console.warn('[APP_DEBUG] No user in NextAuth, trying localStorage');
                try {
                    const storedUser = localStorage.getItem('user');
                    if (storedUser) {
                        user = JSON.parse(storedUser);
                        console.log('[APP_DEBUG] Found user in localStorage:', user);
                    } else {
                        console.warn('[APP_DEBUG] No user data found in localStorage');
                    }
                } catch (e) {
                    console.error('[APP_DEBUG] Error parsing stored user:', e);
                }
            }
        } catch (e) {
            console.error('[APP_DEBUG] Error getting user data:', e);
            return;
        }
    }
    
    if (!user) {
        console.error('[APP_DEBUG] No user data available, cannot initialize ChatManager');
        return;
    }
    
    // Check if ChatManager is already initialized
    if (chatManager && chatManager.isInitialized) {
        console.log('[APP_DEBUG] ChatManager already initialized when userLoggedIn event received.');
        return;
    }
    
    // Initialize ChatManager with user data
    initializeChatManager(user);

    // Store user in localStorage for persistence if not already there
    if (!localStorage.getItem('user')) {
        localStorage.setItem('user', JSON.stringify(user));
        console.log('[APP_DEBUG] User stored in localStorage');
    }
    
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
                console.error('[APP_DEBUG] Failed to load chat-fixed.js');
            };
        }
    } else {
        // ChatManager class is available, proceed with initialization
        initializeChatManager(user);
    }
});

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
            if (storedUser) {
                user = JSON.parse(storedUser);
                console.log('[APP_DEBUG] Retrieved user from localStorage for ChatManager:', user);
            } else {
                console.error('[APP_DEBUG] No user data available in localStorage');
                return;
            }
        } catch (e) {
            console.error('[APP_DEBUG] Error retrieving user from localStorage:', e);
            return;
        }
    }
    
    // Check if ChatManager is already initialized
    if (window.chatManager) {
        console.log('[APP_DEBUG] ChatManager already initialized, updating user');
        window.chatManager.updateUser(user);
        return;
    }
    
    // Make sure socket is available
    if (!window.socket) {
        console.error('[APP_DEBUG] Socket not available, attempting to initialize it');
        try {
            // Try to initialize socket if not already done
            initializeSocket();
            
            if (!window.socket) {
                console.error('[APP_DEBUG] Failed to initialize socket, cannot proceed with ChatManager');
                return;
            }
        } catch (socketError) {
            console.error('[APP_DEBUG] Error initializing socket:', socketError);
            return;
        }
    }
    
    try {
        console.log('[APP_DEBUG] Creating new ChatManager instance');
        window.chatManager = new ChatManager(user, window.socket);
        
        // Initialize the chat UI
        window.chatManager.initialize();
        console.log('[APP_DEBUG] ChatManager initialized successfully');
        
        // Show the chat container
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            // Remove d-none class if it exists
            chatContainer.classList.remove('d-none');
            chatContainer.style.display = 'block';
            console.log('[APP_DEBUG] Chat container shown');
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
        const chatReadyEvent = new CustomEvent('chatReady', {
            detail: { user: user }
        });
        document.dispatchEvent(chatReadyEvent);
        console.log('[APP_DEBUG] Dispatched chatReady event');
    } catch (error) {
        console.error('[APP_DEBUG] Error initializing ChatManager:', error);
    }
    
    // Force socket reconnection if needed
    if (window.socket && !window.socket.connected) {
        console.log('[APP_DEBUG] Forcing socket reconnection...');
        window.socket.connect();
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