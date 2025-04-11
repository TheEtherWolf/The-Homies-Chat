/**
 * Main application initialization for The Homies App
 * Initializes all modules and sets up Socket.io
 */

// Socket.io connection - declare as window.socket to ensure global availability
window.socket = io(); 

// Global variables for our managers
let authManager;
let chatManager;
let videoCallManager;

// Flag to prevent multiple initializations if DOMContentLoaded fires unexpectedly
let appInitialized = false; 

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    if (appInitialized) { 
        console.warn('[APP_DEBUG] App already initialized. Skipping DOMContentLoaded handler.');
        return;
    }
    appInitialized = true; // Set flag immediately
    console.log('[APP_DEBUG] DOMContentLoaded event fired. Initializing app...');
    
    initializeApp();
    
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
 */
function initializeApp() {
    console.log('[APP_DEBUG] Inside initializeApp...');
    // Ensure managers are created only once
    if (!authManager) {
        authManager = new AuthManager(window.socket);
        console.log('[APP_DEBUG] AuthManager created.');
    }
    if (!chatManager) {
        // Pass authManager instance to ChatManager
        chatManager = new ChatManager(window.socket, authManager); 
        console.log('[APP_DEBUG] ChatManager created.');
    }
    // VideoCallManager initialization would go here if needed

    // Initialize AuthManager FIRST. It will handle checking the session 
    // and deciding whether to show login or proceed.
    console.log('[APP_DEBUG] Calling AuthManager.initialize...');
    authManager.initialize();
    console.log('[APP_DEBUG] AuthManager.initialize finished.');
    
    // ChatManager initialization is now TRIGGERED BY AuthManager
    // after successful login or session restoration. See event listener below.
    
    console.log('[APP_DEBUG] initializeApp finished.');
}

// Event listener for AuthManager to trigger ChatManager initialization
document.addEventListener('userLoggedIn', (event) => {
    console.log('[APP_DEBUG] userLoggedIn event received in app.js.');
    const user = event.detail.user;
    if (!user) {
        console.error('[APP_DEBUG] userLoggedIn event fired without user data!');
        return;
    }
    
    // If managers aren't initialized yet, make sure they are
    if (!authManager) {
        authManager = new AuthManager(window.socket);
    }
    
    if (!chatManager) {
        chatManager = new ChatManager(window.socket, authManager);
    }
    
    if (chatManager && !chatManager.isInitialized) {
        console.log('[APP_DEBUG] ChatManager not initialized, calling ChatManager.initialize...');
        chatManager.initialize(user); // Pass user info
    } else if (chatManager && chatManager.isInitialized) {
        console.warn('[APP_DEBUG] ChatManager already initialized when userLoggedIn event received.');
        // Update user info and reconnect socket
        chatManager.currentUser = user;
        chatManager.updateCurrentUserDisplay();
        
        // Force socket reconnection if needed
        if (window.socket && !window.socket.connected) {
            console.log('[APP_DEBUG] Forcing socket reconnection...');
            window.socket.connect();
        }
    }
});

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