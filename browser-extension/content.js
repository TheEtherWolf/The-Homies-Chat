/**
 * Content script for The Homies Chat Notifications extension
 * Listens for messages in the application and forwards them to the background script
 */

// Create a connection to the background script
const port = chrome.runtime.connect({ name: "homies-chat-connection" });

// Flag to track if the user is logged in
let isLoggedIn = false;
let currentUser = null;
let socket = null;

// Function to check if the user is logged in
function checkLoginStatus() {
  // Look for elements that indicate the user is logged in
  const userDisplay = document.getElementById('current-user');
  if (userDisplay && userDisplay.textContent) {
    isLoggedIn = true;
    currentUser = {
      username: userDisplay.textContent.trim()
    };
    
    // Try to get the user ID if available
    const userIdElement = document.querySelector('.user-id');
    if (userIdElement) {
      currentUser.id = userIdElement.textContent.replace('@', '').trim();
    }
    
    // Send login status to background script
    port.postMessage({
      type: 'LOGIN_STATUS',
      data: {
        isLoggedIn: true,
        user: currentUser
      }
    });
    
    // Set up message listeners
    setupMessageListeners();
  } else {
    isLoggedIn = false;
    currentUser = null;
    
    // Send login status to background script
    port.postMessage({
      type: 'LOGIN_STATUS',
      data: {
        isLoggedIn: false
      }
    });
  }
}

// Function to set up message listeners
function setupMessageListeners() {
  // We need to intercept the socket.io messages
  // Since we can't directly access the socket.io instance from the content script,
  // we'll inject a script into the page to listen for messages
  
  const script = document.createElement('script');
  script.textContent = `
    // Wait for socket to be initialized
    const waitForSocket = setInterval(() => {
      if (window.socket) {
        clearInterval(waitForSocket);
        
        // Listen for incoming messages
        window.socket.on('message', (message) => {
          // Dispatch a custom event that our content script can listen for
          document.dispatchEvent(new CustomEvent('homies-chat-message', {
            detail: message
          }));
        });
        
        // Listen for friend requests
        window.socket.on('friend-request-received', (data) => {
          document.dispatchEvent(new CustomEvent('homies-chat-friend-request', {
            detail: data
          }));
        });
        
        // Listen for friend request accepted
        window.socket.on('friend-request-accepted', (data) => {
          document.dispatchEvent(new CustomEvent('homies-chat-friend-accepted', {
            detail: data
          }));
        });
        
        console.log('[HOMIES_EXTENSION] Socket message listeners set up');
      }
    }, 1000);
  `;
  
  // Inject the script
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  
  // Listen for the custom events from our injected script
  document.addEventListener('homies-chat-message', (event) => {
    const message = event.detail;
    
    // Don't notify for messages sent by the current user
    if (currentUser && message.senderId === currentUser.id) {
      return;
    }
    
    // Forward the message to the background script
    port.postMessage({
      type: 'NEW_MESSAGE',
      data: message
    });
  });
  
  document.addEventListener('homies-chat-friend-request', (event) => {
    const requestData = event.detail;
    
    // Forward the friend request to the background script
    port.postMessage({
      type: 'FRIEND_REQUEST',
      data: requestData
    });
  });
  
  document.addEventListener('homies-chat-friend-accepted', (event) => {
    const acceptData = event.detail;
    
    // Forward the friend request acceptance to the background script
    port.postMessage({
      type: 'FRIEND_ACCEPTED',
      data: acceptData
    });
  });
}

// Check login status when the page loads
window.addEventListener('load', () => {
  // Wait a moment for the app to initialize
  setTimeout(checkLoginStatus, 2000);
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CHECK_LOGIN_STATUS') {
    checkLoginStatus();
  }
});

// Periodically check login status
setInterval(checkLoginStatus, 60000); // Check every minute

console.log('[HOMIES_EXTENSION] Content script loaded');
