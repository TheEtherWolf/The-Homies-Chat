/**
 * Background script for The Homies Chat Notifications extension
 * Handles receiving messages from the content script and showing notifications
 */

// Store user login status
let userStatus = {
  isLoggedIn: false,
  user: null
};

// Store notification settings
let notificationSettings = {
  enabled: true,
  sound: true,
  showMessageContent: true,
  showFriendRequests: true
};

// Load notification settings from storage
chrome.storage.local.get('notificationSettings', (result) => {
  if (result.notificationSettings) {
    notificationSettings = result.notificationSettings;
  } else {
    // Save default settings
    chrome.storage.local.set({ notificationSettings });
  }
});

// Listen for connections from the content script
chrome.runtime.onConnect.addListener((port) => {
  console.log('Content script connected');
  
  if (port.name === 'homies-chat-connection') {
    port.onMessage.addListener((message) => {
      console.log('Received message from content script:', message);
      
      switch (message.type) {
        case 'LOGIN_STATUS':
          handleLoginStatus(message.data);
          break;
        case 'NEW_MESSAGE':
          handleNewMessage(message.data);
          break;
        case 'FRIEND_REQUEST':
          handleFriendRequest(message.data);
          break;
        case 'FRIEND_ACCEPTED':
          handleFriendAccepted(message.data);
          break;
      }
    });
  }
});

// Handle login status updates
function handleLoginStatus(data) {
  userStatus = data;
  
  // Update the extension icon based on login status
  if (data.isLoggedIn) {
    chrome.action.setIcon({
      path: 'original-logo.png'
    });
  } else {
    chrome.action.setIcon({
      path: 'original-logo.png'
    });
  }
}

// Handle new messages
function handleNewMessage(message) {
  if (!notificationSettings.enabled || !userStatus.isLoggedIn) {
    return;
  }
  
  // Determine notification content
  let title = 'New Message';
  let content = 'You have a new message';
  
  if (message.sender) {
    title = `Message from ${message.sender}`;
  }
  
  if (notificationSettings.showMessageContent && message.content) {
    content = message.content;
  }
  
  // Determine channel context
  let contextText = '';
  if (message.channel) {
    if (message.channel.startsWith('dm_')) {
      contextText = 'Direct Message';
    } else {
      // Format channel name
      const channelName = message.channel.startsWith('#') ? 
        message.channel : 
        `#${message.channel}`;
      contextText = `in ${channelName}`;
    }
  }
  
  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'original-logo.png',
    title: title,
    message: content,
    contextMessage: contextText,
    priority: 2,
    silent: !notificationSettings.sound
  });
}

// Handle friend requests
function handleFriendRequest(data) {
  if (!notificationSettings.enabled || !notificationSettings.showFriendRequests || !userStatus.isLoggedIn) {
    return;
  }
  
  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'original-logo.png',
    title: 'New Friend Request',
    message: `${data.senderUsername || 'Someone'} sent you a friend request`,
    priority: 2,
    silent: !notificationSettings.sound
  });
}

// Handle friend request accepted
function handleFriendAccepted(data) {
  if (!notificationSettings.enabled || !userStatus.isLoggedIn) {
    return;
  }
  
  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'original-logo.png',
    title: 'Friend Request Accepted',
    message: `${data.username || 'Someone'} accepted your friend request`,
    priority: 2,
    silent: !notificationSettings.sound
  });
}

// Set up alarm to periodically check login status
chrome.alarms.create('checkLoginStatus', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkLoginStatus') {
    // Send message to content script to check login status
    chrome.tabs.query({ 
      url: [
        '*://*.glitch.me/*',
        'https://knotty-moored-spaghetti.glitch.me/*'
      ] 
    }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'CHECK_LOGIN_STATUS' });
      });
    });
  }
});

console.log('Background script loaded');
