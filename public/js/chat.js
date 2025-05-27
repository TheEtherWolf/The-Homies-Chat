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
    initialize() {
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
            
            // Generate friend code if not already present
            if (!this.currentUser.friendCode) {
                this._generateFriendCode();
            }
            
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
            
            // Update friend code display
            this._updateFriendCodeDisplay();
            
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
    
    // Generate a new friend code for the user
    _generateFriendCode() {
        console.log('[CHAT_DEBUG] Generating new friend code');
        
        // Generate a random 8-character code
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let friendCode = '';
        for (let i = 0; i < 8; i++) {
            friendCode += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        
        // Save friend code to user data
        this.currentUser.friendCode = friendCode;
        
        // Update session storage
        sessionStorage.setItem('user', JSON.stringify(this.currentUser));
        
        // Send to server to save in Supabase
        this.socket.emit('update-friend-code', { 
            userId: this.currentUser.id,
            friendCode: friendCode 
        }, (response) => {
            console.log('[CHAT_DEBUG] Friend code update response:', response);
            if (response && response.success) {
                // Show success notification
                this._showNotification('Friend code updated successfully', 'success');
                
                // Update the UI
                this._updateFriendCodeDisplay();
            } else {
                console.error('[CHAT_DEBUG] Failed to update friend code:', response?.error || 'Unknown error');
                this._showNotification('Failed to update friend code', 'error');
            }
        });
        
        return friendCode;
    }
    
    // Update the friend code display in the UI
    _updateFriendCodeDisplay() {
        const friendCodeElement = document.getElementById('my-friend-code');
        const friendCodeContainer = document.querySelector('.friend-code-container');
        
        if (friendCodeElement && this.currentUser.friendCode) {
            friendCodeElement.textContent = this.currentUser.friendCode;
            
            // Make the container visible if it was hidden
            if (friendCodeContainer) {
                friendCodeContainer.classList.remove('d-none');
            }
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
        
        // DM button click handler
        document.getElementById('dm-button')?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] DM button clicked');
            this._handleDMButtonClick();
        });
        
        // Set up friend tabs
        const friendTabButtons = document.querySelectorAll('.friend-tab-btn');
        if (friendTabButtons.length > 0) {
            friendTabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    // Remove active class from all buttons
                    friendTabButtons.forEach(btn => btn.classList.remove('active'));
                    
                    // Add active class to clicked button
                    button.classList.add('active');
                    
                    // Hide all tab panes
                    document.querySelectorAll('.friends-tab-pane').forEach(pane => {
                        pane.classList.remove('active');
                    });
                    
                    // Show the corresponding tab pane
                    const tabName = button.getAttribute('data-tab');
                    const tabPane = document.getElementById(`friends-${tabName}`);
                    if (tabPane) {
                        tabPane.classList.add('active');
                    }
                    
                    // Load appropriate content based on tab
                    if (tabName === 'pending') {
                        this._loadPendingRequests();
                    } else if (tabName === 'blocked') {
                        this._loadBlockedUsers();
                    } else if (tabName === 'all') {
                        this._loadFriendsList();
                    }
                });
            });
        }
            
        // Home button click handler
        document.getElementById('home-button')?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] Home button clicked');
            this.isDMMode = false;
            this.currentChannel = 'general';
            
            // Update UI to show we're in channels mode
            document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
            document.getElementById('home-button').classList.add('active');
            
            // Show channels and hide DM list
            document.getElementById('channels-section')?.classList.remove('d-none');
            document.getElementById('dm-section')?.classList.add('d-none');
            document.getElementById('friends-section')?.classList.add('d-none');
            
            // Update chat header
            if (this.chatTitle) {
                this.chatTitle.innerHTML = '<i class="bi bi-hash me-2"></i> general';
            }
            
            // Display general chat
            this._displayChannelMessages('general');
        });
        
        // Settings button click handler
        document.getElementById('settings-button')?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] Settings button clicked');
            // Show settings modal
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal) {
                settingsModal.classList.add('show');
                document.body.classList.add('modal-open');
            }
        });
        
        // DM button click handler
        document.getElementById('dm-button')?.addEventListener('click', () => {
            this._handleDMButtonClick();
        });
        
        // Home button click handler
        document.getElementById('home-button')?.addEventListener('click', () => {
            console.log('[CHAT_DEBUG] Home button clicked');
            this.isDMMode = false;
            this.currentChannel = 'general';
            
            // Update UI to show we're in channels mode
            document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
            document.getElementById('home-button').classList.add('active');
            
            // Show channels and hide DM list
            document.getElementById('channels-section')?.classList.remove('d-none');
            document.getElementById('dm-section')?.classList.add('d-none');
            
            // Update chat header
            if (this.chatTitle) {
                this.chatTitle.innerHTML = '<i class="bi bi-hash me-2"></i> general';
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
            console.error('[CHAT_DEBUG] Error uploading profile picture:', error);
            alert('Failed to upload profile picture: ' + (error.message || 'Unknown error'));
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
                
                // Validate file size (max 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    alert('File size should not exceed 5MB');
                    return;
                }
                
                // Continue with the upload process
                this._uploadProfilePicture(file);
            });
        }

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

// Add friend button click handler
document.getElementById('add-friend-btn')?.addEventListener('click', () => {
    this._handleAddFriendClick();
});

// Handle DM button click
_handleDMButtonClick() {
    console.log('[CHAT_DEBUG] Handling DM button click');
    
    // Set DM mode
    this.isDMMode = true;
    this.currentChannel = 'direct-messages';
    
    // Update UI to show we're in DM mode
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('dm-button').classList.add('active');
    
    // Show Friends section and hide channels
    document.getElementById('channels-section')?.classList.add('d-none');
    document.getElementById('dm-section')?.classList.add('d-none');
    document.getElementById('friends-section')?.classList.remove('d-none');
    
    // Update chat header
    if (this.chatTitle) {
        this.chatTitle.innerHTML = '<i class="bi bi-people-fill me-2"></i> Friends';
    }
    
    // Load friends list
    this._loadFriendsList();
}

// Load friends list
_loadFriendsList() {
    console.log('[CHAT_DEBUG] Loading friends list');
    
    // Get the friends list container
    const friendsListContainer = document.getElementById('friends-list');
    if (!friendsListContainer) return;
    
    // Clear the container
    friendsListContainer.innerHTML = '';
    
    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    friendsListContainer.appendChild(loadingIndicator);
    
    // Request friends list from server
    this.socket.emit('get-friends', {}, (response) => {
        // Remove loading indicator
        loadingIndicator.remove();
        
        if (response && response.success && response.friends) {
            const friends = response.friends;
            
            if (friends.length === 0) {
                // Show empty state
                this._showEmptyFriendsState(friendsListContainer);
            } else {
                // Display friends
                friends.forEach(friend => {
                    const friendItem = this._createFriendListItem(friend);
                    friendsListContainer.appendChild(friendItem);
                });
            }
        } else {
            // Show error state
            this._showEmptyFriendsState(friendsListContainer, true);
        }
    });
}

// Show empty friends list state
_showEmptyFriendsState(container, isError = false) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-friends-state';
    
    if (isError) {
        emptyState.innerHTML = `
            <i class="bi bi-exclamation-circle"></i>
            <p>Could not load friends</p>
            <p class="sub-text">Please try again later</p>
        `;
    } else {
        // Get the user's friend code
        const friendCode = this.currentUser?.friendCode || this._generateFriendCode();
        
        emptyState.innerHTML = `
            <i class="bi bi-people"></i>
            <p>No friends yet</p>
            <p class="sub-text">Use a username and friend code to add friends</p>
            <div class="friend-code-section">
                <p>Your friend code:</p>
                <div class="friend-code">
                    <span id="friend-code">${friendCode}</span>
                    <button class="btn btn-sm btn-outline-primary copy-code-btn" title="Copy friend code">
                        <i class="bi bi-clipboard"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary regenerate-code-btn" title="Generate new code">
                        <i class="bi bi-arrow-repeat"></i>
                    </button>
                </div>
            </div>
            <div class="add-friend-section mt-3">
                <button class="btn btn-primary add-friend-modal-btn">
                    <i class="bi bi-person-plus-fill"></i> Add Friend
                </button>
            </div>
        `;
    }
    
    container.appendChild(emptyState);
    
    // Add event listeners after the element is added to the DOM
    if (!isError) {
            // Copy friend code button
            const copyCodeBtn = container.querySelector('.copy-code-btn');
            if (copyCodeBtn) {
                copyCodeBtn.addEventListener('click', () => {
                    const friendCode = document.getElementById('friend-code')?.textContent;
                    if (friendCode) {
                        navigator.clipboard.writeText(friendCode).then(() => {
                            // Show copied notification
                            this._showNotification('Copied friend code to clipboard!', 'success');
                        });
                    }
                });
            }
            
            // Regenerate friend code button
            const regenerateCodeBtn = container.querySelector('.regenerate-code-btn');
            if (regenerateCodeBtn) {
                regenerateCodeBtn.addEventListener('click', () => {
                    // Generate new friend code
                    const newFriendCode = this._generateFriendCode();
                    
                    // Update the displayed code
                    const friendCodeElement = document.getElementById('friend-code');
                    if (friendCodeElement) {
                        friendCodeElement.textContent = newFriendCode;
                    }
                    
                    // Show success notification
                    this._showNotification('Generated new friend code!', 'success');
                });
            }
            
            // Add friend button
            const addFriendModalBtn = container.querySelector('.add-friend-modal-btn');
            if (addFriendModalBtn) {
                addFriendModalBtn.addEventListener('click', () => {
                    this._showAddFriendModal();
                });
            }
        }
    }
    
    // Show notification
    _showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Remove after delay
        setTimeout(() => {
            notification.classList.remove('show');
            
            // Remove from DOM after animation
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    // Create a friend list item element
    _createFriendListItem(friendship) {
        // Get the friend's user ID (the other user in the friendship)
        const friendUserId = friendship.user_id;
        const friendUsername = friendship.username || 'Unknown User';
        const friendStatus = friendship.status || 'offline';
        const friendAvatarUrl = friendship.avatar_url || 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
        
        // Create the friend item element
        const friendItem = document.createElement('div');
        friendItem.className = 'friend-item';
        friendItem.setAttribute('data-user-id', friendUserId);
        
        // Create the friend item content
        friendItem.innerHTML = `
            <div class="friend-avatar">
                <img src="${friendAvatarUrl}" alt="${friendUsername}">
                <span class="status-indicator status-${friendStatus}"></span>
            </div>
            <div class="friend-info">
                <div class="friend-name">${friendUsername}</div>
                <div class="friend-status">${this._formatStatus(friendStatus)}</div>
            </div>
            <div class="friend-actions">
                <button class="btn btn-sm btn-primary message-btn" title="Message">
                    <i class="bi bi-chat-fill"></i>
                </button>
            </div>
        `;
        
        // Add event listener for messaging
        const messageBtn = friendItem.querySelector('.message-btn');
        if (messageBtn) {
            messageBtn.addEventListener('click', () => {
                // Start a DM conversation with this friend
                this._startDMConversation(friendUserId, friendUsername);
            });
        }
        
        return friendItem;
    }
    
    // Format user status
    _formatStatus(status) {
        switch (status) {
            case 'online':
                return 'Online';
            case 'idle':
                return 'Idle';
            case 'dnd':
                return 'Do Not Disturb';
            case 'offline':
            default:
                return 'Offline';
        }
    }
    
    // Show add friend modal
    _showAddFriendModal() {
        // Create modal element
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.id = 'addFriendModal';
        modalEl.setAttribute('tabindex', '-1');
        modalEl.setAttribute('aria-labelledby', 'addFriendModalLabel');
        modalEl.setAttribute('aria-hidden', 'true');
        
        // Create modal content
        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="addFriendModalLabel">Add Friend</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="friend-username-input" class="form-label">Username</label>
                            <input type="text" class="form-control" id="friend-username-input" placeholder="Enter username">
                        </div>
                        <div class="mb-3">
                            <label for="friend-code-input" class="form-label">Friend Code</label>
                            <input type="text" class="form-control" id="friend-code-input" placeholder="Enter friend code">
                        </div>
                        <hr>
                        <div class="friend-code-container">
                            <p>Your friend code: <span id="my-friend-code">${this.currentUser.friendCode || 'Loading...'}</span></p>
                            <button class="btn btn-sm btn-outline-primary copy-code-btn" title="Copy to clipboard">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-secondary generate-code-btn" title="Generate new code">
                                <i class="bi bi-arrow-repeat"></i>
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary send-request-btn">Send Friend Request</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to document body
        document.body.appendChild(modalEl);
        
        // Initialize modal
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        // Add event listener for send request button
        const sendRequestBtn = modalEl.querySelector('.send-request-btn');
        if (sendRequestBtn) {
            sendRequestBtn.addEventListener('click', () => {
                const usernameInput = document.getElementById('friend-username-input');
                const friendCodeInput = document.getElementById('friend-code-input');
                const username = usernameInput.value.trim();
                const friendCode = friendCodeInput.value.trim();
                
                if (!username) {
                    this._showNotification('Please enter a username', 'error');
                    return;
                }
                
                if (!friendCode) {
                    this._showNotification('Please enter a friend code', 'error');
                    return;
                }
                
                // Send friend request with both username and friend code
                this.socket.emit('add-friend-by-username-code', { username, friendCode }, (response) => {
                    if (response && response.success) {
                        // Show success notification
                        this._showNotification(`Friend request sent to ${response.recipientUsername}`, 'success');
                        
                        // Close modal
                        modal.hide();
                    } else {
                        // Show error notification
                        this._showNotification(response?.message || 'Failed to send friend request', 'error');
                    }
                });
            });
        }
        
        // Add event listener for copy code button
        const copyCodeBtn = modalEl.querySelector('.copy-code-btn');
        if (copyCodeBtn) {
            copyCodeBtn.addEventListener('click', () => {
                const friendCodeEl = document.getElementById('my-friend-code');
                const friendCode = friendCodeEl.textContent;
                
                // Copy to clipboard
                navigator.clipboard.writeText(friendCode).then(() => {
                    this._showNotification('Friend code copied to clipboard', 'success');
                    this._playCopySound();
                }).catch(err => {
                    console.error('Could not copy text: ', err);
                    this._showNotification('Failed to copy friend code', 'error');
                });
            });
        }
        
        // Add event listener for generate code button
        const generateCodeBtn = modalEl.querySelector('.generate-code-btn');
        if (generateCodeBtn) {
            generateCodeBtn.addEventListener('click', () => {
                // Generate new friend code
                this._generateFriendCode();
            });
        }
        
        // Clean up when modal is hidden
        modalEl.addEventListener('hidden.bs.modal', () => {
            modalEl.remove();
        });
    }
    
    // Add friend button click handler
    _handleAddFriendClick() {
        this._showAddFriendModal();
    }
    
    // Load pending friend requests
    _loadPendingRequests() {
        console.log('[CHAT_DEBUG] Loading pending friend requests');
        
        // Get the friends list container
        const friendsListContainer = document.getElementById('friends-list');
        if (!friendsListContainer) return;
        
        // Clear the container
        friendsListContainer.innerHTML = '';
        
        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
        friendsListContainer.appendChild(loadingIndicator);
        
        // Request pending friend requests from server
        this.socket.emit('get-pending-requests', {}, (response) => {
            // Remove loading indicator
            loadingIndicator.remove();
            
            if (response && response.success && response.requests) {
                const pendingRequests = response.requests;
                
                if (pendingRequests.length === 0) {
                    // Show empty state
                    this._showEmptyPendingState(friendsListContainer);
                } else {
                    // Display pending requests
                    pendingRequests.forEach(request => {
                        const requestItem = this._createPendingRequestItem(request);
                        friendsListContainer.appendChild(requestItem);
                    });
                }
            } else {
                // Show error state
                this._showEmptyPendingState(friendsListContainer, true);
            }
        });
    }
    
    // Show empty pending requests state
    _showEmptyPendingState(container, isError = false) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-friends-state';
        
        if (isError) {
            emptyState.innerHTML = `
                <i class="bi bi-exclamation-circle"></i>
                <p>Could not load pending requests</p>
                <p class="sub-text">Please try again later</p>
            `;
        } else {
            emptyState.innerHTML = `
                <i class="bi bi-person-check"></i>
                <p>No pending requests</p>
                <p class="sub-text">When someone sends you a friend request, it will appear here</p>
            `;
        }
        
        container.appendChild(emptyState);
    }
    
    // Create a pending request item element
    _createPendingRequestItem(request) {
        const isIncoming = request.direction === 'incoming';
        const username = request.username || 'Unknown User';
        const avatarUrl = request.avatar_url || 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
        
        // Create the request item element
        const requestItem = document.createElement('div');
        requestItem.className = 'friend-item pending-request';
        requestItem.setAttribute('data-request-id', request.id);
        
        // Create the request item content
        if (isIncoming) {
            requestItem.innerHTML = `
                <div class="friend-avatar">
                    <img src="${avatarUrl}" alt="${username}">
                </div>
                <div class="friend-info">
                    <div class="friend-name">${username}</div>
                    <div class="friend-status">Incoming Friend Request</div>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-sm btn-success accept-btn" title="Accept">
                        <i class="bi bi-check-lg"></i>
                    </button>
                    <button class="btn btn-sm btn-danger reject-btn" title="Reject">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            `;
            
            // Add event listeners for accept and reject buttons
            const acceptBtn = requestItem.querySelector('.accept-btn');
            if (acceptBtn) {
                acceptBtn.addEventListener('click', () => {
                    this._acceptFriendRequest(request.id);
                });
            }
            
            const rejectBtn = requestItem.querySelector('.reject-btn');
            if (rejectBtn) {
                rejectBtn.addEventListener('click', () => {
                    this._rejectFriendRequest(request.id);
                });
            }
        } else {
            requestItem.innerHTML = `
                <div class="friend-avatar">
                    <img src="${avatarUrl}" alt="${username}">
                </div>
                <div class="friend-info">
                    <div class="friend-name">${username}</div>
                    <div class="friend-status">Outgoing Friend Request</div>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-sm btn-danger cancel-btn" title="Cancel Request">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            `;
            
            // Add event listener for cancel button
            const cancelBtn = requestItem.querySelector('.cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    this._cancelFriendRequest(request.id);
                });
            }
        }
        
        return requestItem;
    }
    
    // Accept a friend request
    _acceptFriendRequest(requestId) {
        this.socket.emit('respond-friend-request', { requestId, accept: true }, (response) => {
            if (response && response.success) {
                // Show success notification
                this._showNotification('Friend request accepted!', 'success');
                
                // Reload pending requests
                this._loadPendingRequests();
            } else {
                // Show error notification
                this._showNotification(response?.message || 'Failed to accept friend request', 'error');
            }
        });
    }
    
    // Reject a friend request
    _rejectFriendRequest(requestId) {
        this.socket.emit('respond-friend-request', { requestId, accept: false }, (response) => {
            if (response && response.success) {
                // Show success notification
                this._showNotification('Friend request rejected', 'success');
                
                // Reload pending requests
                this._loadPendingRequests();
            } else {
                // Show error notification
                this._showNotification(response?.message || 'Failed to reject friend request', 'error');
            }
        });
    }
    
    // Cancel a friend request
    _cancelFriendRequest(requestId) {
        this.socket.emit('cancel-friend-request', { requestId }, (response) => {
            if (response && response.success) {
                // Show success notification
                this._showNotification('Friend request cancelled', 'success');
                
                // Reload pending requests
                this._loadPendingRequests();
            } else {
                // Show error notification
                this._showNotification(response?.message || 'Failed to cancel friend request', 'error');
            }
        });
    }
    
    // Load blocked users
    _loadBlockedUsers() {
        console.log('[CHAT_DEBUG] Loading blocked users');
        
        // Get the friends list container
        const friendsListContainer = document.getElementById('friends-list');
        if (!friendsListContainer) return;
        
        // Clear the container
        friendsListContainer.innerHTML = '';
        
        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
        friendsListContainer.appendChild(loadingIndicator);
        
        // Request blocked users from server
        this.socket.emit('get-blocked-users', {}, (response) => {
            // Remove loading indicator
            loadingIndicator.remove();
            
            if (response && response.success && response.blockedUsers) {
                const blockedUsers = response.blockedUsers;
                
                if (blockedUsers.length === 0) {
                    // Show empty state
                    this._showEmptyBlockedState(friendsListContainer);
                } else {
                    // Display blocked users
                    blockedUsers.forEach(user => {
                        const blockedUserItem = this._createBlockedUserItem(user);
                        friendsListContainer.appendChild(blockedUserItem);
                    });
                }
            } else {
                // Show error state
                this._showEmptyBlockedState(friendsListContainer, true);
            }
        });
    }
    
    // Show empty blocked users state
    _showEmptyBlockedState(container, isError = false) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-friends-state';
        
        if (isError) {
            emptyState.innerHTML = `
                <i class="bi bi-exclamation-circle"></i>
                <p>Could not load blocked users</p>
                <p class="sub-text">Please try again later</p>
            `;
        } else {
            emptyState.innerHTML = `
                <i class="bi bi-shield-check"></i>
                <p>No blocked users</p>
                <p class="sub-text">When you block someone, they will appear here</p>
            `;
        }
        
        container.appendChild(emptyState);
    }
    
    // Create a blocked user item element
    _createBlockedUserItem(user) {
        const username = user.username || 'Unknown User';
        const avatarUrl = user.avatar_url || 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
        
        // Create the blocked user item element
        const blockedUserItem = document.createElement('div');
        blockedUserItem.className = 'friend-item blocked-user';
        blockedUserItem.setAttribute('data-user-id', user.id);
        
        // Create the blocked user item content
        blockedUserItem.innerHTML = `
            <div class="friend-avatar">
                <img src="${avatarUrl}" alt="${username}">
            </div>
            <div class="friend-info">
                <div class="friend-name">${username}</div>
                <div class="friend-status">Blocked</div>
            </div>
            <div class="friend-actions">
                <button class="btn btn-sm btn-primary unblock-btn" title="Unblock">
                    <i class="bi bi-unlock"></i>
                </button>
            </div>
        `;
        
        // Add event listener for unblock button
        const unblockBtn = blockedUserItem.querySelector('.unblock-btn');
        if (unblockBtn) {
            unblockBtn.addEventListener('click', () => {
                this._unblockUser(user.id);
            });
        }
        
        return blockedUserItem;
    }
    
    // Unblock a user
    _unblockUser(userId) {
        this.socket.emit('unblock-user', { userId }, (response) => {
            if (response && response.success) {
                // Show success notification
                this._showNotification('User unblocked', 'success');
                
                // Reload blocked users
                this._loadBlockedUsers();
            } else {
                // Show error notification
                this._showNotification(response?.message || 'Failed to unblock user', 'error');
            }
        });
    }

    // Start a DM conversation with a user
    _startDMConversation(userId, username) {
        console.log(`[CHAT_DEBUG] Starting DM conversation with ${username} (${userId})`);
        
        // Set current DM recipient
        this.currentDmRecipientId = userId;
        this.isDMMode = true;
        this.currentChannel = `dm-${userId}`;
        
        // Update UI
        document.getElementById('friends-section')?.classList.add('d-none');
        document.getElementById('dm-section')?.classList.remove('d-none');
        
        // Update chat header
        if (this.chatTitle) {
            this.chatTitle.innerHTML = `<i class="bi bi-chat-fill me-2"></i> ${username}`;
        }
        
        // Load DM messages
        this.socket.emit('get-dm-messages', { recipientId: userId }, (response) => {
            if (response && response.messages) {
                // Cache the messages
                this.dmConversations[userId] = response.messages;
                
                // Display the messages
                this._displayDMConversation(userId);
            }
        });
    }
    
    // Display a DM conversation
    _displayDMConversation(userId) {
        console.log(`[CHAT_DEBUG] Displaying DM conversation with user ${userId}`);
        
        // Clear messages container
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
            
            // Get messages for this DM
            const messages = this.dmConversations[userId] || [];
            
            if (messages.length === 0) {
                // Show empty state
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-dm-state';
                emptyState.innerHTML = `
                    <i class="bi bi-chat-text"></i>
                    <p>No messages yet</p>
                    <p class="sub-text">Start the conversation by sending a message</p>
                `;
                this.messagesContainer.appendChild(emptyState);
            } else {
                // Display messages
                messages.forEach(message => {
                    this._displayMessage(message, false);
                });
                
                // Scroll to bottom
                this._scrollToBottom();
            }
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
            if (this.currentUser && this.currentUser.id) {
                console.log('[CHAT_DEBUG] User authenticated, performing initial data fetch');
                this.performInitialDataFetch();
            } else {
                console.log('[CHAT_DEBUG] Waiting for user authentication before fetching data');
                // We'll fetch data when user is fully authenticated
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
            
            // Determine if this is an initial load or a lazy load of older messages
            const isLazyLoad = data.isOlderMessages === true;
            
            if (isLazyLoad) {
                // For lazy loading, prepend messages to existing ones
                const currentScrollHeight = this.messagesContainer.scrollHeight;
                const currentScrollPosition = this.messagesContainer.scrollTop;
                
                // Get current first message element for reference
                const firstMessage = this.messagesContainer.querySelector('.message');
                
                // Store the current height of the first message if it exists
                const firstMessageHeight = firstMessage ? firstMessage.offsetHeight : 0;
                
                // Prepend older messages to the existing channel messages
                if (!this.channelMessages[data.channel]) {
                    this.channelMessages[data.channel] = [];
                }
                
                // Add older messages at the beginning of the array
                this.channelMessages[data.channel] = [...data.messages, ...this.channelMessages[data.channel]];
                
                // Display only the new messages at the top
                this._prependOlderMessages(data.channel, data.messages);
                
                // Maintain scroll position after adding messages
                if (firstMessage) {
                    // Calculate new scroll position to keep the same message in view
                    const newScrollHeight = this.messagesContainer.scrollHeight;
                    const heightDifference = newScrollHeight - currentScrollHeight;
                    this.messagesContainer.scrollTop = currentScrollPosition + heightDifference;
                }
                
                // Update lazy loading state
                this.isLoadingMoreMessages = false;
                
                // If we received fewer messages than requested, we've reached the beginning
                if (data.messages.length < this.messagesPerPage) {
                    this.hasMoreMessagesToLoad = false;
                    
                    // Add a "beginning of conversation" indicator
                    if (data.messages.length > 0 && !this.messagesContainer.querySelector('.beginning-message')) {
                        const beginningMessage = document.createElement('div');
                        beginningMessage.className = 'beginning-message';
                        beginningMessage.textContent = 'Beginning of conversation';
                        this.messagesContainer.insertBefore(beginningMessage, this.messagesContainer.firstChild);
                    }
                }
            } else {
                // For initial load, replace existing messages
                this.channelMessages[data.channel] = data.messages;
                
                // If this is the current channel, display messages
                if (data.channel === this.currentChannel) {
                    this._displayChannelMessages(data.channel);
                }
                
                // Reset lazy loading state for new channel
                this.hasMoreMessagesToLoad = data.messages.length >= this.messagesPerPage;
                this.isLoadingMoreMessages = false;
                this.currentMessageOffset = data.messages.length;
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
        
        // Handle message deletion events
        this.socket.on('message-deleted', (data) => {
            console.log('[CHAT_DEBUG] Message deleted event received:', data);
            
            if (!data || !data.messageId) {
                console.error('[CHAT_DEBUG] Invalid message deletion data');
                return;
            }
            
            // Find the message element in the DOM
            const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
            if (messageElement) {
                // Update the message content to show it's deleted
                const messageTextElement = messageElement.querySelector('.message-text');
                if (messageTextElement) {
                    messageTextElement.innerHTML = '<em class="deleted-message">[This message has been deleted]</em>';
                }
                
                // Remove delete option from dropdown if it exists
                const deleteAction = messageElement.querySelector('.message-action-item[data-action="delete"]');
                if (deleteAction) {
                    deleteAction.remove();
                }
                
                console.log('[CHAT_DEBUG] Message marked as deleted in UI:', data.messageId);
            } else {
                console.error('[CHAT_DEBUG] Could not find message element to mark as deleted:', data.messageId);
            }
            
            // Update the message in our cached arrays
            for (const channel in this.channelMessages) {
                const messages = this.channelMessages[channel];
                const messageIndex = messages.findIndex(msg => msg.id === data.messageId);
                
                if (messageIndex !== -1) {
                    // Mark the message as deleted in our cache
                    messages[messageIndex].is_deleted = true;
                    messages[messageIndex].deleted_at = new Date().toISOString();
                    console.log(`[CHAT_DEBUG] Message marked as deleted in channel cache: ${channel}`);
                    break;
                }
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
        
        // Play sent message sound
        this._playSentMessageSound();
        
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
            
            // Add lazy load sentinel at the top for infinite scrolling
            const sentinel = document.createElement('div');
            sentinel.id = 'lazy-load-sentinel';
            sentinel.className = 'lazy-load-sentinel';
            sentinel.style.height = '1px';
            sentinel.style.width = '100%';
            this.messagesContainer.appendChild(sentinel);
            
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
            
            // Set up lazy loading observer after messages are displayed
            this._setupLazyLoadingObserver();
            
            // Reset lazy loading state for new channel
            this.hasMoreMessagesToLoad = true; // Always assume there are more messages initially
            this.isLoadingMoreMessages = false;
            this.currentMessageOffset = messages.length;
            this.expectedChunkSize = 15; // The number of messages we expect to load in each chunk
            
            // Force a scroll event if we're near the top to trigger loading more messages
            if (this.messagesContainer.scrollTop < 200) {
                // Simulate a scroll event after a short delay to allow the UI to render
                setTimeout(() => {
                    if (this._boundScrollHandler) {
                        this._boundScrollHandler();
                    }
                }, 500);  // 500ms delay to ensure the UI has rendered
            }
        }
    }
    
    // Display a single message
    _displayMessage(message, scrollToBottom = true) {
        if (!this.messagesContainer) return;
        
        // Skip if message already exists in the DOM
        if (message.id && document.querySelector(`.message[data-message-id="${message.id}"]`)) {
            return;
        }
        
        // Check if this message should be grouped with the previous message
        const shouldGroup = this._shouldGroupWithPreviousMessage(message);
        
        // Create message element using the helper method
        const messageEl = this._createMessageElement(message, scrollToBottom, shouldGroup);
        
        // Add to messages container
        this.messagesContainer.appendChild(messageEl);
        
        // Scroll to bottom if requested
        if (scrollToBottom) {
            this._scrollToBottom();
        }
    }
    
    // Determine if a message should be grouped with the previous message
    _shouldGroupWithPreviousMessage(message) {
        if (!this.messagesContainer) return false;
        
        // Get the last message in the container
        const lastMessageEl = this.messagesContainer.querySelector('.message:last-child');
        if (!lastMessageEl) return false;
        
        // Get the sender ID of the last message
        const lastSenderId = lastMessageEl.getAttribute('data-sender-id');
        
        // Get the timestamp of the last message
        const lastTimestampStr = lastMessageEl.getAttribute('data-timestamp');
        const lastTimestamp = lastTimestampStr ? new Date(lastTimestampStr) : null;
        
        // Current message timestamp
        const currentTimestamp = message.timestamp ? new Date(message.timestamp) : new Date();
        
        // Check if the messages are from the same sender
        const sameSender = lastSenderId === message.senderId;
        
        // Check if the messages are within 3 minutes of each other
        const timeThreshold = 3 * 60 * 1000; // 3 minutes in milliseconds
        const closeInTime = lastTimestamp && (currentTimestamp - lastTimestamp) < timeThreshold;
        
        return sameSender && closeInTime;
    }
    
    // Delete a message
    _deleteMessage(messageId) {
        if (!messageId) return;
        
        console.log(`[CHAT_DEBUG] Deleting message: ${messageId}`);
        
        // Play delete sound
        this._playDeleteSound();
        
        // Send delete request to server
        this.socket.emit('delete-message', { messageId, userId: this.currentUser.id }, (response) => {
            console.log('[CHAT_DEBUG] Delete message response:', response);
            
            if (!response.success) {
                console.error('[CHAT_DEBUG] Error deleting message:', response.error);
                alert('Failed to delete message: ' + (response.error || 'Unknown error'));
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
    
    // Play notification sound for received messages
    _playNotificationSound() {
        // Check if notification sounds are enabled
        const notificationSoundsEnabled = document.getElementById('notification-sounds')?.checked !== false;
        
        if (notificationSoundsEnabled) {
            // Create and play notification sound
            const audio = new Audio('https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/whoosh-blow-flutter-shortwav-14678.mp3?v=1747149171702');
            audio.volume = 0.5;
            audio.play().catch(err => console.error('[CHAT_DEBUG] Error playing notification sound:', err));
        }
    }
    
    // Play sound effect for sent messages
    _playSentMessageSound() {
        // Check if notification sounds are enabled
        const notificationSoundsEnabled = document.getElementById('notification-sounds')?.checked !== false;
        
        if (notificationSoundsEnabled) {
            // Create and play sent message sound
            const audio = new Audio('https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/Send%20message.mp3?v=1747149038729');
            audio.volume = 0.3; // Slightly quieter than notification sound
            audio.play().catch(err => console.error('[CHAT_DEBUG] Error playing sent message sound:', err));
        }
    }
    
    // Play sound effect for copying message
    _playCopySound() {
        // Check if notification sounds are enabled
        const notificationSoundsEnabled = document.getElementById('notification-sounds')?.checked !== false;
        
        if (notificationSoundsEnabled) {
            // Create and play copy sound
            const audio = new Audio('https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/Click%20sound.mp3?v=1747149269183');
            audio.volume = 0.3;
            audio.play().catch(err => console.error('[CHAT_DEBUG] Error playing copy sound:', err));
        }
    }
    
    // Play sound effect for deleting message
    _playDeleteSound() {
        // Check if notification sounds are enabled
        const notificationSoundsEnabled = document.getElementById('notification-sounds')?.checked !== false;
        
        if (notificationSoundsEnabled) {
            // Create and play delete sound
            const audio = new Audio('https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/11L-Make_a_short%2C_satisf-1747149354209.mp3?v=1747149378426');
            audio.volume = 0.3;
            audio.play().catch(err => console.error('[CHAT_DEBUG] Error playing delete sound:', err));
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
        
        // Fetch message history for current channel with pagination
        this.socket.emit('get-channel-messages', { 
            channel: this.currentChannel,
            limit: this.messagesPerPage,
            offset: 0,
            isInitialLoad: true
        });
        
        // Fetch friend list
        this.socket.emit('get-friends-list');
        
        // Fetch pending friend requests
        this.socket.emit('get-friend-requests');
        
        // Mark as fetched
        this.needsInitialDataFetch = false;
        
        // Set up lazy loading observer after initial fetch
        this._setupLazyLoadingObserver();
        
        console.log('[CHAT_DEBUG] Initial data fetch complete');
    }
    
    // Set up scroll-based lazy loading for older messages
    _setupLazyLoadingObserver() {
        console.log('[CHAT_DEBUG] Setting up enhanced scroll-based lazy loading');
        
        // Reset the hasMoreMessagesToLoad flag to true when setting up a new observer
        // This ensures we always try to load messages at least once for a new channel
        // The server response will determine if there are actually more messages
        this.hasMoreMessagesToLoad = true;
        
        // Remove any existing event listeners to prevent duplicates
        if (this.messagesContainer && this._boundScrollHandler) {
            this.messagesContainer.removeEventListener('scroll', this._boundScrollHandler);
            this._hasScrollListener = false;
        }
        
        // Disconnect any existing observer if we're switching to scroll-based approach
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
            this.scrollObserver = null;
        }
        
        // Create a debounced scroll handler for better performance
        this._boundScrollHandler = this._debounce((e) => {
            // Only proceed if we have more messages and aren't already loading
            if (!this.hasMoreMessagesToLoad || this.isLoadingMoreMessages) {
                return;
            }
            
            // Check if we're within 200px of the top of the container
            const scrollTop = this.messagesContainer.scrollTop;
            if (scrollTop <= 200) {
                console.log('[CHAT_DEBUG] Near top of scroll area, loading more messages');
                
                // Save current scroll position before loading
                const lastScrollHeight = this.messagesContainer.scrollHeight;
                const lastScrollTop = scrollTop;
                
                // Load older messages with the saved position info
                this._loadOlderMessages(lastScrollHeight, lastScrollTop);
            }
        }, 200); // 200ms debounce to prevent excessive calls
        
        // Add the scroll event listener
        if (this.messagesContainer) {
            this.messagesContainer.addEventListener('scroll', this._boundScrollHandler);
            this._hasScrollListener = true;
            console.log('[CHAT_DEBUG] Scroll-based lazy loading initialized');
        }
        
        // Create a sentinel element at the top for visual reference and debugging
        if (!document.getElementById('lazy-load-sentinel')) {
            const sentinel = document.createElement('div');
            sentinel.id = 'lazy-load-sentinel';
            sentinel.className = 'lazy-load-sentinel';
            sentinel.style.height = '1px';
            sentinel.style.width = '100%';
            
            // Add sentinel to the top of the messages container
            if (this.messagesContainer && this.messagesContainer.firstChild) {
                this.messagesContainer.insertBefore(sentinel, this.messagesContainer.firstChild);
            } else if (this.messagesContainer) {
                this.messagesContainer.appendChild(sentinel);
            }
        }
        
        // Remove any existing beginning indicator when setting up a new observer
        const beginningIndicator = document.getElementById('beginning-indicator');
        if (beginningIndicator && beginningIndicator.parentNode) {
            beginningIndicator.parentNode.remove();
        }
    }
    
    // Debounce function to limit how often a function can be called
    _debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Load older messages when scrolling up with improved scroll position maintenance
    _loadOlderMessages(previousScrollHeight = 0, previousScrollTop = 0) {
        if (this.isLoadingMoreMessages || !this.hasMoreMessagesToLoad) {
            return;
        }
        
        console.log('[CHAT_DEBUG] Loading older messages');
        this.isLoadingMoreMessages = true;
        
        // Store scroll position data for later use with precise measurements
        this._previousScrollData = {
            height: previousScrollHeight || (this.messagesContainer ? this.messagesContainer.scrollHeight : 0),
            top: previousScrollTop || (this.messagesContainer ? this.messagesContainer.scrollTop : 0)
        };
        
        // Create a measurement node to calculate exact heights
        const measureNode = document.createElement('div');
        measureNode.style.position = 'absolute';
        measureNode.style.visibility = 'hidden';
        measureNode.style.height = '0px';
        measureNode.id = 'scroll-measure-node';
        if (this.messagesContainer && this.messagesContainer.firstChild) {
            this.messagesContainer.insertBefore(measureNode, this.messagesContainer.firstChild);
        }
        
        // Add loading indicator with smooth animation
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loading-indicator';
        loadingIndicator.className = 'loading-indicator fade-in';
        
        // Create spinner element for better visual feedback
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        loadingIndicator.appendChild(spinner);
        
        // Add loading text
        const loadingText = document.createElement('span');
        loadingText.textContent = 'Loading older messages...';
        loadingIndicator.appendChild(loadingText);
        
        // Create a container for the loading indicator to ensure proper positioning
        const loadingContainer = document.createElement('div');
        loadingContainer.style.width = '100%';
        loadingContainer.style.textAlign = 'center';
        loadingContainer.style.position = 'relative';
        loadingContainer.style.zIndex = '10';
        loadingContainer.style.pointerEvents = 'none';
        loadingContainer.style.marginTop = '5px';
        loadingContainer.style.marginBottom = '5px';
        loadingContainer.appendChild(loadingIndicator);
        
        // Insert at the top of the container
        if (this.messagesContainer) {
            // Insert as the first child with proper positioning
            if (this.messagesContainer.firstChild) {
                this.messagesContainer.insertBefore(loadingContainer, this.messagesContainer.firstChild);
            } else {
                this.messagesContainer.appendChild(loadingContainer);
            }
        }
        
        // Calculate the offset for pagination
        const channel = this.currentChannel.startsWith('#') ? this.currentChannel.substring(1) : this.currentChannel;
        const offset = this.channelMessages[channel] ? this.channelMessages[channel].length : 0;
        
        // Request older messages from the server with consistent chunk size
        this.socket.emit('get-channel-messages', {
            channel: channel,
            limit: this.expectedChunkSize, // Use the class property for consistency
            offset: offset,
            isOlderMessages: true
        });
    }
    
    // Prepend older messages to the messages container with improved scroll position maintenance
    _prependOlderMessages(channel, messages) {
        console.log(`[CHAT_DEBUG] Prepending ${messages.length} older messages for channel ${channel}`);
        
        if (!this.messagesContainer) {
            console.error('[CHAT_DEBUG] Messages container not found');
            return;
        }
        
        // Get the current scroll position before making changes
        const previousScrollData = this._previousScrollData || {
            height: this.messagesContainer.scrollHeight,
            top: this.messagesContainer.scrollTop
        };
        
        // Remove loading indicator with fade-out animation
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator && loadingIndicator.parentNode) {
            // Add fade-out class
            loadingIndicator.classList.add('fade-out');
            
            // Remove after animation completes
            setTimeout(() => {
                if (loadingIndicator.parentNode) {
                    loadingIndicator.parentNode.remove(); // Remove the entire container
                }
            }, 300); // Match the CSS animation duration
        }
        
        // If no messages to prepend, reset loading state and return
        if (!messages || messages.length === 0) {
            console.log('[CHAT_DEBUG] No older messages to prepend');
            this.isLoadingMoreMessages = false;
            
            // If we've reached the end, mark that there are no more messages
            if (messages && messages.length === 0) {
                this.hasMoreMessagesToLoad = false;
                
                // Show a "beginning of conversation" indicator
                this._showBeginningIndicator();
            }
            return;
        }
        
        // Only consider it the end when we get exactly 0 messages
        // Just getting fewer than expected doesn't mean we're at the end
        if (messages.length === 0) {
            console.log('[CHAT_DEBUG] Received 0 messages, definitely at the end of conversation');
            this.hasMoreMessagesToLoad = false;
            this._showBeginningIndicator();
        } else if (messages.length < this.expectedChunkSize) {
            // If we got fewer than expected but not zero, log it but don't mark as end
            console.log(`[CHAT_DEBUG] Received ${messages.length} messages, which is less than expected ${this.expectedChunkSize}, but still have more to load.`);
            // Keep hasMoreMessagesToLoad as true to allow more loading
        }
        
        // Get reference to the sentinel element
        const sentinel = document.getElementById('lazy-load-sentinel');
        
        // Create a document fragment to hold all the new messages
        const fragment = document.createDocumentFragment();
        
        // Add messages in reverse order (oldest first)
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            
            // Skip duplicates (messages that already exist in the DOM)
            if (document.querySelector(`.message[data-message-id="${message.id}"]`)) {
                continue;
            }
            
            // Check if this message should be grouped with the next message
            // (which would be the previous message in the UI since we're prepending)
            let shouldGroup = false;
            
            // If this isn't the first message in the batch, check if it should be grouped with the next one
            if (i < messages.length - 1) {
                const nextMessage = messages[i + 1];
                
                // Check if the messages are from the same sender
                const sameSender = message.senderId === nextMessage.senderId;
                
                // Check if the messages are within 3 minutes of each other
                const currentTimestamp = message.timestamp ? new Date(message.timestamp) : new Date();
                const nextTimestamp = nextMessage.timestamp ? new Date(nextMessage.timestamp) : new Date();
                const timeThreshold = 3 * 60 * 1000; // 3 minutes in milliseconds
                const closeInTime = Math.abs(currentTimestamp - nextTimestamp) < timeThreshold;
                
                shouldGroup = sameSender && closeInTime;
            }
            
            // Create message element with grouping info
            const messageEl = this._createMessageElement(message, false, shouldGroup);
            
            // Add new-loaded class for fade-in animation
            messageEl.classList.add('new-loaded');
            
            // Ensure visibility with explicit styles
            messageEl.style.visibility = 'visible';
            messageEl.style.opacity = '0'; // Start at 0 opacity for animation
            messageEl.style.display = 'flex';
            
            // Add to fragment
            fragment.appendChild(messageEl);
        }
        
        // Measure the height before insertion
        const beforeHeight = this.messagesContainer.scrollHeight;
        
        // Insert all messages at once before the first existing message
        if (sentinel) {
            // Insert after the sentinel
            this.messagesContainer.insertBefore(fragment, sentinel.nextSibling || null);
        } else {
            // If no sentinel, insert at the beginning
            if (this.messagesContainer.firstChild) {
                this.messagesContainer.insertBefore(fragment, this.messagesContainer.firstChild);
            } else {
                this.messagesContainer.appendChild(fragment);
            }
        }
        
        // Force a reflow to ensure messages are rendered properly
        this._forceReflow();
        
        // Measure the height after insertion
        const afterHeight = this.messagesContainer.scrollHeight;
        const heightDifference = afterHeight - beforeHeight;
        
        // Maintain scroll position with the new content
        if (this.messagesContainer) {
            // Disable smooth scrolling temporarily for precise positioning
            const originalScrollBehavior = this.messagesContainer.style.scrollBehavior;
            this.messagesContainer.style.scrollBehavior = 'auto';
            
            // Adjust scroll position to account for new content
            this.messagesContainer.scrollTop = previousScrollData.top + heightDifference;
            
            // Use requestAnimationFrame for more precise adjustments
            requestAnimationFrame(() => {
                // Double-check the position and make final adjustment if needed
                const finalHeightDiff = this.messagesContainer.scrollHeight - beforeHeight;
                this.messagesContainer.scrollTop = previousScrollData.top + finalHeightDiff;
                
                // Restore original scroll behavior after adjustment
                setTimeout(() => {
                    this.messagesContainer.style.scrollBehavior = originalScrollBehavior;
                    
                    // Trigger animations for newly added messages
                    const newMessages = this.messagesContainer.querySelectorAll('.message.new-loaded');
                    newMessages.forEach(msg => {
                        // Stagger the animations slightly for a more natural feel
                        setTimeout(() => {
                            msg.style.opacity = '1';
                        }, Math.random() * 100); // Random delay up to 100ms for natural staggering
                    });
                }, 50);
            });
        }
        
        // Check if the first visible message should be grouped with the next message
        this._updateMessageGrouping();
        
        // Reset loading state
        this.isLoadingMoreMessages = false;
        
        // Update the offset for the next batch
        this.currentMessageOffset += messages.length;
        
        // Only consider it the end when we get exactly 0 messages
        if (messages.length === 0) {
            console.log('[CHAT_DEBUG] Received 0 messages, definitely at the end of conversation');
            this.hasMoreMessagesToLoad = false;
            this._showBeginningIndicator();
        } else if (messages.length < this.expectedChunkSize) {
            // If we got fewer than expected but not zero, log it but don't mark as end
            console.log(`[CHAT_DEBUG] Received ${messages.length} messages, which is less than expected ${this.expectedChunkSize}, but still have more to load.`);
            // Keep hasMoreMessagesToLoad as true to allow more loading attempts
        }
        
        console.log('[CHAT_DEBUG] Older messages prepended successfully');
    }
    
    // Delete a message
    _deleteMessage(messageId) {
        if (!messageId) {
            console.error('[CHAT_DEBUG] Cannot delete message: No message ID provided');
            return;
        }
        
        console.log(`[CHAT_DEBUG] Deleting message with ID: ${messageId}`);
        
        // Confirm deletion
        if (confirm('Are you sure you want to delete this message? This cannot be undone.')) {
            // First, mark the message as deleted in the UI
            const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
            if (messageEl) {
                const messageTextEl = messageEl.querySelector('.message-text');
                if (messageTextEl) {
                    messageTextEl.innerHTML = '<em class="deleted-message">[This message has been deleted]</em>';
                }
                
                // Remove message actions
                const messageActions = messageEl.querySelector('.message-actions');
                if (messageActions) {
                    messageActions.remove();
                }
                
                // Add deleted class
                messageEl.classList.add('deleted');
            }
            
            // Send delete request to server
            this.socket.emit('delete-message', { messageId }, (response) => {
                if (response && response.success) {
                    console.log(`[CHAT_DEBUG] Message ${messageId} deleted successfully`);
                    
                    // Also delete from Supabase
                    this._deleteMessageFromSupabase(messageId);
                    
                    // Update message in cache
                    this._updateDeletedMessageInCache(messageId);
                } else {
                    console.error('[CHAT_DEBUG] Failed to delete message:', response?.error || 'Unknown error');
                    this._showNotification('Failed to delete message', 'error');
                }
            });
        }
    }
    
    // Delete message from Supabase
    _deleteMessageFromSupabase(messageId) {
        console.log(`[CHAT_DEBUG] Deleting message ${messageId} from Supabase`);
        
        // Send request to server to delete from Supabase
        this.socket.emit('delete-message-from-supabase', { messageId }, (response) => {
            if (response && response.success) {
                console.log(`[CHAT_DEBUG] Message ${messageId} deleted from Supabase successfully`);
            } else {
                console.error('[CHAT_DEBUG] Failed to delete message from Supabase:', response?.error || 'Unknown error');
            }
        });
    }
    
    // Update deleted message in cache
    _updateDeletedMessageInCache(messageId) {
        // Update in channel messages cache
        Object.keys(this.channelMessages).forEach(channel => {
            const messages = this.channelMessages[channel];
            const messageIndex = messages.findIndex(msg => msg.id === messageId);
            
            if (messageIndex !== -1) {
                messages[messageIndex].is_deleted = true;
                messages[messageIndex].content = '[This message has been deleted]';
            }
        });
        
        // Update in DM conversations cache
        Object.keys(this.dmConversations).forEach(userId => {
            const messages = this.dmConversations[userId];
            const messageIndex = messages.findIndex(msg => msg.id === messageId);
            
            if (messageIndex !== -1) {
                messages[messageIndex].is_deleted = true;
                messages[messageIndex].content = '[This message has been deleted]';
            }
        });
    }
    
    // Helper method to update message grouping after new messages are added
    _updateMessageGrouping() {
        const messages = this.messagesContainer.querySelectorAll('.message:not(.lazy-load-sentinel):not(.date-separator):not(.system-message)');
        
        // Loop through messages to check grouping
        for (let i = 0; i < messages.length - 1; i++) {
            const currentMsg = messages[i];
            const nextMsg = messages[i + 1];
            
            const currentSenderId = currentMsg.getAttribute('data-sender-id');
            const nextSenderId = nextMsg.getAttribute('data-sender-id');
            
            // If they're from the same sender, check timestamps
            if (currentSenderId === nextSenderId) {
                const currentTimestamp = new Date(currentMsg.getAttribute('data-timestamp'));
                const nextTimestamp = new Date(nextMsg.getAttribute('data-timestamp'));
                
                const timeThreshold = 3 * 60 * 1000; // 3 minutes in milliseconds
                const closeInTime = Math.abs(currentTimestamp - nextTimestamp) < timeThreshold;
                
                if (closeInTime) {
                    // Group the next message with the current one
                    nextMsg.classList.add('grouped');
                } else {
                    // Remove grouping if not close in time
                    nextMsg.classList.remove('grouped');
                }
            } else {
                // Remove grouping if different senders
                nextMsg.classList.remove('grouped');
            }
        }
    }
    
    // Helper method to create a message element
    _createMessageElement(message, scrollToBottom = true, isGrouped = false) {
        // Check if message is deleted
        const isDeleted = message.is_deleted === true;
        
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = 'message';
        if (message.senderId === this.currentUser.id) {
            messageEl.classList.add('own-message');
        }
        if (isGrouped) {
            messageEl.classList.add('grouped');
        }
        
        // Ensure visibility with explicit styles
        messageEl.style.visibility = 'visible';
        messageEl.style.opacity = '1';
        messageEl.style.display = 'flex';
        messageEl.setAttribute('data-message-id', message.id || '');
        messageEl.setAttribute('data-sender-id', message.senderId || '');
        
        // Store timestamp for grouping logic
        const timestamp = message.timestamp ? new Date(message.timestamp) : new Date();
        messageEl.setAttribute('data-timestamp', timestamp.toISOString());
        
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
        
        // Format timestamp using our timestamp utilities
        const timeString = window.timestampUtils ? window.timestampUtils.formatTimestamp(timestamp) : timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Create timestamp element
        const timestampElement = document.createElement('span');
        timestampElement.className = 'message-timestamp';
        timestampElement.textContent = timeString;
        timestampElement.setAttribute('data-timestamp', timestamp.toISOString());
        
        // Determine message content
        let messageContent = isDeleted 
            ? '<em class="deleted-message">[This message has been deleted]</em>' 
            : this._formatMessageContent(message.content);
        
        // Build message HTML - Discord style with all messages aligned left
        messageEl.innerHTML = `
            <img src="${avatarUrl}" alt="${sender}" class="message-avatar">
            <div class="message-content">
                ${!isGrouped ? `<div class="message-header">
                    <span class="message-author">${sender}</span>
                    <span class="message-timestamp" data-timestamp="${timestamp.toISOString()}">${timeString}</span>
                </div>` : ''}
                <div class="message-text">${messageContent}</div>
            </div>
            <div class="message-actions">
                <button class="message-actions-btn" title="Message Options">
                    <i class="bi bi-three-dots-vertical"></i>
                </button>
                <div class="message-actions-menu">
                    ${!isDeleted && isCurrentUser ? `<div class="message-action-item danger" data-action="delete">
                        <i class="bi bi-trash"></i>Delete Message
                    </div>` : ''}
                    <div class="message-action-item" data-action="copy">
                        <i class="bi bi-clipboard"></i>Copy Text
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners for message actions
        const actionBtn = messageEl.querySelector('.message-actions-btn');
        const actionMenu = messageEl.querySelector('.message-actions-menu');
        
        if (actionBtn && actionMenu) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Check if this menu is already open
                const isThisMenuOpen = actionMenu.classList.contains('show');
                
                // Close ALL OTHER open menus first
                document.querySelectorAll('.message-actions-menu.show').forEach(menu => {
                    if (menu !== actionMenu) {
                        menu.classList.remove('show');
                    }
                });
                
                // Toggle this menu
                actionMenu.classList.toggle('show');
            });
        }
        
        // Add delete button event listener if it's the current user's message
        if (isCurrentUser && !isDeleted) {
            const deleteAction = messageEl.querySelector('.message-action-item[data-action="delete"]');
            
            if (deleteAction) {
                deleteAction.addEventListener('click', () => {
                    this._deleteMessage(message.id);
                    actionMenu.classList.remove('show');
                });
            }
        }
        
        // Add copy text button event listener
        const copyAction = messageEl.querySelector('.message-action-item[data-action="copy"]');
        if (copyAction && !isDeleted) {
            copyAction.addEventListener('click', () => {
                // Get the raw text content without HTML
                const textToCopy = message.content || '';
                
                // Play copy sound
                this._playCopySound();
                
                // Copy to clipboard
                navigator.clipboard.writeText(textToCopy).then(() => {
                    // Show a temporary tooltip or notification
                    console.log('Text copied to clipboard');
                    
                    // Create and show a temporary tooltip
                    const tooltip = document.createElement('div');
                    tooltip.className = 'copy-tooltip';
                    tooltip.textContent = 'Copied!';
                    document.body.appendChild(tooltip);
                    
                    // Position near the cursor
                    const rect = copyAction.getBoundingClientRect();
                    tooltip.style.top = `${rect.top - 30}px`;
                    tooltip.style.left = `${rect.left}px`;
                    
                    // Remove after a short delay
                    setTimeout(() => {
                        tooltip.remove();
                    }, 1500);
                    
                    // Close the menu
                    actionMenu.classList.remove('show');
                }).catch(err => {
                    console.error('Failed to copy text:', err);
                });
            });
        }
        
        // Add global click handler to close menus (added once, not per message)
        if (!this.hasSetupGlobalClickHandler) {
            document.addEventListener('click', (e) => {
                // Only close if click is outside any message-actions element
                if (!e.target.closest('.message-actions')) {
                    document.querySelectorAll('.message-actions-menu.show').forEach(menu => {
                        menu.classList.remove('show');
                    });
                }
            });
            this.hasSetupGlobalClickHandler = true;
        }
        
        // Register the timestamp element for live updates
        if (window.timestampUtils) {
            const timestampElement = messageEl.querySelector('.message-timestamp');
            if (timestampElement) {
                window.timestampUtils.registerTimestampElement(timestampElement, timestamp.toISOString());
            }
        }
        
        return messageEl;
    }
    
    /**
     * Force a reflow of the DOM to ensure elements are rendered properly
     * @private
     */
    _forceReflow() {
        if (!this.messagesContainer) return;
        
        // Force a reflow by accessing offsetHeight
        void this.messagesContainer.offsetHeight;
        
        // Apply visibility to all messages to ensure they're visible
        const messages = this.messagesContainer.querySelectorAll('.message');
        messages.forEach(msg => {
            // Skip messages with new-loaded class as they have their own animation
            if (!msg.classList.contains('new-loaded')) {
                msg.style.visibility = 'visible';
                msg.style.opacity = '1';
                msg.style.display = 'flex';
            }
        });
        
        // Force another reflow to ensure changes are applied
        void this.messagesContainer.offsetHeight;
    }
    
    /**
     * Show beginning of conversation indicator
     * @private
     */
    _showBeginningIndicator() {
        // Only show the beginning indicator if we truly have no more messages to load
        if (!this.hasMoreMessagesToLoad) {
            // Check if we already have a beginning indicator
            if (document.getElementById('beginning-indicator')) return;
            
            console.log('[CHAT_DEBUG] Showing beginning of conversation indicator');
            
            // Create beginning indicator
            const beginningIndicator = document.createElement('div');
            beginningIndicator.id = 'beginning-indicator';
            beginningIndicator.className = 'beginning-indicator';
            beginningIndicator.textContent = 'Beginning of conversation history';
            
            // Create a container for the beginning indicator to ensure proper positioning
            const indicatorContainer = document.createElement('div');
            indicatorContainer.id = 'beginning-indicator-container';
            indicatorContainer.style.width = '100%';
            indicatorContainer.style.textAlign = 'center';
            indicatorContainer.style.position = 'relative';
            indicatorContainer.style.zIndex = '10';
            indicatorContainer.style.pointerEvents = 'none';
            indicatorContainer.style.marginTop = '10px';
            indicatorContainer.style.marginBottom = '10px';
            indicatorContainer.appendChild(beginningIndicator);
            
            // Add to the beginning of the messages container
            if (this.messagesContainer) {
                // Insert as the first child with proper positioning
                if (this.messagesContainer.firstChild) {
                    this.messagesContainer.insertBefore(indicatorContainer, this.messagesContainer.firstChild);
                } else {
                    this.messagesContainer.appendChild(indicatorContainer);
                }
            }
        } else {
            console.log('[CHAT_DEBUG] Not showing beginning indicator because hasMoreMessagesToLoad is true');
        }
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
    
    // Show emoji picker with enhanced positioning and animation
    showEmojiPicker() {
        if (this.emojiPicker) {
            // Load recent emojis only when opening the picker
            this.recentEmojis = JSON.parse(localStorage.getItem('recentEmojis') || '[]');
            
            // Calculate optimal position for the picker
            const inputRect = this.messageInput.getBoundingClientRect();
            const pickerWidth = 320; // Width of the emoji picker
            const pickerHeight = 400; // Height of the emoji picker
            
            // Calculate best position to ensure it's visible in the viewport
            let left = inputRect.left;
            if (left + pickerWidth > window.innerWidth) {
                left = window.innerWidth - pickerWidth - 10;
            }
            
            // Position above the input if there's enough space, otherwise below
            const spaceAbove = inputRect.top;
            const spaceBelow = window.innerHeight - inputRect.bottom;
            const positionAbove = spaceAbove > pickerHeight || spaceAbove > spaceBelow;
            
            if (positionAbove) {
                this.emojiPicker.style.bottom = `${window.innerHeight - inputRect.top + 10}px`;
                this.emojiPicker.style.top = 'auto';
                this.emojiPicker.style.transformOrigin = 'bottom left';
            } else {
                this.emojiPicker.style.top = `${inputRect.bottom + 10}px`;
                this.emojiPicker.style.bottom = 'auto';
                this.emojiPicker.style.transformOrigin = 'top left';
            }
            
            this.emojiPicker.style.left = `${left}px`;
            
            // Show the picker with smooth animation
            this.emojiPicker.classList.remove('d-none');
            this.emojiPickerVisible = true;
            
            // Focus the search input for better UX
            setTimeout(() => {
                const searchInput = document.getElementById('emoji-search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }, 100);
            
            // Update recent emojis only if the recent category is active
            const activeCategory = document.querySelector('.emoji-category.active');
            if (activeCategory && activeCategory.getAttribute('data-category') === 'recent') {
                this.updateRecentEmojis();
            }
            
            // Add global click handler to close picker when clicking outside
            if (!this._hasEmojiPickerClickOutside) {
                this._emojiPickerClickOutsideHandler = (e) => {
                    if (this.emojiPickerVisible && 
                        !this.emojiPicker.contains(e.target) && 
                        e.target !== this.emojiButton) {
                        this.hideEmojiPicker();
                    }
                };
                
                document.addEventListener('click', this._emojiPickerClickOutsideHandler);
                this._hasEmojiPickerClickOutside = true;
            }
        }
    }
    
    // Hide emoji picker with smooth transition
    hideEmojiPicker() {
        if (this.emojiPicker && this.emojiPickerVisible) {
            // Add class for smooth transition
            this.emojiPicker.classList.add('d-none');
            this.emojiPickerVisible = false;
            
            // Clear search input when hiding
            const searchInput = document.getElementById('emoji-search-input');
            if (searchInput) {
                searchInput.value = '';
                
                // Reset emoji visibility
                document.querySelectorAll('.emoji-btn').forEach(btn => {
                    btn.style.display = '';
                });
            }
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
    
    // Insert emoji into message input with animation
    insertEmoji(emoji) {
        if (this.messageInput) {
            // Create a floating emoji for animation
            this._animateEmojiInsertion(emoji);
            
            // Get cursor position and text
            const cursorPos = this.messageInput.selectionStart;
            const text = this.messageInput.value;
            const newText = text.substring(0, cursorPos) + emoji + text.substring(cursorPos);
            
            // Update input value
            this.messageInput.value = newText;
            this.messageInput.focus();
            this.messageInput.selectionStart = cursorPos + emoji.length;
            this.messageInput.selectionEnd = cursorPos + emoji.length;
            
            // Trigger input event to activate any listeners
            const inputEvent = new Event('input', { bubbles: true });
            this.messageInput.dispatchEvent(inputEvent);
            
            // Add to recent emojis
            this.addToRecentEmojis(emoji);
            
            // Hide emoji picker after selection (optional, Discord-like behavior)
            setTimeout(() => {
                this.hideEmojiPicker();
            }, 100);
        }
    }
    
    // Animate emoji insertion with a floating effect
    _animateEmojiInsertion(emoji) {
        // Create floating emoji element
        const floatingEmoji = document.createElement('div');
        floatingEmoji.className = 'floating-emoji';
        floatingEmoji.textContent = emoji;
        document.body.appendChild(floatingEmoji);
        
        // Get positions for animation
        const emojiPickerRect = this.emojiPicker.getBoundingClientRect();
        const inputRect = this.messageInput.getBoundingClientRect();
        
        // Set initial position (center of emoji picker)
        floatingEmoji.style.left = `${emojiPickerRect.left + emojiPickerRect.width / 2}px`;
        floatingEmoji.style.top = `${emojiPickerRect.top + emojiPickerRect.height / 2}px`;
        
        // Animate to input position
        setTimeout(() => {
            floatingEmoji.style.left = `${inputRect.left + inputRect.width / 2}px`;
            floatingEmoji.style.top = `${inputRect.top + inputRect.height / 2}px`;
            floatingEmoji.style.opacity = '0';
            floatingEmoji.style.transform = 'scale(0.5)';
        }, 10);
        
        // Remove after animation completes
        setTimeout(() => {
            if (floatingEmoji.parentNode) {
                floatingEmoji.remove();
            }
        }, 500);
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
    
    // ... rest of the code remains the same ...
}
