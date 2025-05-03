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
        this.needsInitialDataFetch = false; // Flag to fetch users/status on connect
        this.isSocketConnected = this.socket ? this.socket.connected : false; // Track connection state
        this.inGeneralChat = false; // Flag to track if we're in the general chat
        this.currentChannel = 'general'; // Default channel
        this.isDMMode = false; // Track if we're in DM mode or channels mode

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
            console.log('[CHAT_DEBUG] User status change:', data);
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
    
    // Display a single message
    _displayMessage(message, scrollToBottom = true) {
        if (!this.messagesContainer) return;
        
        // Check if message is deleted
        const isDeleted = message.is_deleted === true;
        
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = 'message';
        if (message.senderId === this.currentUser.id) {
            messageEl.classList.add('own-message');
        }
        messageEl.setAttribute('data-message-id', message.id || '');
        messageEl.setAttribute('data-sender-id', message.senderId || '');
        
        // Get sender info
        const sender = message.sender || 'Unknown User';
        const senderId = message.senderId || '';
        const isCurrentUser = senderId === this.currentUser.id;
        
        // Get avatar URL
        let avatarUrl = 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
        
        // If it's the current user, use their avatar
        if (isCurrentUser && this.currentUser.avatarUrl) {
            avatarUrl = this.currentUser.avatarUrl;
        } 
        // Otherwise check if we have this user's info in allUsers
        else if (senderId && this.allUsers[senderId] && this.allUsers[senderId].avatarUrl) {
            avatarUrl = this.allUsers[senderId].avatarUrl;
        }
        
        // Format timestamp
        const timestamp = message.timestamp ? new Date(message.timestamp) : new Date();
        const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Determine message content
        let messageContent = isDeleted 
            ? '<em class="deleted-message">[This message has been deleted]</em>' 
            : this._formatMessageContent(message.content);
        
        // Build message HTML
        messageEl.innerHTML = `
            <img src="${avatarUrl}" alt="${sender}" class="message-avatar">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${sender}</span>
                    <span class="message-timestamp">${timeString}</span>
                </div>
                <div class="message-text">${messageContent}</div>
            </div>
            ${isCurrentUser && !isDeleted ? '<div class="message-actions"><button class="message-actions-btn" title="Message Options"><i class="bi bi-three-dots-vertical"></i></button><div class="message-actions-menu"><div class="message-action-item danger" data-action="delete"><i class="bi bi-trash"></i>Delete Message</div></div></div>' : ''}
        `;
        
        // Add delete button event listener if it's the current user's message
        if (isCurrentUser && !isDeleted) {
            const actionBtn = messageEl.querySelector('.message-actions-btn');
            const actionMenu = messageEl.querySelector('.message-actions-menu');
            const deleteAction = messageEl.querySelector('.message-action-item[data-action="delete"]');
            
            if (actionBtn && actionMenu) {
                actionBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    actionMenu.classList.toggle('show');
                });
                
                // Close menu when clicking outside
                document.addEventListener('click', () => {
                    actionMenu.classList.remove('show');
                });
            }
            
            if (deleteAction) {
                deleteAction.addEventListener('click', () => {
                    this._deleteMessage(message.id);
                    actionMenu.classList.remove('show');
                });
            }
        }
        
        // Add to messages container
        this.messagesContainer.appendChild(messageEl);
        
        // Scroll to bottom if requested
        if (scrollToBottom) {
            this._scrollToBottom();
        }
    }
    
    // Delete a message
    _deleteMessage(messageId) {
        if (!messageId) return;
        
        console.log(`[CHAT_DEBUG] Deleting message: ${messageId}`);
        
        // Send delete request to server
        this.socket.emit('delete-message', { messageId }, (response) => {
            console.log('[CHAT_DEBUG] Delete message response:', response);
            
            if (!response.success) {
                console.error('[CHAT_DEBUG] Error deleting message:', response.message);
                alert('Failed to delete message: ' + response.message);
            }
        });
    }
    
    // Format message content (handle links, emojis, etc.)
    _formatMessageContent(content) {
        if (!content) return '';
        
        // Convert URLs to links
        content = content.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Return formatted content
        return content;
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
            
            // Update recent emojis
            this.updateRecentEmojis();
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
        
        // Update the UI
        this.updateRecentEmojis();
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
    
    // ... rest of the code remains the same ...
}
