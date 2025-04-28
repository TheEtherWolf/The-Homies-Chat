/**
 * Popup script for The Homies Chat Notifications extension
 * Handles the settings UI and saving preferences
 */

// DOM elements
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const enableNotifications = document.getElementById('enable-notifications');
const enableSound = document.getElementById('enable-sound');
const showContent = document.getElementById('show-content');
const friendRequests = document.getElementById('friend-requests');

// Load settings from storage
chrome.storage.local.get('notificationSettings', (result) => {
  if (result.notificationSettings) {
    enableNotifications.checked = result.notificationSettings.enabled;
    enableSound.checked = result.notificationSettings.sound;
    showContent.checked = result.notificationSettings.showMessageContent;
    friendRequests.checked = result.notificationSettings.showFriendRequests;
  }
});

// Check connection status
function updateConnectionStatus() {
  // Query for active tabs with The Homies Chat
  chrome.tabs.query({ 
    url: "*://*.glitch.me/*" 
  }, (tabs) => {
    if (tabs.length > 0) {
      // Get the background page to check login status
      chrome.runtime.getBackgroundPage((backgroundPage) => {
        if (backgroundPage && backgroundPage.userStatus) {
          const { isLoggedIn, user } = backgroundPage.userStatus;
          
          if (isLoggedIn) {
            statusContainer.className = 'status online';
            statusText.textContent = `Connected as ${user ? user.username : 'User'}`;
          } else {
            statusContainer.className = 'status offline';
            statusText.textContent = 'Not logged in to The Homies Chat';
          }
        } else {
          statusContainer.className = 'status offline';
          statusText.textContent = 'Extension status unavailable';
        }
      });
    } else {
      statusContainer.className = 'status offline';
      statusText.textContent = 'The Homies Chat is not open';
    }
  });
}

// Save settings when toggles are changed
function saveSettings() {
  const settings = {
    enabled: enableNotifications.checked,
    sound: enableSound.checked,
    showMessageContent: showContent.checked,
    showFriendRequests: friendRequests.checked
  };
  
  chrome.storage.local.set({ notificationSettings: settings }, () => {
    console.log('Settings saved');
    
    // Update the background page with new settings
    chrome.runtime.getBackgroundPage((backgroundPage) => {
      if (backgroundPage) {
        backgroundPage.notificationSettings = settings;
      }
    });
  });
}

// Add event listeners to settings toggles
enableNotifications.addEventListener('change', saveSettings);
enableSound.addEventListener('change', saveSettings);
showContent.addEventListener('change', saveSettings);
friendRequests.addEventListener('change', saveSettings);

// Update connection status when popup opens
document.addEventListener('DOMContentLoaded', updateConnectionStatus);

// Refresh status every few seconds while popup is open
const statusInterval = setInterval(updateConnectionStatus, 5000);

// Clean up interval when popup closes
window.addEventListener('unload', () => {
  clearInterval(statusInterval);
});
