/**
 * Socket Listener Script for The Homies Chat Notifications extension
 * This script is injected into the page to listen for socket.io events
 */

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
