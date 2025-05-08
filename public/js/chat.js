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
        this.currentChannel = { id: 'general', name: 'general' }; // Default channel as object
        this.isDMMode = false; // Track if we're in DM mode or channels mode
        
        // Lazy loading state
        this.isLoadingMoreMessages = false;
        this.hasMoreMessagesToLoad = true;
        this.oldestMessageTimestamp = null;
        this.messagesPerPage = 20;

        // Create loading indicator element
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.className = 'loading-indicator d-none';
        this.loadingIndicator.innerHTML = '<div class="spinner"></div><span>Loading messages...</span>';
        if (this.messagesContainer) {
            this.messagesContainer.appendChild(this.loadingIndicator);
        }

        // Notification sound for new messages
        this.messageSound = new Audio('https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/Send%20message.mp3?v=1746554175125');
        
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
    
    // Get user by ID
    _getUserById(userId) {
        if (!userId || !this.allUsers) return null;
        
        // Check if we have the user in our local cache
        for (const user of Object.values(this.allUsers)) {
            if (user.id === userId) {
                return user;
            }
        }
        
        // Return a default user object if not found
        return {
            id: userId,
            username: 'Unknown User'
        };
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
            
            // Perform initial data fetch immediately on connection
            // Use a retry mechanism to ensure user authentication is complete
            let retryCount = 0;
            const maxRetries = 5;
            const retryInterval = 500; // ms
            
            const attemptDataFetch = () => {
                if (this.currentUser && this.currentUser.id) {
                    console.log('[CHAT_DEBUG] User authenticated, fetching initial data');
                    this.performInitialDataFetch();
                } else if (retryCount < maxRetries) {
                    console.log(`[CHAT_DEBUG] User not authenticated yet, retry ${retryCount + 1}/${maxRetries}`);
                    retryCount++;
                    setTimeout(attemptDataFetch, retryInterval);
                } else {
                    console.error('[CHAT_DEBUG] Failed to authenticate user after multiple attempts');
                }
            };
            
            // Start the retry process
            attemptDataFetch();
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
            
            // Sort messages by timestamp (newest messages come last)
            if (this.channelMessages[data.channel] && this.channelMessages[data.channel].length > 0) {
                this.channelMessages[data.channel].sort((a, b) => {
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
                
                // Set oldest message timestamp for lazy loading
                this.oldestMessageTimestamp = this.channelMessages[data.channel][0].timestamp;
                this.hasMoreMessagesToLoad = true;
                console.log(`[CHAT_DEBUG] Set oldest message timestamp to ${this.oldestMessageTimestamp}`);
            }
            
            // If this is the current channel, display messages
            // Check for both exact match and with/without hashtag prefix
            const currentChannelId = this.currentChannel.id;
            const dataChannelId = data.channel;
            
            if (dataChannelId === currentChannelId || 
                (currentChannelId.startsWith('#') && dataChannelId === currentChannelId.substring(1)) ||
                (!currentChannelId.startsWith('#') && `#${dataChannelId}` === currentChannelId)) {
                console.log(`[CHAT_DEBUG] Displaying messages for channel ${data.channel}`);
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
            if (channel === this.currentChannel.id || 
                (this.currentChannel.id.startsWith('#') && channel === this.currentChannel.id.substring(1))) {
                this._displayMessage(message);
            }
        });
        
        // Handle message deletion
        this.socket.on('message-deleted', (data) => {
            console.log('[CHAT_DEBUG] Message deleted:', data);
            
            const { messageId, channelId } = data;
            
            // Only handle if it's for the current channel
            if (this.currentChannel && channelId === this.currentChannel.id) {
                const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
                
                if (messageElement) {
                    // Add deleting animation
                    messageElement.classList.add('deleting');
                    
                    // Remove from DOM after animation completes
                    setTimeout(() => {
                        if (messageElement.parentNode) {
                            messageElement.parentNode.removeChild(messageElement);
                        }
                    }, 500); // Match the animation duration
                    
                    // Show toast notification if it wasn't deleted by current user
                    const senderId = messageElement.getAttribute('data-sender-id');
                    if (senderId !== this.currentUser.id) {
                        this._showToast('A message was deleted', 'info', 'bi bi-trash');
                    }
                }
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
        
        // Add new avatar update event listener
        this.socket.on('avatar:updated', ({ userId, newAvatarUrl }) => {
            console.log(`[CHAT_DEBUG] Received avatar update for user ${userId}: ${newAvatarUrl}`);
            if (this.allUsers[userId]) {
                this.allUsers[userId].avatarUrl = newAvatarUrl;
                
                // Update all visible messages from this user
                this._updateAvatarInExistingMessages(userId, newAvatarUrl);
            }
        });
    }
    
    // Send a message
    sendMessage() {
        if (!this.messageInput || !this.messageInput.value.trim()) {
            return;
        }
        
        const messageContent = this.messageInput.value.trim();
        
        // Ensure channel name is properly formatted for the server (without hashtag)
        const dataChannel = this.currentChannel.id.startsWith('#') ? this.currentChannel.id.substring(1) : this.currentChannel.id;
        
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
        
        // Play sound effect when sending a message
        this._playNotificationSound();
        
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
            
            // Re-add loading indicator
            this.messagesContainer.appendChild(this.loadingIndicator);
            
            // Add welcome message
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.innerHTML = `
                <h3>Welcome to #${this.currentChannel.name}</h3>
                <p>This is the start of the #${this.currentChannel.name} channel</p>
            `;
            this.messagesContainer.appendChild(welcomeDiv);
            
            // If no messages, return
            if (!this.channelMessages[dataChannel] || this.channelMessages[dataChannel].length === 0) {
                console.log('[CHAT_DEBUG] No messages to display');
                return;
            }
            
            // Sort messages by timestamp
            const sortedMessages = [...this.channelMessages[dataChannel]].sort((a, b) => {
                const timestampA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timestampB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timestampA - timestampB;
            });
            
            console.log(`[CHAT_DEBUG] Displaying ${sortedMessages.length} messages for channel ${dataChannel}`);
            
            // Display messages
            sortedMessages.forEach(message => {
                this._displayMessage(message, false); // Don't scroll for each message
            });
            
            // Scroll to bottom after all messages are displayed
            this._scrollToBottom();
            
            // Reset loading state
            this.isLoadingMoreMessages = false;
            if (this.loadingIndicator) {
                this.loadingIndicator.classList.add('d-none');
            }
        }
    }
    
    // Setup scroll listener for lazy loading
    _setupScrollListener() {
        if (this.messagesContainer) {
            // Remove any existing scroll listener
            if (this._boundHandleScroll) {
                this.messagesContainer.removeEventListener('scroll', this._boundHandleScroll);
            }
            
            // Add scroll listener
            this._boundHandleScroll = this._handleScroll.bind(this);
            this.messagesContainer.addEventListener('scroll', this._boundHandleScroll);
            console.log('[CHAT_DEBUG] Scroll listener set up for lazy loading');
        }
    }
    
    // Handle scroll event for lazy loading
    _handleScroll() {
        if (!this.messagesContainer || this.isLoadingMoreMessages || !this.hasMoreMessagesToLoad) {
            return;
        }
        
        // Check if user has scrolled near the top
        const scrollTop = this.messagesContainer.scrollTop;
        const scrollThreshold = 50; // px from top - lower threshold for more responsive loading
        
        if (scrollTop < scrollThreshold) {
            console.log(`[CHAT_DEBUG] Scroll threshold reached (${scrollTop}px), loading more messages...`);
            this._loadMoreMessages();
        }
    }
    
    // Load more messages (lazy loading)
    _loadMoreMessages() {
        if (this.isLoadingMoreMessages || !this.hasMoreMessagesToLoad) {
            console.log('[CHAT_DEBUG] Cannot load more messages:', 
                this.isLoadingMoreMessages ? 'Already loading' : 
                !this.hasMoreMessagesToLoad ? 'No more messages' : 
                'No oldest timestamp');
            return;
        }
        
        // Get the channel name without hashtag for data operations
        const dataChannel = this.currentChannel.id.startsWith('#') ? 
            this.currentChannel.id.substring(1) : this.currentChannel.id;
            
        // If we don't have an oldest timestamp yet, get it from the first message
        if (!this.oldestMessageTimestamp && this.channelMessages[dataChannel] && this.channelMessages[dataChannel].length > 0) {
            const sortedMessages = [...this.channelMessages[dataChannel]].sort((a, b) => {
                return new Date(a.timestamp) - new Date(b.timestamp);
            });
            this.oldestMessageTimestamp = sortedMessages[0].timestamp;
        }
        
        // If we still don't have an oldest timestamp, we can't load more
        if (!this.oldestMessageTimestamp) {
            console.log('[CHAT_DEBUG] No oldest timestamp available, cannot load more messages');
            return;
        }
        
        console.log('[CHAT_DEBUG] Loading more messages before', this.oldestMessageTimestamp);
        this.isLoadingMoreMessages = true;
        
        // Show loading indicator at the top of the messages container
        if (this.loadingIndicator) {
            this.loadingIndicator.classList.remove('d-none');
            // Move loading indicator to the top of the container
            if (this.messagesContainer.firstChild) {
                this.messagesContainer.insertBefore(this.loadingIndicator, this.messagesContainer.firstChild);
            } else {
                this.messagesContainer.appendChild(this.loadingIndicator);
            }
        }
        
        // Remember scroll position and height
        const scrollHeight = this.messagesContainer.scrollHeight;
        const scrollPosition = this.messagesContainer.scrollTop;
        
        // Request more messages from server
        this.socket.emit('get-more-messages', {
            channel: dataChannel,
            before: this.oldestMessageTimestamp,
            limit: 20 // Request 20 messages at a time
        }, (response) => {
            // Hide loading indicator
            if (this.loadingIndicator) {
                this.loadingIndicator.classList.add('d-none');
            }
            
            console.log('[CHAT_DEBUG] Got response for older messages:', response);
            
            if (response && response.success && response.messages && response.messages.length > 0) {
                console.log(`[CHAT_DEBUG] Received ${response.messages.length} more messages`);
                
                // Add messages to cache
                if (!this.channelMessages[dataChannel]) {
                    this.channelMessages[dataChannel] = [];
                }
                
                // Add new messages to the beginning of the array
                this.channelMessages[dataChannel] = [
                    ...response.messages,
                    ...this.channelMessages[dataChannel]
                ];
                
                // Sort messages by timestamp
                const sortedMessages = [...response.messages].sort((a, b) => {
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
                
                // Update oldest message timestamp
                if (sortedMessages.length > 0) {
                    this.oldestMessageTimestamp = sortedMessages[0].timestamp;
                    console.log(`[CHAT_DEBUG] Updated oldest message timestamp to ${this.oldestMessageTimestamp}`);
                }
                
                // Prepend messages to the container
                this._prependMessages(sortedMessages);
                
                // Maintain scroll position
                setTimeout(() => {
                    const newScrollHeight = this.messagesContainer.scrollHeight;
                    const heightDifference = newScrollHeight - scrollHeight;
                    this.messagesContainer.scrollTop = scrollPosition + heightDifference;
                    console.log('[CHAT_DEBUG] Adjusted scroll position after loading more messages');
                }, 50);
                
                // If we got fewer messages than requested, there are no more to load
                if (response.messages.length < 20) {
                    console.log('[CHAT_DEBUG] Received fewer messages than requested, no more to load');
                    this.hasMoreMessagesToLoad = false;
                }
            } else {
                console.log('[CHAT_DEBUG] No more messages to load or error in response');
                this.hasMoreMessagesToLoad = false;
            }
            
            this.isLoadingMoreMessages = false;
        });
    }
    
    // Prepend messages to the container
    _prependMessages(messages) {
        if (!messages || !messages.length || !this.messagesContainer) return;
        
        // Create a document fragment to minimize DOM operations
        const fragment = document.createDocumentFragment();
        
        // Display each message
        messages.forEach(message => {
            const messageEl = this._createMessageElement(message);
            if (messageEl) {
                fragment.appendChild(messageEl);
            }
        });
        
        // Prepend to messages container
        if (this.messagesContainer.firstChild) {
            this.messagesContainer.insertBefore(fragment, this.messagesContainer.firstChild);
        } else {
            this.messagesContainer.appendChild(fragment);
        }
    }
    
    // Create a message element for display
    _createMessageElement(message) {
        if (!message) return null;
        
        // Check if message is deleted
        const isDeleted = message.is_deleted === true;
        
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = 'message';
        
        // Fix for message alignment: Use senderId to determine message ownership
        const senderId = message.senderId || '';
        const isCurrentUser = senderId === this.currentUser.id;
        
        // Add own-message class for user's own messages
        if (isCurrentUser) {
            messageEl.classList.add('own-message');
        }
        
        messageEl.setAttribute('data-message-id', message.id || '');
        messageEl.setAttribute('data-sender-id', senderId);
        
        // Get sender info
        const sender = message.sender || 'Unknown User';
        
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
        const timestamp = message.timestamp ? this._formatTimestamp(message.timestamp) : '';
        
        // Determine message content
        let messageContent = isDeleted 
            ? '<em class="deleted-message">[This message has been deleted]</em>' 
            : this._formatMessageContent(message.content);
        
        // Create message HTML with refined layout
        // For current user: messages on the left with right-facing bubbles, avatar and timestamp on the left
        // For other users: messages on the right with left-facing bubbles, avatar and timestamp on the right
        messageEl.innerHTML = `
            <div class="message-row">
                <div class="message-actions">
                    <button class="message-action-button">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <div class="message-action-dropdown">
                        ${isCurrentUser ? `
                            <button class="message-action-item delete-message">Delete</button>
                        ` : ''}
                        <button class="message-action-item copy-message">Copy</button>
                    </div>
                </div>
                <div class="message-container ${isCurrentUser ? 'own-container' : 'other-container'}">
                    ${isCurrentUser ? 
                      `<div class="avatar-timestamp-wrapper">
                        <img src="${avatarUrl}" alt="${sender}" class="message-avatar" data-user-id="${senderId}">
                        <div class="user-info">
                          <span class="message-author">${sender}</span>
                          <span class="message-timestamp">${timestamp}</span>
                        </div>
                      </div>` : ''}
                    <div class="message-content-wrapper ${isCurrentUser ? 'own-content' : ''}">
                        <div class="message-content">
                            <div class="message-text ${isCurrentUser ? 'own-text' : 'other-text'}">${messageContent}</div>
                        </div>
                    </div>
                    ${!isCurrentUser ? 
                      `<div class="avatar-timestamp-wrapper">
                        <div class="user-info">
                          <span class="message-author">${sender}</span>
                          <span class="message-timestamp">${timestamp}</span>
                        </div>
                        <img src="${avatarUrl}" alt="${sender}" class="message-avatar" data-user-id="${senderId}">
                      </div>` : ''}
                </div>
            </div>
        `;
        
        // Add event listeners for message actions
        const actionButtons = messageEl.querySelectorAll('.message-action-button');
        actionButtons.forEach(actionButton => {
            const actionDropdown = actionButton.nextElementSibling;
            
            if (actionButton && actionDropdown) {
                actionButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    // Close any other open dropdowns
                    document.querySelectorAll('.message-action-dropdown.show').forEach(dropdown => {
                        if (dropdown !== actionDropdown) {
                            dropdown.classList.remove('show');
                        }
                    });
                    
                    // Toggle this dropdown
                    actionDropdown.classList.toggle('show');
                });
            }
        });
        
        // Add delete button listener
        if (isCurrentUser) {
            const deleteButton = messageEl.querySelector('.delete-message');
            if (deleteButton) {
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._deleteMessage(message.id, messageEl);
                    messageEl.querySelector('.message-action-dropdown').classList.remove('show');
                });
            }
        }
        
        // Add copy button listener
        const copyButtons = messageEl.querySelectorAll('.copy-message');
        copyButtons.forEach(copyButton => {
            copyButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this._copyMessageContent(message.content);
                e.target.closest('.message-action-dropdown').classList.remove('show');
                
                // Show toast notification
                this._showToast('Message copied to clipboard', 'success', 'bi bi-clipboard-check');
            });
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!messageEl.contains(e.target)) {
                const dropdown = messageEl.querySelector('.message-action-dropdown.show');
                if (dropdown) {
                    dropdown.classList.remove('show');
                }
            }
        });
        
        return messageEl;
    }
    
    // Display a single message
    _displayMessage(message, scrollToBottom = true) {
        if (!this.messagesContainer) return;
        
        // Create message element
        const messageEl = this._createMessageElement(message);
        if (!messageEl) return;
        
        // Add to messages container
        this.messagesContainer.appendChild(messageEl);
        
        // Scroll to bottom if needed
        if (scrollToBottom) {
            this._scrollToBottom();
        }
    }
    
    // Delete a message
    _deleteMessage(messageId, messageElement) {
        if (!messageId) return;
        
        console.log('[CHAT_DEBUG] Deleting message:', messageId);
        
        // Send delete request to server
        this.socket.emit('delete-message', {
            messageId: messageId,
            channel: this.currentChannel.id
        }, (response) => {
            if (response && response.success) {
                console.log('[CHAT_DEBUG] Message deleted successfully');
                
                // Add deleting animation to the message element
                if (messageElement) {
                    messageElement.classList.add('deleting');
                    
                    // Remove from DOM after animation completes
                    setTimeout(() => {
                        if (messageElement.parentNode) {
                            messageElement.parentNode.removeChild(messageElement);
                        }
                    }, 500); // Match the animation duration
                    
                    // Show success toast
                    this._showToast('Message deleted', 'success', 'bi bi-trash');
                }
            } else {
                console.error('[CHAT_DEBUG] Failed to delete message:', response ? response.message : 'Unknown error');
                
                // Show error toast
                this._showToast('Failed to delete message', 'error', 'bi bi-exclamation-circle');
            }
        });
    }
    
    // Copy message content to clipboard
    _copyMessageContent(content) {
        if (!content) return;
        
        try {
            navigator.clipboard.writeText(content).then(() => {
                // Show toast notification
                this._showToast('Message copied to clipboard', 'success', 'bi bi-clipboard-check');
            }).catch(err => {
                console.error('[CHAT_DEBUG] Error copying to clipboard:', err);
                // Fallback method
                const textarea = document.createElement('textarea');
                textarea.value = content;
                textarea.style.position = 'fixed';
                textarea.style.opacity = 0;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                
                // Show toast notification for fallback method
                this._showToast('Message copied to clipboard', 'success', 'bi bi-clipboard-check');
            });
        } catch (err) {
            console.error('[CHAT_DEBUG] Exception copying to clipboard:', err);
        }
    }
    
    // Show toast notification
    _showToast(message, type = 'info', icon = 'bi bi-info-circle') {
        // Remove any existing toast
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `
            <i class="${icon} toast-notification-icon"></i>
            <div class="toast-notification-content">${message}</div>
        `;
        
        // Add to body
        document.body.appendChild(toast);
        
        // Show with animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Auto hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300); // Wait for fade out animation to complete
        }, 3000);
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
    
    // Format timestamp for display
    _formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        try {
            const date = new Date(timestamp);
            
            // Check if date is valid
            if (isNaN(date.getTime())) return '';
            
            // Format time as HH:MM AM/PM
            const hours = date.getHours();
            const minutes = date.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = hours % 12 || 12; // Convert 0 to 12 for 12 AM
            const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
            
            // Get today and yesterday dates for comparison
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            // Format date part based on how recent it is
            let dateStr = '';
            if (date.toDateString() === today.toDateString()) {
                dateStr = 'Today';
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateStr = 'Yesterday';
            } else {
                // Format as MM/DD/YYYY for older dates
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const year = date.getFullYear();
                dateStr = `${month}/${day}/${year}`;
            }
            
            return `${dateStr} at ${formattedHours}:${formattedMinutes} ${ampm}`;
        } catch (err) {
            console.error('Error formatting timestamp:', err);
            return '';
        }
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
            this.messageSound.play().catch(err => console.error('[CHAT_DEBUG] Error playing notification sound:', err));
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
        
        // Show loading indicator
        if (this.loadingIndicator) {
            this.loadingIndicator.classList.remove('d-none');
        }
        
        // Fetch active users
        this.socket.emit('get-active-users');
        
        // Fetch message history for current channel
        // Make sure channel name is properly formatted for the server (without hashtag)
        const dataChannel = this.currentChannel.id.startsWith('#') ? 
            this.currentChannel.id.substring(1) : this.currentChannel.id;
            
        console.log(`[CHAT_DEBUG] Requesting message history for channel: ${dataChannel}`);
        
        // Request message history with a callback to ensure we get a response
        this.socket.emit('get-channel-messages', { channel: dataChannel }, (response) => {
            console.log(`[CHAT_DEBUG] Received message history response:`, response);
            
            // If we didn't get a response or messages, try to fetch from Supabase directly
            if (!response || !response.success || !response.messages || response.messages.length === 0) {
                console.log('[CHAT_DEBUG] No messages received from socket, trying Supabase directly');
                
                // Emit a special event to force Supabase fetch
                this.socket.emit('force-fetch-messages', { channel: dataChannel }, (supabaseResponse) => {
                    console.log('[CHAT_DEBUG] Forced Supabase fetch response:', supabaseResponse);
                    
                    // Hide loading indicator
                    if (this.loadingIndicator) {
                        this.loadingIndicator.classList.add('d-none');
                    }
                });
            } else {
                // Hide loading indicator
                if (this.loadingIndicator) {
                    this.loadingIndicator.classList.add('d-none');
                }
            }
        });
        
        // Fetch friend list
        this.socket.emit('get-friends-list');
        
        // Fetch pending friend requests
        this.socket.emit('get-friend-requests');
        
        // Mark as fetched
        this.needsInitialDataFetch = false;
        
        console.log('[CHAT_DEBUG] Initial data fetch requests sent');
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
    
    // Switch to a channel
    switchToChannel(channel) {
        console.log(`[CHAT_DEBUG] Switching to channel: ${channel}`);
        
        // Reset DM mode
        this.isDMMode = false;
        this.currentDmRecipientId = null;
        
        // Ensure channel name has hashtag prefix for UI consistency
        const displayChannel = channel.startsWith('#') ? channel : `#${channel}`;
        const dataChannel = channel.startsWith('#') ? channel.substring(1) : channel;
        
        // Update current channel
        this.currentChannel = { 
            id: dataChannel,
            name: dataChannel
        };
        
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
            
            // Re-add loading indicator
            this.messagesContainer.appendChild(this.loadingIndicator);
            
            // Add welcome message
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.innerHTML = `
                <h3>Welcome to #${this.currentChannel.name}</h3>
                <p>This is the start of the #${this.currentChannel.name} channel</p>
            `;
            this.messagesContainer.appendChild(welcomeDiv);
            
            // If no messages, return
            if (!this.channelMessages[dataChannel] || this.channelMessages[dataChannel].length === 0) {
                console.log('[CHAT_DEBUG] No messages to display');
                return;
            }
            
            // Sort messages by timestamp
            const sortedMessages = [...this.channelMessages[dataChannel]].sort((a, b) => {
                const timestampA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timestampB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timestampA - timestampB;
            });
            
            // Display messages
            sortedMessages.forEach(message => {
                this._displayMessage(message);
            });
            
            // Scroll to bottom
            this._scrollToBottom();
            
            // Reset loading state
            this.isLoadingMoreMessages = false;
            if (this.loadingIndicator) {
                this.loadingIndicator.classList.add('d-none');
            }
        }
    }
    
    // New method to update avatar URLs in existing visible messages
    _updateAvatarInExistingMessages(userId, newAvatarUrl) {
        if (!userId || !newAvatarUrl) return;
        
        // Find all message avatars with this userId
        const avatars = document.querySelectorAll(`.message-avatar[data-user-id="${userId}"]`);
        
        // Update each avatar's src
        avatars.forEach(avatar => {
            avatar.src = newAvatarUrl;
        });
        
        console.log(`[CHAT_DEBUG] Updated ${avatars.length} message avatars for user ${userId}`);
    }
}

// Find a friend by their ID
ChatManager.prototype.findFriendById = function(friendId) {
    if (this.friendships && friendId in this.friendships) {
        return this.friendships[friendId];
    }
    return null; 
}

// Update profile picture when user selects a new image
ChatManager.prototype._handleProfilePictureChange = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            // Display a loading indicator
            this._showToast('Uploading profile picture...', 'bi-cloud-upload');
            
            // Compress the image before uploading
            const compressedImage = await this._compressImage(e.target.result);
            
            // Get current username from user object or input
            const username = this.currentUser ? this.currentUser.username : document.getElementById('username-display').innerText;
            
            // Upload the image
            this.socket.emit('profile:upload', {
                image: compressedImage,
                username: username
            }, (response) => {
                if (response.success) {
                    console.log('[PROFILE] Profile picture updated successfully');
                    
                    // Update local avatar
                    const avatarUrl = response.avatarUrl;
                    const userId = this.currentUser.id;
                    
                    // Update the current user's avatar URL
                    if (this.currentUser) {
                        this.currentUser.avatarUrl = avatarUrl;
                    }
                    
                    // Update any UI elements showing the current user's avatar
                    const userImage = document.getElementById('user-image');
                    if (userImage) {
                        userImage.src = avatarUrl;
                    }
                    
                    // Update all messages from this user
                    this._updateAvatarInExistingMessages(userId, avatarUrl);
                    
                    // Emit avatar:update to notify other clients
                    this.socket.emit('avatar:update', {
                        userId: userId,
                        newAvatarUrl: avatarUrl
                    });
                    
                    this._showToast('Profile picture updated successfully!', 'bi-check-circle-fill');
                } else {
                    console.error('[PROFILE] Failed to update profile picture:', response.error);
                    this._showToast('Failed to update profile picture. Please try again.', 'bi-exclamation-triangle-fill');
                }
            });
        } catch (error) {
            console.error('[PROFILE] Error processing profile picture:', error);
            this._showToast('Error processing image. Please try again.', 'bi-exclamation-triangle-fill');
        }
    };
    reader.readAsDataURL(file);
}
