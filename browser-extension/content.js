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
  // Create a script element to inject our code
  const scriptElement = document.createElement('script');
  
  // Set the source to a file instead of inline content
  scriptElement.src = chrome.runtime.getURL('socket-listener.js');
  
  // Append the script to the document
  (document.head || document.documentElement).appendChild(scriptElement);
  
  // Remove the script element after it's executed
  scriptElement.onload = function() {
    this.remove();
  };
  
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
