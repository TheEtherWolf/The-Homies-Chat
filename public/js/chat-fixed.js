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
        
        // --- Lazy Loading Variables ---
        this.messagesPerPage = 25; // Number of messages to load at once
        this.expectedChunkSize = 15; // Number of messages to load in each lazy loading chunk
        this.hasMoreMessagesToLoad = true; // Whether there are more messages to load
        this.isLoadingMoreMessages = false; // Whether we're currently loading more messages
        this.currentMessageOffset = 0; // Current offset for pagination
        this.scrollObserver = null; // Intersection observer for lazy loading

        // Set up keep-alive mechanism to prevent Glitch from sleeping
        this.setupKeepAlive();
    }

    // Initialize the chat interface
    initialize(user) {
        console.log('[CHAT_DEBUG] Initializing chat interface');
        
        // Set up document-wide click handler for message action menus
        document.addEventListener('click', (event) => {
            // Check if we clicked outside any message action menu
            if (!event.target.closest('.message-actions-btn') && !event.target.closest('.message-actions-menu')) {
                // Close all open menus
                document.querySelectorAll('.message-actions-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
        
        // Use user parameter if provided, otherwise check session storage
        if (user) {
            this.currentUser = user;
            console.log('[CHAT_DEBUG] User data provided directly:', this.currentUser);
        } else {
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
            } catch (error) {
                console.error('[CHAT_DEBUG] Error parsing user data from session storage:', error);
                window.location.href = '/login.html';
                return;
            }
        }
        
        // Update UI with user info
        this._updateUserUI();
        
        // Set up socket event listeners
        this._setupSocketListeners();
        
        // Initialize emoji picker
        this._initializeEmojiPicker();
        
        // Initialize chat UI components and event listeners
        this.initializeChatUI();
        
        // Mark as initialized
        this.isInitialized = true;
        console.log('[CHAT_DEBUG] Chat interface initialized successfully');
        
        // Fetch initial data if needed
        if (this.needsInitialDataFetch) {
            this._fetchInitialData();
        }
    }
    
    /**
     * Initialize the UI for the chat interface
     */
    initializeChatUI() {
        // Update chat header
        if (this.chatTitle) {
            this.chatTitle.innerHTML = '<i class="bi bi-hash me-2"></i> general';
        }
        
        // Display general chat
        this._displayChannelMessages('general');
        
        // Settings button click handler
        if (this.settingsButton) {
            this.settingsButton.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Settings button clicked');
                // Update the avatar preview in the settings modal
                const avatarPreview = document.getElementById('profile-picture-preview');
                if (avatarPreview && this.currentUser && this.currentUser.avatarUrl) {
                    avatarPreview.src = this.currentUser.avatarUrl;
                }
                
                // Show the settings modal
                const settingsModal = new bootstrap.Modal(document.getElementById('settings-modal'));
                settingsModal.show();
            });
        }
        
        // Profile picture change button click handler
        const changeProfilePictureBtn = document.getElementById('change-profile-picture-btn');
        if (changeProfilePictureBtn) {
            changeProfilePictureBtn.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Change profile picture button clicked');
                // Trigger the file input click
                document.getElementById('profile-picture-input')?.click();
            });
        }
        
        // Profile picture input change handler
        const profilePictureInput = document.getElementById('profile-picture-input');
        if (profilePictureInput) {
            profilePictureInput.addEventListener('change', async (event) => {
                console.log('[CHAT_DEBUG] Profile picture input changed');
                const file = event.target.files[0];
                if (!file) return;
                
                // Validate file type and size
                const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
                if (!validTypes.includes(file.type)) {
                    alert('Please select a valid image file (JPG, PNG, or GIF)');
                    return;
                }
                
                // Continue with the upload process
                await this._uploadProfilePicture(file);
            });
        }
        
        // Send message button click handler
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Send message button clicked');
                this.sendMessage();
            });
        }
        
        // Message input keypress handler
        if (this.messageInput) {
            this.messageInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    console.log('[CHAT_DEBUG] Enter key pressed, sending message');
                    event.preventDefault(); // Prevent the default behavior (adding a newline)
                    this.sendMessage();
                }
            });
        }
        
        // Add friend button click handler
        const addFriendBtn = document.getElementById('add-friend-btn');
        if (addFriendBtn) {
            addFriendBtn.addEventListener('click', () => {
                this._handleAddFriendClick();
            });
        }
        
        // Save settings button click handler
        const saveSettingsBtn = document.getElementById('save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Save settings button clicked');
                // Close the modal
                const settingsModal = bootstrap.Modal.getInstance(document.getElementById('settings-modal'));
                if (settingsModal) {
                    settingsModal.hide();
                }
            });
        }
    }
    
    /**
     * Upload profile picture
     * @param {File} file - The image file to upload
     */
    async _uploadProfilePicture(file) {
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
        
        try {
            // Compress the image before upload
            const compressedImage = await this._compressImage(file);
            
            // Create form data for upload
            const formData = new FormData();
            formData.append('profilePicture', compressedImage);
            formData.append('userId', this.currentUser.id);
            
            // Upload to server
            const response = await fetch('/api/upload-profile-picture', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('[CHAT_DEBUG] Profile picture uploaded successfully:', result);
                
                // Update user data with new avatar URL
                this.currentUser.avatarUrl = result.avatarUrl;
                
                // Update session storage
                sessionStorage.setItem('user', JSON.stringify(this.currentUser));
                
                // Update UI
                this._updateUserUI();
                
                // Show success message
                alert('Profile picture updated successfully!');
            } else {
                console.error('[CHAT_DEBUG] Error uploading profile picture:', result.message);
                alert('Failed to upload profile picture: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('[CHAT_DEBUG] Error uploading profile picture:', error);
            alert('Failed to upload profile picture: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Compress an image file
     * @param {File} file - The image file to compress
     * @returns {Promise<Blob>} - The compressed image as a Blob
     */
    async _compressImage(file) {
        // Placeholder for image compression logic
        // In a real implementation, you would use a library like browser-image-compression
        return file;
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
    
    // Public method to update user display (called from app.js)
    updateCurrentUserDisplay() {
        console.log('[CHAT_DEBUG] Updating current user display');
        this._updateUserUI();
    }
    
    // Setup keep-alive mechanism to prevent Glitch from sleeping
    setupKeepAlive() {
        // Send a ping every 5 minutes
        setInterval(() => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('keep-alive');
                console.log('[CHAT_DEBUG] Keep-alive ping sent');
            }
        }, 5 * 60 * 1000);
    }
    
    // Placeholder for _setupSocketListeners method
    _setupSocketListeners() {
        console.log('[CHAT_DEBUG] Setting up socket listeners');
        // Implementation would go here
    }
    
    // Placeholder for _initializeEmojiPicker method
    _initializeEmojiPicker() {
        console.log('[CHAT_DEBUG] Initializing emoji picker');
        // Implementation would go here
    }
    
    // Placeholder for _fetchInitialData method
    _fetchInitialData() {
        console.log('[CHAT_DEBUG] Fetching initial data');
        // Implementation would go here
    }
    
    // Placeholder for _displayChannelMessages method
    _displayChannelMessages(channel) {
        console.log(`[CHAT_DEBUG] Displaying messages for channel: ${channel}`);
        // Implementation would go here
    }
    
    // Placeholder for sendMessage method
    sendMessage() {
        console.log('[CHAT_DEBUG] Sending message');
        // Implementation would go here
    }
    
    // Placeholder for _handleAddFriendClick method
    _handleAddFriendClick() {
        console.log('[CHAT_DEBUG] Add friend button clicked');
        // Implementation would go here
    }
    
    /**
     * Handle socket reconnection
     * Called by app.js when socket reconnects
     */
    handleReconnect() {
        console.log('[CHAT_DEBUG] Socket reconnected, handling reconnection');
        // Refresh user status
        if (this.currentUser && this.currentUser.id) {
            // Update user status to online
            this.socket.emit('update-status', { status: 'online' });
            
            // Add system message about reconnection
            this.addSystemMessage('Reconnected to server');
            
            // Refresh current channel or DM
            if (this.isDMMode && this.currentDmRecipientId) {
                // Refresh DM messages
                this.socket.emit('get-dm-messages', { recipientId: this.currentDmRecipientId });
            } else {
                // Refresh channel messages
                this._displayChannelMessages(this.currentChannel);
            }
        }
    }
    
    /**
     * Add a system message to the current chat
     * @param {string} message - The system message to display
     */
    addSystemMessage(message) {
        console.log(`[CHAT_DEBUG] Adding system message: ${message}`);
        
        if (!this.messagesContainer) {
            console.error('[CHAT_DEBUG] Cannot add system message: messages container not found');
            return;
        }
        
        // Create system message element
        const systemMessageEl = document.createElement('div');
        systemMessageEl.className = 'system-message';
        systemMessageEl.innerHTML = `
            <div class="system-message-content">
                <i class="bi bi-info-circle-fill me-2"></i>
                <span>${message}</span>
                <span class="system-message-time">${new Date().toLocaleTimeString()}</span>
            </div>
        `;
        
        // Add to messages container
        this.messagesContainer.appendChild(systemMessageEl);
        
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// Export the ChatManager class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChatManager };
}
