/**
 * Chat module for The Homies App - Discord Style
 * Handles messaging, channels, server list, and UI updates
 */

// Use the global socket from app.js directly
console.log('[CHAT_DEBUG] Chat module initialized, using global socket connection');

class ChatManager {
    constructor(socket, authManager) {
        console.log('[CHAT_DEBUG] ChatManager constructor called.');
        this.socket = socket;
        this.authManager = authManager; // Keep reference if needed for user info
        
        // --- DOM Element References (Updated for Discord Layout) ---
        this.messagesContainer = document.getElementById('messages-container');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.dmListContainer = document.getElementById('dm-list');
        this.chatHeader = document.getElementById('chat-header');
        this.chatTitle = document.getElementById('chat-title');
        this.currentUserDisplay = document.getElementById('current-user');
        this.settingsButton = document.getElementById('settings-button');
        this.logoutButton = document.getElementById('logout-btn');
        this.mainContent = document.getElementById('main-content');
        this.sidebar = document.getElementById('sidebar');
        this.serverColumn = document.getElementById('server-column');
        this.emojiButton = document.getElementById('emoji-button');
        this.emojiPicker = document.querySelector('.emoji-picker');
        this.emojiButtons = document.querySelectorAll('.emoji-btn');
        this.attachFileButton = document.getElementById('attach-file-button');
        this.friendsList = []; // Deprecated
        this.friendships = {}; // Stores { 'otherUserId': { friendship details } }

        // --- State Variables ---
        this.currentDmRecipientId = null;
        this.dmConversations = {}; // Cache messages: { 'recipientUserId': [messages] }
        this.channelMessages = {}; // Cache messages for channels: { 'channelName': [messages] }
        this.generalChatMessages = []; // Initialize general chat message array
        this.allUsers = {}; // Store all fetched users: { 'userId': {username, id, status?, avatar_url?} }
        this.currentUser = null; // Store current user info { username, id }
        this.isInitialized = false;
        this.needsInitialDataFetch = true; // Flag to fetch users/status on connect
        this.isSocketConnected = this.socket ? this.socket.connected : false; // Track connection state
        this.inGeneralChat = false; // Flag to track if we're in the general chat
        this.currentChannel = 'general'; // Default channel
        this.isDMMode = false; // Track if we're in DM mode or channels mode
        this.isLoadingMoreMessages = false;
        this.hasMoreMessages = {}; // Track if more messages are available per channel
        this.oldestMessageTimestamp = {}; // Track oldest message timestamp per channel

        // Set up keep-alive mechanism to prevent Glitch from sleeping
        this.setupKeepAlive();
    }

    // Initialize the chat interface
    initialize() {
        console.log('[CHAT_DEBUG] Initializing chat interface');
        
        // Check if user is logged in via session storage
        const userData = sessionStorage.getItem('user');
        if (!userData) {
            console.log('[CHAT_DEBUG] No user data in session storage, redirecting to login');
            window.location.href = '/login.html';
            return;
        }
        
        try {
            // Parse user data
            this.currentUser = JSON.parse(userData);
            console.log('[CHAT_DEBUG] User data loaded from session storage:', this.currentUser);
            
            // Make sure we have the avatar URL
            if (!this.currentUser.avatarUrl) {
                console.log('[CHAT_DEBUG] No avatarUrl in user data, checking for avatar_url');
                if (this.currentUser.avatar_url) {
                    console.log('[CHAT_DEBUG] Found avatar_url in user data:', this.currentUser.avatar_url);
                    this.currentUser.avatarUrl = this.currentUser.avatar_url;
                } else {
                    console.log('[CHAT_DEBUG] No avatar_url in user data, checking session storage');
                    try {
                        const sessionData = JSON.parse(sessionStorage.getItem('user')) || {};
                        if (sessionData.avatarUrl) {
                            console.log('[CHAT_DEBUG] Found avatarUrl in session storage:', sessionData.avatarUrl);
                            this.currentUser.avatarUrl = sessionData.avatarUrl;
                        } else if (sessionData.avatar_url) {
                            console.log('[CHAT_DEBUG] Found avatar_url in session storage:', sessionData.avatar_url);
                            this.currentUser.avatarUrl = sessionData.avatar_url;
                        } else {
                            console.log('[CHAT_DEBUG] No avatar URL in session storage, using default');
                            this.currentUser.avatarUrl = 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
                        }
                    } catch (error) {
                        console.error('[CHAT_DEBUG] Error getting avatar URL from session storage:', error);
                        this.currentUser.avatarUrl = 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
                    }
                }
            }
            
            // Update UI with user info
            this._updateUserUI();
            
            // Setup socket listeners
            this._setupSocketListeners();
            
            // Setup UI event listeners
            this._setupUIEventListeners();
            
            // Load emoji data
            this.setupEmojiPicker();
            
            // Mark as initialized
            this.isInitialized = true;
            
            // Set flag for data fetch on connect
            this.needsInitialDataFetch = true;
            
            if (this.socket && this.socket.connected) {
                this.performInitialDataFetch();
            }
            
            console.log('[CHAT_DEBUG] Chat interface initialized');
        } catch (error) {
            console.error('[CHAT_DEBUG] Error initializing chat:', error);
            window.location.href = '/login.html';
        }
    }
    
    // Initialize chat manager with user data
    initialize(user) {
        console.log('[CHAT_DEBUG] ChatManager initialize called with user:', user);
        
        // Store current user
        this.currentUser = user;
        
        // Make sure we have the avatar URL
        if (!this.currentUser.avatarUrl) {
            console.log('[CHAT_DEBUG] No avatarUrl in user data, checking for avatar_url');
            if (this.currentUser.avatar_url) {
                console.log('[CHAT_DEBUG] Found avatar_url in user data:', this.currentUser.avatar_url);
                this.currentUser.avatarUrl = this.currentUser.avatar_url;
            } else {
                console.log('[CHAT_DEBUG] No avatar_url in user data, checking session storage');
                try {
                    const sessionData = JSON.parse(sessionStorage.getItem('user')) || {};
                    if (sessionData.avatarUrl) {
                        console.log('[CHAT_DEBUG] Found avatarUrl in session storage:', sessionData.avatarUrl);
                        this.currentUser.avatarUrl = sessionData.avatarUrl;
                    } else if (sessionData.avatar_url) {
                        console.log('[CHAT_DEBUG] Found avatar_url in session storage:', sessionData.avatar_url);
                        this.currentUser.avatarUrl = sessionData.avatar_url;
                    } else {
                        console.log('[CHAT_DEBUG] No avatar URL in session storage, using default');
                        this.currentUser.avatarUrl = 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
                    }
                } catch (error) {
                    console.error('[CHAT_DEBUG] Error getting avatar URL from session storage:', error);
                    this.currentUser.avatarUrl = 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
                }
            }
        }
        
        // Update UI with user info
        this._updateUserUI();
        
        // Setup socket listeners
        this._setupSocketListeners();
        
        // Setup UI event listeners
        this._setupUIEventListeners();
        
        // Load emoji data
        this.setupEmojiPicker();
        
        // Mark as initialized
        this.isInitialized = true;
        
        // Set flag for data fetch on connect
        this.needsInitialDataFetch = true;
        
        if (this.socket && this.socket.connected) {
            this.performInitialDataFetch();
        }
        
        console.log('[CHAT_DEBUG] Chat interface initialized');
    }
    
    // Update UI with user info
    _updateUserUI() {
        // Update current user display
        if (this.currentUserDisplay) {
            this.currentUserDisplay.textContent = this.currentUser.username;
        }
        
        // Update user avatar
        const userAvatar = document.querySelector('.user-avatar img');
        if (userAvatar && this.currentUser.avatarUrl) {
            userAvatar.src = this.currentUser.avatarUrl;
            console.log('[CHAT_DEBUG] Updated user avatar with URL:', this.currentUser.avatarUrl);
        }
    }

    // Update user avatar URL in session storage and UI
    updateUserAvatar(avatarUrl) {
        console.log('[CHAT_DEBUG] Updating user avatar URL:', avatarUrl);
        
        // Update in memory
        this.currentUser.avatarUrl = avatarUrl;
        this.currentUser.avatar_url = avatarUrl; // Include both formats for compatibility
        
        // Update in session storage
        try {
            const userData = JSON.parse(sessionStorage.getItem('user')) || {};
            userData.avatarUrl = avatarUrl;
            userData.avatar_url = avatarUrl; // Include both formats for compatibility
            sessionStorage.setItem('user', JSON.stringify(userData));
            console.log('[CHAT_DEBUG] Updated avatar URL in session storage');
        } catch (error) {
            console.error('[CHAT_DEBUG] Error updating avatar URL in session storage:', error);
        }
        
        // Update UI
        this._updateUserUI();
        
        // Update in allUsers object for message display
        if (this.currentUser.id && this.allUsers[this.currentUser.id]) {
            this.allUsers[this.currentUser.id].avatarUrl = avatarUrl;
            this.allUsers[this.currentUser.id].avatar_url = avatarUrl;
            console.log('[CHAT_DEBUG] Updated avatar URL in allUsers object');
        }
        
        // Update avatar in all previously sent messages
        this.updateAvatarInMessages(avatarUrl);
        
        // Notify the server about the avatar change so other users can see it
        if (window.socket) {
            window.socket.emit('avatar-updated', {
                userId: this.currentUser.id,
                avatarUrl: avatarUrl
            });
        }
    }
    
    // Update avatar in all messages from the current user
    updateAvatarInMessages(avatarUrl) {
        console.log('[CHAT_DEBUG] Updating avatar in all messages');
        
        // Find all message avatars from the current user
        const messageElements = document.querySelectorAll('.message-item');
        let updatedCount = 0;
        
        messageElements.forEach(messageEl => {
            // Check if this message is from the current user
            const senderId = messageEl.getAttribute('data-sender-id');
            if (senderId === this.currentUser.id) {
                const avatarImg = messageEl.querySelector('.message-avatar img');
                if (avatarImg) {
                    avatarImg.src = avatarUrl;
                    updatedCount++;
                }
            }
        });
        
        console.log(`[CHAT_DEBUG] Updated avatar in ${updatedCount} messages`);
    }
    
    // Setup UI event listeners
    _setupUIEventListeners() {
        console.log('[CHAT_DEBUG] Setting up UI event listeners');
        
        // Existing event listeners...
        
        // Settings button click handler
        document.getElementById('settings-button')?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] Settings button clicked');
            // Update the avatar preview in the settings modal
            const avatarPreview = document.getElementById('profile-picture-preview');
            if (avatarPreview && this.currentUser.avatarUrl) {
                avatarPreview.src = this.currentUser.avatarUrl;
            }
            
            // Show the settings modal
            const settingsModal = new bootstrap.Modal(document.getElementById('settings-modal'));
            settingsModal.show();
        });
        
        // Profile picture change button click handler
        document.getElementById('change-profile-picture-btn')?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] Change profile picture button clicked');
            // Trigger the file input click
            document.getElementById('profile-picture-input')?.click();
        });
        
        // Profile picture input change handler
        document.getElementById('profile-picture-input')?.addEventListener('change', async (event) => {
            console.log('[CHAT_DEBUG] Profile picture input changed');
            const file = event.target.files[0];
            if (!file) return;
            
            // Validate file type and size
            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                alert('Please select a valid image file (JPG, PNG, or GIF)');
                return;
            }
            
            if (file.size > 2 * 1024 * 1024) { // 2MB max
                alert('Image size should be less than 2MB');
                return;
            }
            
            // Show preview
            const avatarPreview = document.getElementById('profile-picture-preview');
            if (avatarPreview) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreview.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
            
            // Compress the image before upload
            const compressedImage = await this._compressImage(file);
            
            // Upload the image
            this._uploadProfilePicture(compressedImage);
        });
        
        // Save settings button click handler
        document.getElementById('save-settings')?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] Save settings button clicked');
            // Close the modal
            const settingsModal = bootstrap.Modal.getInstance(document.getElementById('settings-modal'));
            settingsModal.hide();
        });
        
        // Send message button click handler
        this.sendButton?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] Send message button clicked');
            this.sendMessage();
        });
        
        // Message input keypress handler
        this.messageInput?.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                console.log('[CHAT_DEBUG] Enter key pressed, sending message');
                event.preventDefault(); // Prevent the default behavior (adding a newline)
                this.sendMessage();
            }
        });
        
        // Scroll event listener for lazy loading
        this.messagesContainer?.addEventListener('scroll', () => {
            const scrollPosition = this.messagesContainer.scrollTop;
            const scrollHeight = this.messagesContainer.scrollHeight;
            const clientHeight = this.messagesContainer.clientHeight;
            
            if (scrollPosition <= 0 && !this.isLoadingMoreMessages && this.hasMoreMessages[this.currentChannel]) {
                this.loadMoreMessages();
            }
        });
    }
    
    // Compress image before upload
    async _compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // Create canvas for compression
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // Calculate new dimensions while maintaining aspect ratio
                    const maxDimension = 800;
                    if (width > height && width > maxDimension) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else if (height > maxDimension) {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Draw image on canvas
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Get compressed image as Data URL
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(compressedDataUrl);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
    
    // Upload profile picture to server
    async _uploadProfilePicture(imageData) {
        console.log('[CHAT_DEBUG] Uploading profile picture');
        
        try {
            // Prepare the request data
            const requestData = {
                userId: this.currentUser.id,
                username: this.currentUser.username,
                imageData: imageData
            };
            
            // Send the request to the server
            const response = await fetch('/api/upload-profile-picture', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('[CHAT_DEBUG] Profile picture uploaded successfully:', result);
                
                // Update the avatar URL in session storage and UI
                const avatarUrl = result.avatarUrl || result.avatar_url;
                this.updateUserAvatar(avatarUrl);
                
                // Show success message
                alert('Profile picture updated successfully!');
            } else {
                console.error('[CHAT_DEBUG] Error uploading profile picture:', result.message);
                alert('Failed to upload profile picture: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('[CHAT_DEBUG] Exception uploading profile picture:', error);
            alert('An error occurred while uploading your profile picture. Please try again.');
        }
    }
    
    // Setup socket listeners
    _setupSocketListeners() {
        console.log('[CHAT_DEBUG] Setting up socket listeners');
        
        // Handle connection events
        this.socket.on('connect', () => {
            console.log('[CHAT_DEBUG] Socket connected');
            this.isSocketConnected = true;
            
            // Perform initial data fetch if needed
            if (this.needsInitialDataFetch && this.currentUser) {
                this.performInitialDataFetch();
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('[CHAT_DEBUG] Socket disconnected');
            this.isSocketConnected = false;
        });
        
        // Handle active users updates
        this.socket.on('active-users', (users) => {
            console.log('[CHAT_DEBUG] Received active users:', users);
            // Update UI with active users
            this._updateActiveUsersList(users);
        });
        
        // Handle message history
        this.socket.on('message-history', (data) => {
            console.log(`[CHAT_DEBUG] Received message history for ${data.channel}:`, data.messages.length);
            
            // Store messages in cache
            this.channelMessages[data.channel] = data.messages;
            
            // If this is the current channel, display messages
            if (data.channel === this.currentChannel) {
                this._displayChannelMessages(data.channel);
            }
            
            // Update hasMoreMessages flag
            this.hasMoreMessages[data.channel] = data.hasMoreMessages;
            this.oldestMessageTimestamp[data.channel] = data.oldestMessageTimestamp;
        });
        
        // Handle incoming messages
        this.socket.on('message', (message) => {
            console.log('[CHAT_DEBUG] Received new message:', message);
            
            // Add message to appropriate channel cache
            const channel = message.channel || 'general';
            if (!this.channelMessages[channel]) {
                this.channelMessages[channel] = [];
            }
            this.channelMessages[channel].push(message);
            
            // If this is the current channel, display the message
            if (channel === this.currentChannel || 
                (this.currentChannel.startsWith('#') && channel === this.currentChannel.substring(1))) {
                this._displayMessage(message);
            }
            
            // Play notification sound if message is not from current user
            if (message.senderId !== this.currentUser.id) {
                this._playNotificationSound();
            }
        });
        
        // Handle friend requests
        this.socket.on('friend-request-received', (data) => {
            console.log('[CHAT_DEBUG] Received friend request:', data);
            // Show friend request notification
            this._showFriendRequestNotification(data);
        });
        
        // Handle friend request responses
        this.socket.on('friend-request-response', (data) => {
            console.log('[CHAT_DEBUG] Friend request response:', data);
            // Update UI based on response
            if (data.accepted) {
                this._addFriendToList(data.friendship);
            }
        });
        
        // Handle user status changes
        this.socket.on('user-status-change', (data) => {
            console.log(`[CHAT_DEBUG] User status change:", data`);
            // Update user status in UI
            this._updateUserStatus(data.username, data.status);
        });
        
        // Listen for avatar updates from other users
        this.socket.on('user-avatar-updated', (data) => {
            console.log(`[CHAT_DEBUG] User ${data.userId} updated their avatar to ${data.avatarUrl}`);
            
            // Update in allUsers object
            if (this.allUsers[data.userId]) {
                this.allUsers[data.userId].avatarUrl = data.avatarUrl;
                this.allUsers[data.userId].avatar_url = data.avatarUrl;
            }
            
            // Update avatar in all messages from this user
            const messageElements = document.querySelectorAll('.message-item');
            let updatedCount = 0;
            
            messageElements.forEach(messageEl => {
                const senderId = messageEl.getAttribute('data-sender-id');
                if (senderId === data.userId) {
                    const avatarImg = messageEl.querySelector('.message-avatar img');
                    if (avatarImg) {
                        avatarImg.src = data.avatarUrl;
                        updatedCount++;
                    }
                }
            });
            
            console.log(`[CHAT_DEBUG] Updated avatar in ${updatedCount} messages from user ${data.userId}`);
        });
    }
    
    // Send a message
    sendMessage() {
        if (!this.messageInput || !this.messageInput.value.trim()) {
            return;
        }
        
        const messageContent = this.messageInput.value.trim();
        
        // Ensure channel name is properly formatted for the server (without hashtag)
        const dataChannel = this.currentChannel.startsWith('#') ? this.currentChannel.substring(1) : this.currentChannel;
        
        console.log(`[CHAT_DEBUG] Sending message to ${dataChannel}: ${messageContent}`);
        
        // Prepare message data
        const messageData = {
            content: messageContent,
            channel: dataChannel,
            timestamp: new Date().toISOString()
        };
        
        // Clear input field immediately for better UX
        this.messageInput.value = '';
        this.messageInput.focus();
        
        // Send message via socket with callback
        this.socket.emit('send-message', messageData, (response) => {
            if (response && !response.success) {
                console.error('[CHAT_DEBUG] Error sending message:', response.message);
                // Only show alert for actual errors, not just DB storage issues
                if (response.message !== 'Database error') {
                    alert('Failed to send message: ' + response.message);
                }
            }
        });
    }
    
    // Display channel messages
    _displayChannelMessages(channel) {
        console.log(`[CHAT_DEBUG] Displaying messages for channel ${channel}`);
        
        // Ensure channel name has hashtag prefix for UI consistency
        const displayChannel = channel.startsWith('#') ? channel : `#${channel}`;
        const dataChannel = channel.startsWith('#') ? channel.substring(1) : channel;
        
        // Update chat header
        if (this.chatTitle) {
            this.chatTitle.textContent = displayChannel;
        }
        
        // Update message input placeholder
        if (this.messageInput) {
            this.messageInput.placeholder = `Message ${displayChannel}`;
        }
        
        // Clear messages container
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
            
            // Add channel header
            const dateHeader = document.createElement('div');
            dateHeader.className = 'date-separator';
            dateHeader.innerHTML = '<span>Today</span>';
            this.messagesContainer.appendChild(dateHeader);
            
            const welcomeMessage = document.createElement('div');
            welcomeMessage.className = 'system-message';
            welcomeMessage.textContent = `Welcome to the beginning of ${displayChannel}`;
            this.messagesContainer.appendChild(welcomeMessage);
            
            // Add loading indicator for lazy loading
            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'message-loading-indicator';
            loadingIndicator.className = 'message-loading d-none';
            loadingIndicator.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
            this.messagesContainer.appendChild(loadingIndicator);
            
            // Get messages for this channel
            const messages = this.channelMessages[dataChannel] || [];
            
            // Display messages
            messages.forEach(message => {
                this._displayMessage(message, false); // Don't scroll for bulk loading
            });
            
            // Scroll to bottom
            this._scrollToBottom();
        }
    }
    
    // Create message element without adding it to the DOM
    _createMessageElement(message) {
        // Create message container
        const messageElement = document.createElement('div');
        const isOwnMessage = message.senderId === this.currentUser?.id;
        
        // Set classes based on message type
        messageElement.className = `message ${isOwnMessage ? 'own-message' : ''}`;
        messageElement.setAttribute('data-message-id', message.id);
        
        // Create message content
        let messageHTML = '';
        
        // Add avatar
        messageHTML += `
            <div class="message-avatar">
                <img src="${this._getUserAvatar(message.senderId)}" alt="${message.sender}" class="avatar">
            </div>
        `;
        
        // Add message content container
        messageHTML += '<div class="message-content">';
        
        // Add message header
        messageHTML += `
            <div class="message-header">
                <span class="message-author">${message.sender}</span>
                <span class="message-timestamp">${this._formatTimestamp(message.timestamp)}</span>
                
                <div class="dropdown message-actions">
                    <button class="btn btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
                        <i class="bi bi-three-dots"></i>
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item message-delete" href="#">Delete</a></li>
                        <li><a class="dropdown-item message-copy" href="#">Copy Text</a></li>
                    </ul>
                </div>
            </div>
        `;
        
        // Add message body
        if (message.is_deleted) {
            messageHTML += '<div class="message-body deleted">[This message has been deleted]</div>';
        } else {
            messageHTML += `<div class="message-body">${this._formatMessageContent(message.content)}</div>`;
        }
        
        // Close message content container
        messageHTML += '</div>';
        
        // Set message HTML
        messageElement.innerHTML = messageHTML;
        
        // Add event listeners for message actions
        this._addMessageEventListeners(messageElement);
        
        return messageElement;
    }
    
    // Display a message in the chat
    _displayMessage(message, scrollToBottom = true) {
        if (!this.messagesContainer) return;
        
        // Create message element
        const messageElement = this._createMessageElement(message);
        
        // Add to DOM
        this.messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom if needed
        if (scrollToBottom) {
            this._scrollToBottom();
        }
    }
    
    // Format message content (convert URLs to links, etc.)
    _formatMessageContent(content) {
        if (!content) return '';
        
        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        content = content.replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
        
        // Convert newlines to <br>
        content = content.replace(/\n/g, '<br>');
        
        // Convert emoji shortcodes to actual emojis
        // This is a simple implementation - you might want to use a library for this
        const emojiMap = {
            ':)': '😊',
            ':D': '😃',
            ':(': '😞',
            ':P': '😛',
            ';)': '😉',
            '<3': '❤️'
        };
        
        Object.keys(emojiMap).forEach(code => {
            content = content.replace(new RegExp(code, 'g'), emojiMap[code]);
        });
        
        return content;
    }
    
    // Format timestamp
    _formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Get user avatar URL
    _getUserAvatar(userId) {
        // Default avatar
        let avatarUrl = 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
        
        // If it's the current user, use their avatar
        if (userId === this.currentUser?.id && this.currentUser?.avatarUrl) {
            avatarUrl = this.currentUser.avatarUrl;
        } 
        // Otherwise check if we have this user's info in allUsers
        else if (userId && this.allUsers[userId] && this.allUsers[userId].avatarUrl) {
            avatarUrl = this.allUsers[userId].avatarUrl;
        }
        
        return avatarUrl;
    }
    
    // Add event listeners to message element
    _addMessageEventListeners(messageElement) {
        // Get message ID
        const messageId = messageElement.getAttribute('data-message-id');
        if (!messageId) return;
        
        // Add delete button event listener
        const deleteButton = messageElement.querySelector('.message-delete');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.preventDefault();
                this._deleteMessage(messageId);
            });
        }
        
        // Add copy text button event listener
        const copyButton = messageElement.querySelector('.message-copy');
        if (copyButton) {
            copyButton.addEventListener('click', (e) => {
                e.preventDefault();
                const messageBody = messageElement.querySelector('.message-body');
                if (messageBody) {
                    // Copy text to clipboard
                    navigator.clipboard.writeText(messageBody.textContent)
                        .then(() => {
                            // Show toast or notification
                            console.log('[CHAT_DEBUG] Message copied to clipboard');
                        })
                        .catch(err => {
                            console.error('[CHAT_DEBUG] Failed to copy message:', err);
                        });
                }
            });
        }
    }
    
    // Delete message
    _deleteMessage(messageId) {
        console.log(`[CHAT_DEBUG] Deleting message with ID: ${messageId}`);
        
        // Emit delete message event
        this.socket.emit('delete-message', { messageId }, (response) => {
            if (response.success) {
                console.log('[CHAT_DEBUG] Message deleted successfully');
                
                // Update UI
                const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
                if (messageElement) {
                    const messageBody = messageElement.querySelector('.message-body');
                    if (messageBody) {
                        messageBody.innerHTML = '<em class="deleted-message">[This message has been deleted]</em>';
                        messageBody.classList.add('deleted');
                    }
                    
                    // Remove message actions
                    const messageActions = messageElement.querySelector('.message-actions');
                    if (messageActions) {
                        messageActions.remove();
                    }
                }
            } else {
                console.error('[CHAT_DEBUG] Failed to delete message:', response.error);
                alert('Failed to delete message: ' + response.error);
            }
        });
    }
    
    // Scroll messages container to bottom
    _scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
    
    // Play notification sound
    _playNotificationSound() {
        // Check if notification sounds are enabled
        const notificationSoundsEnabled = document.getElementById('notification-sounds')?.checked !== false;
        
        if (notificationSoundsEnabled) {
            // Create and play notification sound
            const audio = new Audio('https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/notification.mp3?v=1746110048911');
            audio.volume = 0.5;
            audio.play().catch(err => console.error('[CHAT_DEBUG] Error playing notification sound:', err));
        }
    }
    
    // Update active users list
    _updateActiveUsersList(users) {
        // Update UI with active users
        console.log('[CHAT_DEBUG] Updating active users list:', users);
    }
    
    // Show friend request notification
    _showFriendRequestNotification(data) {
        console.log('[CHAT_DEBUG] Showing friend request notification:', data);
        
        // Set friend request data
        document.getElementById('friend-request-username').textContent = data.senderUsername;
        
        // Store the friendship ID for accept/reject actions
        this.pendingFriendRequestId = data.friendshipId;
        
        // Show the modal
        const friendRequestModal = new bootstrap.Modal(document.getElementById('friend-request-modal'));
        friendRequestModal.show();
    }
    
    // Add friend to list
    _addFriendToList(friendship) {
        console.log('[CHAT_DEBUG] Adding friend to list:', friendship);
        
        // Update UI with new friend
    }
    
    // Update user status
    _updateUserStatus(username, status) {
        console.log(`[CHAT_DEBUG] Updating status for ${username} to ${status}`);
        
        // Update UI with user status
    }
    
    // Perform initial data fetch when socket is connected
    performInitialDataFetch() {
        console.log('[CHAT_DEBUG] Performing initial data fetch');
        
        if (!this.socket || !this.socket.connected) {
            console.error('[CHAT_DEBUG] Cannot fetch data: Socket not connected');
            return;
        }
        
        if (!this.currentUser || !this.currentUser.id) {
            console.error('[CHAT_DEBUG] Cannot fetch data: User not authenticated');
            return;
        }
        
        // Fetch active users
        this.socket.emit('get-active-users');
        
        // Fetch message history for current channel
        this.socket.emit('get-channel-messages', { channel: this.currentChannel });
        
        // Fetch friend list
        this.socket.emit('get-friends-list');
        
        // Fetch pending friend requests
        this.socket.emit('get-friend-requests');
        
        // Mark as fetched
        this.needsInitialDataFetch = false;
        
        console.log('[CHAT_DEBUG] Initial data fetch complete');
    }
    
    // Set up keep-alive mechanism to prevent Glitch from sleeping
    setupKeepAlive() {
        console.log('[CHAT_DEBUG] Setting up keep-alive mechanism');
        
        // Send a keep-alive signal to the server every 5 minutes
        this.keepAliveInterval = setInterval(() => {
            if (window.socket && window.socket.connected) {
                console.log('[CHAT_DEBUG] Sending keep-alive signal');
                window.socket.emit('keep-alive', { userId: this.currentUser?.id });
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
    
    // Setup emoji picker functionality
    setupEmojiPicker() {
        console.log('[CHAT_DEBUG] Setting up emoji picker');
        
        // Initialize emoji picker state
        this.emojiPickerVisible = false;
        
        // Setup emoji button click handler
        if (this.emojiButton) {
            this.emojiButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleEmojiPicker();
            });
        }
        
        // Setup emoji picker close button
        const closeButton = document.getElementById('emoji-picker-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideEmojiPicker();
            });
        }
        
        // Setup emoji category buttons
        const categoryButtons = document.querySelectorAll('.emoji-category');
        categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                const category = button.getAttribute('data-category');
                this.switchEmojiCategory(category);
            });
        });
        
        // Setup emoji selection
        const emojiButtons = document.querySelectorAll('.emoji-btn');
        emojiButtons.forEach(button => {
            button.addEventListener('click', () => {
                const emoji = button.textContent;
                this.insertEmoji(emoji);
                this.addToRecentEmojis(emoji);
            });
        });
        
        // Setup emoji search
        const searchInput = document.getElementById('emoji-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.searchEmojis(searchInput.value);
            });
        }
        
        console.log('[CHAT_DEBUG] Emoji picker setup complete');
    }
    
    // Toggle emoji picker visibility
    toggleEmojiPicker() {
        if (this.emojiPickerVisible) {
            this.hideEmojiPicker();
        } else {
            this.showEmojiPicker();
        }
    }
    
    // Show emoji picker
    showEmojiPicker() {
        if (this.emojiPicker) {
            // Load recent emojis only when opening the picker
            this.recentEmojis = JSON.parse(localStorage.getItem('recentEmojis') || '[]');
            
            // Position the picker
            const inputRect = this.messageInput.getBoundingClientRect();
            this.emojiPicker.style.bottom = `${window.innerHeight - inputRect.top + 10}px`;
            this.emojiPicker.style.left = `${inputRect.left}px`;
            
            // Show the picker
            this.emojiPicker.classList.remove('d-none');
            this.emojiPickerVisible = true;
            
            // Update recent emojis only if the recent category is active
            const activeCategory = document.querySelector('.emoji-category.active');
            if (activeCategory && activeCategory.getAttribute('data-category') === 'recent') {
                this.updateRecentEmojis();
            }
        }
    }
    
    // Hide emoji picker
    hideEmojiPicker() {
        if (this.emojiPicker) {
            this.emojiPicker.classList.add('d-none');
            this.emojiPickerVisible = false;
        }
    }
    
    // Switch emoji category
    switchEmojiCategory(category) {
        // Update active category button
        document.querySelectorAll('.emoji-category').forEach(button => {
            button.classList.remove('active');
            if (button.getAttribute('data-category') === category) {
                button.classList.add('active');
            }
        });
        
        // Show selected category content
        document.querySelectorAll('.emoji-category-content').forEach(content => {
            content.classList.remove('active');
            if (content.getAttribute('data-category') === category) {
                content.classList.add('active');
            }
        });
        
        // Only update recent emojis when switching to the recent category
        if (category === 'recent') {
            this.updateRecentEmojis();
        }
    }
    
    // Insert emoji into message input
    insertEmoji(emoji) {
        if (this.messageInput) {
            const cursorPos = this.messageInput.selectionStart;
            const text = this.messageInput.value;
            const newText = text.substring(0, cursorPos) + emoji + text.substring(cursorPos);
            this.messageInput.value = newText;
            this.messageInput.focus();
            this.messageInput.selectionStart = cursorPos + emoji.length;
            this.messageInput.selectionEnd = cursorPos + emoji.length;
        }
    }
    
    // Add emoji to recent emojis
    addToRecentEmojis(emoji) {
        // Remove emoji if it already exists in the list
        this.recentEmojis = this.recentEmojis.filter(e => e !== emoji);
        
        // Add emoji to the beginning of the list
        this.recentEmojis.unshift(emoji);
        
        // Limit to 20 recent emojis
        if (this.recentEmojis.length > 20) {
            this.recentEmojis = this.recentEmojis.slice(0, 20);
        }
        
        // Save to localStorage
        localStorage.setItem('recentEmojis', JSON.stringify(this.recentEmojis));
        
        // Only update the UI if the recent category is active
        const activeCategory = document.querySelector('.emoji-category.active');
        if (activeCategory && activeCategory.getAttribute('data-category') === 'recent') {
            this.updateRecentEmojis();
        }
    }
    
    // Update recent emojis in the UI
    updateRecentEmojis() {
        const recentContainer = document.querySelector('.emoji-category-content[data-category="recent"]');
        if (recentContainer) {
            // Clear container
            recentContainer.innerHTML = '';
            
            // Add recent emojis
            if (this.recentEmojis.length === 0) {
                const message = document.createElement('div');
                message.className = 'text-center p-3';
                message.textContent = 'No recent emojis';
                recentContainer.appendChild(message);
            } else {
                this.recentEmojis.forEach(emoji => {
                    const button = document.createElement('button');
                    button.className = 'emoji-btn';
                    button.textContent = emoji;
                    button.addEventListener('click', () => {
                        this.insertEmoji(emoji);
                        this.addToRecentEmojis(emoji);
                    });
                    recentContainer.appendChild(button);
                });
            }
        }
    }
    
    // Search emojis
    searchEmojis(query) {
        if (!query) {
            // If search is empty, show all emojis
            document.querySelectorAll('.emoji-btn').forEach(button => {
                button.style.display = '';
            });
            return;
        }
        
        // Convert query to lowercase for case-insensitive search
        query = query.toLowerCase();
        
        // Search through all emoji buttons
        document.querySelectorAll('.emoji-btn').forEach(button => {
            const emoji = button.textContent;
            // Simple search: if emoji contains query, show it
            if (emoji.includes(query)) {
                button.style.display = '';
            } else {
                button.style.display = 'none';
            }
        });
    }
    
    // Load more messages
    loadMoreMessages() {
        if (this.isLoadingMoreMessages) return;
        
        this.isLoadingMoreMessages = true;
        
        // Show loading indicator
        const loadingIndicator = document.getElementById('message-loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.classList.remove('d-none');
        }
        
        const channel = this.currentChannel;
        const oldestMessageTimestamp = this.oldestMessageTimestamp[channel];
        
        // Save current scroll position and height
        const scrollPosition = this.messagesContainer.scrollTop;
        const scrollHeight = this.messagesContainer.scrollHeight;
        
        this.socket.emit('get-channel-messages', { channel, oldestMessageTimestamp }, (response) => {
            console.log('[CHAT_DEBUG] Received more messages:', response);
            
            // Update hasMoreMessages flag
            this.hasMoreMessages[channel] = response.hasMoreMessages;
            this.oldestMessageTimestamp[channel] = response.oldestMessageTimestamp;
            
            // Add messages to cache
            const messages = response.messages;
            
            if (messages && messages.length > 0) {
                // Add messages to the beginning of the array
                this.channelMessages[channel] = [...messages, ...this.channelMessages[channel]];
                
                // Display messages at the top of the container
                const fragment = document.createDocumentFragment();
                messages.forEach(message => {
                    const messageElement = this._createMessageElement(message);
                    fragment.appendChild(messageElement);
                });
                
                // Insert messages at the beginning (after the loading indicator)
                if (loadingIndicator && loadingIndicator.nextSibling) {
                    this.messagesContainer.insertBefore(fragment, loadingIndicator.nextSibling);
                } else {
                    this.messagesContainer.prepend(fragment);
                }
                
                // Maintain scroll position
                const newScrollHeight = this.messagesContainer.scrollHeight;
                this.messagesContainer.scrollTop = scrollPosition + (newScrollHeight - scrollHeight);
            }
            
            // Hide loading indicator
            if (loadingIndicator) {
                loadingIndicator.classList.add('d-none');
            }
            
            this.isLoadingMoreMessages = false;
        });
    }
    
    // ... rest of the code remains the same ...
}
