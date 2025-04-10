/**
 * Main application initialization for The Homies App
 * Initializes all modules and sets up Socket.io
 */

// Socket.io connection - declare as window.socket to ensure global availability
window.socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    forceNew: true // Force a new connection every time to prevent duplicates
});

// Global variables for our managers
let authManager;
let chatManager;
let videoCallManager;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Clean up any existing socket connections to prevent duplicates
    if (window.previousSocket) {
        console.log('Cleaning up previous socket connection');
        window.previousSocket.disconnect();
    }
    
    // Store current socket for potential cleanup
    window.previousSocket = window.socket;
    
    // Initialize the app
    initializeApp();
    
    // Setup connection event handlers
    window.socket.on('connect', () => {
        console.log('Connected to server with socket ID:', window.socket.id);
    });
    
    window.socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
    
    window.socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

function initializeApp() {
    // Initialize managers
    authManager = new AuthManager();
    chatManager = new ChatManager();
    videoCallManager = new VideoCallManager();
    
    // Make videoCallManager globally accessible
    window.videoCallManager = videoCallManager;
    
    console.log('The Homies App initialized successfully');
}

// Helper function to format dates
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
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