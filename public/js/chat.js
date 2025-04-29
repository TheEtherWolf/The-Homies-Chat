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
    }

    // Initialize chat manager with user data
    initialize(user) {
        console.log('[CHAT_DEBUG] ChatManager initialize called with user:', user);
        
        if (this.isInitialized) {
            console.log('[CHAT_DEBUG] ChatManager already initialized, skipping...');
            return;
        }
        
        // Store the current user
        this.currentUser = user;
        
        // Update UI with user name
        if (this.currentUserDisplay) {
            this.currentUserDisplay.textContent = user.username;
        }
        
        // Attach event listeners for UI interactions
        this.attachEventListeners();
        console.log('[CHAT_DEBUG] All event listeners attached');

        // Setup socket listeners (will handle connection logic and other specific listeners)
        this._setupSocketListeners();

        // Set flag to indicate we need to fetch data when socket connects
        this.needsInitialDataFetch = true;

        // Begin with the general channel
        this.switchChannel('general');

        // Set initialization flag
        this.isInitialized = true;
        console.log('[CHAT_DEBUG] ChatManager successfully initialized.');
    }

    // Centralized method to setup all socket listeners
    _setupSocketListeners() {
        console.log('[CHAT_DEBUG] Setting up socket listeners');
        
        // --- Connection Events ---
        this.socket.on('connect', () => this.handleSocketConnect());
        this.socket.on('disconnect', (reason) => this.handleSocketDisconnect(reason));
        this.socket.on('reconnect', () => this.handleReconnect());
        
        // --- User Events ---
        this.socket.on('user-connected', (data) => this.handleUserConnected(data));
        this.socket.on('user-disconnected', (data) => this.handleUserDisconnected(data));
        this.socket.on('user-list', (users) => this.handleUserList(users));
        
        // --- Message Events ---
        this.socket.on('message', (message) => this.handleIncomingMessage(message));
        this.socket.on('message-history', (data) => this.handleMessageHistory(data));
        this.socket.on('message-saved', (confirmedMessage) => this.handleMessageConfirmation(confirmedMessage));
        this.socket.on('message-deleted', (data) => {
            console.log('[CHAT_DEBUG] Message deleted:', data);
            // Remove from UI if present
            const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
            if (messageElement) messageElement.remove();
        });
        
        // --- Friend Request Events ---
        this.socket.on('friend-request-received', (data) => this.handleIncomingFriendRequest(data));
        this.socket.on('friend-request-accepted', (data) => {
            console.log('[CHAT_DEBUG] Friend request accepted:', data);
            this.displaySystemMessage(`${data.username} accepted your friend request!`);
            this.populateDMList(); // Refresh DM list
        });
        this.socket.on('friend-request-rejected', (data) => {
            console.log('[CHAT_DEBUG] Friend request rejected:', data);
            this.displaySystemMessage(`${data.username} rejected your friend request.`);
        });
        this.socket.on('friend-status-update', (data) => {
            console.log('[CHAT_DEBUG] Friend status update:', data);
            // Update friend status in UI
            const dmItem = document.querySelector(`.dm-item[data-user-id="${data.userId}"]`);
            if (dmItem) {
                const statusIndicator = dmItem.querySelector('.dm-status');
                if (statusIndicator) {
                    statusIndicator.className = 'dm-status ' + data.status;
                }
            }
        });
        
        // Setup friend-specific listeners
        this._setupFriendSocketListeners();
    }

    // Setup listeners specifically for friend-related events
    _setupFriendSocketListeners() {
        if (!this.socket) return;
        console.log('[CHAT_DEBUG] Setting up FRIEND socket listeners...');

        // Listen for the initial friend list pushed by the server
        this.socket.on('friend-list', (friends) => {
            console.log('[CHAT_DEBUG] Received friend-list:', friends);
            this.friendships = {}; // Clear existing data

            if (!this.currentUser || !this.currentUser.id) {
                console.error('[CHAT_ERROR] Cannot process friend list without current user ID.');
                return;
            }

            if (Array.isArray(friends)) {
                friends.forEach(friendship => {
                    // Determine the ID of the *other* user in the relationship
                    const otherUserId = friendship.user_id_1 === this.currentUser.id 
                                        ? friendship.user_id_2 
                                        : friendship.user_id_1;
                    
                    // Use the other user's ID as the key in our friendships map
                    this.friendships[otherUserId] = {
                        friendship_id: friendship.id,
                        friend_id: otherUserId,
                        friend_username: friendship.friend_username, // Server should provide joined username
                        friend_avatar_url: friendship.friend_avatar_url, // Server should provide joined avatar
                        friend_status: friendship.friend_status, // Server should provide joined status
                        friendship_status: friendship.status, // 'pending' or 'accepted'
                        since: friendship.updated_at || friendship.created_at,
                        // Determine if a pending request is incoming (sent *to* us)
                        is_pending_incoming: friendship.status === 'pending' && friendship.user_id_2 === this.currentUser.id
                    };
                });
            } else {
                console.warn('[CHAT_WARN] Received non-array data for friend-list:', friends);
            }

            // Update the UI based on the processed list
            this._updateFriendUI(); 
        });

        // Listen for new incoming friend requests
        this.socket.on('friend-request-received', (requestData) => {
            console.log('[CHAT_DEBUG] Received friend-request-received:', requestData);

            if (!requestData || !requestData.senderId || !requestData.friendshipId) {
                console.error('[CHAT_ERROR] Invalid data received for friend-request-received:', requestData);
                return;
            }

            // Add/Update the friendships state with the pending request
            this.friendships[requestData.senderId] = {
                friendship_id: requestData.friendshipId,
                friend_id: requestData.senderId,
                friend_username: requestData.senderUsername || 'User', // Use provided username or default
                friendship_status: 'pending', // Mark as pending
                is_pending_incoming: true, // Mark as incoming
                since: new Date().toISOString()
                // Avatar/Status might be missing; UI should handle defaults
            };

            // Update the UI to reflect the new pending request
            this._updateFriendUI();

            // Show a notification to the user
            // TODO: Replace alert with a better UI notification (e.g., toast, badge)
            alert(`New friend request from ${requestData.senderUsername || 'a user'}!`);
        });

        // Listen for updates (e.g., request accepted, friend status change)
        this.socket.on('friend-update', (friendshipData) => {
            console.log('[CHAT_DEBUG] Received friend-update:', friendshipData);

            if (!friendshipData || !friendshipData.friend_id) {
                console.error('[CHAT_ERROR] Invalid data received for friend-update:', friendshipData);
                return;
            }

            const friendId = friendshipData.friend_id;

            // Update or add the entry in our local state using object spread
            this.friendships[friendId] = { 
                ...this.friendships[friendId], // Keep existing data if any
                ...friendshipData // Overwrite with new data
            };

            // If this update marks the friendship as accepted, ensure is_pending_incoming is false
            if (this.friendships[friendId].friendship_status === 'accepted') {
                this.friendships[friendId].is_pending_incoming = false; 
            }

            // Update the UI
            this._updateFriendUI(); 

            // Optional: Notify user specifically about acceptance
            if(friendshipData.friendship_status === 'accepted') {
                console.log(`Friendship status with ${friendshipData.friend_username || friendId} updated to accepted.`);
                // You might want a less intrusive notification than an alert here
                // alert(`You are now friends with ${friendshipData.friend_username || friendId}!`); 
            }
        });

        // Listen for when a friend is removed or request rejected/canceled
        this.socket.on('friend-removed', (data) => {
            console.log('[CHAT_DEBUG] Received friend-removed:', data);

            if (!data || !data.friendId) {
                console.error('[CHAT_ERROR] Invalid data received for friend-removed:', data);
                return;
            }

            const removedFriendId = data.friendId; // ID of the *other* user involved

            if (this.friendships[removedFriendId]) {
                const removedUsername = this.friendships[removedFriendId].friend_username || 'User';
                
                // Remove the friendship entry from our local state
                delete this.friendships[removedFriendId];

                // Update the UI
                this._updateFriendUI();

                // Notify the user
                console.log(`Friendship with ${removedUsername} (${removedFriendId}) ended.`);
                // TODO: Replace alert with a better UI notification
                alert(`Friendship with ${removedUsername} ended.`);
            } else {
                console.warn(`[CHAT_WARN] Received friend-removed for ID ${removedFriendId}, but no matching friendship found.`);
            }

            // If currently chatting with the removed friend, switch back to general channel
            if (this.isDMMode && this.currentDmRecipientId === removedFriendId) {
                console.log(`Currently in DM with removed friend ${removedFriendId}, switching to general channel.`);
                this.switchChannel('general'); 
            }
        });
    }

    // Placeholder for updating the actual friends UI
    _updateFriendUI() {
        console.log('[CHAT_DEBUG] Updating friend UI (placeholder)... Current friendships:', this.friendships);
        // Logic to re-render DM list/friends section will go here.
        this.populateDMList(); // Call the existing function for now
    }

    // Helper function to get a default avatar URL
    getDefaultAvatar(userId) {
        // Simple placeholder - replace with a proper default avatar or generation logic
        // Maybe use a service like Gravatar or generate based on ID?
        return 'img/Default-Avatar.png'; // Ensure this path is correct and image exists
    }

    // Populate the DM/Friends list in the sidebar (Minimal Version)
    populateDMList() {
        if (!this.dmListContainer) {
            console.error("[CHAT_ERROR] DM List Container not found.");
            return;
        }
        console.log('[CHAT_DEBUG] Populating DM/Friends list (Minimal) - Current friendships:', this.friendships);

        // 1. Clear existing list content
        this.dmListContainer.innerHTML = '';

        // 2. Add a main header for the section
        const friendsHeader = document.createElement('h3');
        friendsHeader.textContent = 'Direct Messages';
        friendsHeader.classList.add('sidebar-header');
        this.dmListContainer.appendChild(friendsHeader);

        // 3. Check if we have friendships data
        const friendIds = Object.keys(this.friendships);
        
        if (friendIds.length === 0) {
            // No friends yet, show placeholder
            const placeholderMsg = document.createElement('p');
            placeholderMsg.textContent = 'No friends yet';
            placeholderMsg.classList.add('sidebar-placeholder');
            this.dmListContainer.appendChild(placeholderMsg);
            return;
        }

        // 4. Log the data (for now)
        console.log('[CHAT_DEBUG] Friendships data:', JSON.stringify(this.friendships, null, 2));

        // Loop through friendships and add accepted friends to the list
        for (const friendId in this.friendships) {
            const friendship = this.friendships[friendId];
            
            // Only show accepted friendships
            if (friendship.friendship_status === 'accepted') {
                const friendUsername = friendship.friend_username || 'Unknown User';
                
                // Create list item
                const dmItem = document.createElement('div');
                dmItem.className = 'sidebar-item dm-item';
                dmItem.setAttribute('data-user-id', friendId);
                
                // Add content
                dmItem.innerHTML = `<span>${this.sanitizeHTML(friendUsername)}</span>`;
                
                // Add click event handler
                dmItem.addEventListener('click', () => {
                    console.log(`[CHAT_DEBUG] DM item clicked: ${friendUsername}`);
                    this.openDM(friendUsername);
                });
                
                // Add to container
                this.dmListContainer.appendChild(dmItem);
            }
        }

        console.log('[CHAT_DEBUG] DM/Friends list cleared and header added.');
        // Iteration and item creation will be added in the next step.
    }

    // Set up click handlers for channels
    setupChannelHandlers() {
        const channelItems = document.querySelectorAll('.channel-item');
        channelItems.forEach(item => {
            // Update: Always use hashtag version for channel name
            let channelName = item.querySelector('span').textContent.trim();
            if (!channelName.startsWith('#')) channelName = `#${channelName}`;
            item.addEventListener('click', () => this.switchChannel(channelName));
        });
        
        // Set up DM item click handlers
        const dmItems = document.querySelectorAll('.dm-item');
        dmItems.forEach(item => {
            item.addEventListener('click', () => {
                const username = item.querySelector('span').textContent.trim();
                this.openDM(username);
            });
        });
    }
    
    // Switch to a specific channel
    switchChannel(channelName) {
        // Always normalize channel name to have hashtag
        if (!channelName.startsWith('#') && !channelName.startsWith('dm_')) {
            channelName = `#${channelName}`;
        }
        console.log(`[CHAT_DEBUG] Switching to channel: ${channelName}`);

        // Update UI active state
        // Deactivate all DMs first
        const allDmItems = document.querySelectorAll('.dm-item');
        allDmItems.forEach(item => item.classList.remove('active'));
        
        // Activate/deactivate channel items
        const allChannelItems = document.querySelectorAll('.channel-item');
        allChannelItems.forEach(item => {
            let itemName = item.getAttribute('data-channel') || item.querySelector('span').textContent.trim();
            if (!itemName.startsWith('#')) itemName = `#${itemName}`;
            if (itemName === channelName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Update header
        if (this.chatTitle) {
            this.chatTitle.textContent = channelName;
        }
        
        // Update state
        this.currentChannel = channelName;
        this.inGeneralChat = (channelName === '#general');
        this.currentDmRecipientId = null;
        
        // Clear message container
        this.clearMessagesContainer();
        
        // Display system message while loading
        this.displaySystemMessage(`Loading messages for ${channelName}...`);
        
        // Always request fresh messages from server
        // Strip the # from the channel name when sending to server
        const serverChannelName = channelName.startsWith('#') ? channelName.substring(1) : channelName;
        console.log(`[CHAT_DEBUG] Requesting messages for channel: ${serverChannelName}`);
        this.socket.emit('get-messages', { channel: serverChannelName });
        
        // Update input placeholder
        if (this.messageInput) {
            this.messageInput.placeholder = `Message ${channelName}`;
            this.messageInput.disabled = false;
            this.messageInput.focus();
        }
    }
    
    // Open a direct message conversation
    openDM(username) {
        console.log('[CHAT_DEBUG] Opening DM with:', username);
        
        // Prevent DMing yourself
        if (username === this.currentUser.username) {
            console.log('[CHAT_DEBUG] Cannot DM yourself');
            alert('You cannot send a direct message to yourself.');
            return;
        }
        
        // Check if this user is in your friends list
        const isFriend = this.friendships[username];
        if (!isFriend) {
            console.log('[CHAT_DEBUG] Cannot DM non-friend');
            this.showAddFriendModal(username);
            return;
        }
        
        // Find the user by username
        let recipientUser = null;
        
        // Search for user in our list
        for (const userId in this.allUsers) {
            if (this.allUsers[userId].username === username) {
                recipientUser = this.allUsers[userId];
                break;
            }
        }
        
        // If user not found in the list, create a persistent user record
        if (!recipientUser) {
            console.log('[CHAT_DEBUG] User not found in list, fetching from database or creating permanent record');
            
            // First try to fetch from database by username
            this.socket.emit('find-user-by-username', { username }, (response) => {
                if (response && response.success && response.user) {
                    // User found in database
                    recipientUser = response.user;
                    this.allUsers[recipientUser.id] = recipientUser;
                    this.continueOpeningDM(recipientUser);
                } else {
                    // User not in database, create a new persistent record
                    this.socket.emit('create-user-record', { 
                        username, 
                        status: 'offline',
                        isTemporary: false
                    }, (response) => {
                        if (response && response.success && response.user) {
                            recipientUser = response.user;
                            this.allUsers[recipientUser.id] = recipientUser;
                            this.continueOpeningDM(recipientUser);
                        } else {
                            // Fallback to local temporary user if server creation fails
                            this.createTemporaryUserAndOpenDM(username);
                        }
                    });
                }
            });
            
            return; // Return here as the continuation will happen in the callbacks
        }
        
        // If we already have the user, continue with opening the DM
        this.continueOpeningDM(recipientUser);
    }
    
    // Create a temporary user as fallback
    createTemporaryUserAndOpenDM(username) {
        console.log('[CHAT_DEBUG] Creating fallback temporary user for', username);
        
        // Store user ID in localStorage to make it somewhat persistent
        let tempUserId = localStorage.getItem(`temp_user_${username}`);
        
        if (!tempUserId) {
            tempUserId = 'temp-' + Date.now();
            localStorage.setItem(`temp_user_${username}`, tempUserId);
        }
        
        // Create temporary user
        const recipientUser = {
            id: tempUserId,
            username: username,
            status: 'offline',
            isTemporary: true
        };
        
        // Add to user list
        this.allUsers[tempUserId] = recipientUser;
        
        // Continue with opening the DM
        this.continueOpeningDM(recipientUser);
    }
    
    // Continue opening the DM with a valid user object
    continueOpeningDM(recipientUser) {
        // Create a consistent DM channel name (sorted IDs to ensure the same channel name regardless of sender/receiver)
        const userIds = [this.currentUser.id, recipientUser.id].sort();
        const dmChannelName = `dm_${userIds[0]}_${userIds[1]}`;
        
        // Update state
        this.currentDmRecipientId = recipientUser.id;
        this.inGeneralChat = false;
        this.currentChannel = dmChannelName; // Use the DM channel name
        
        // Update UI
        if (this.chatTitle) {
            this.chatTitle.textContent = `@${recipientUser.username}`;
        }
        
        // Clear messages container
        this.clearMessagesContainer();
        
        // Display cached DM messages if available
        if (this.channelMessages[dmChannelName] && this.channelMessages[dmChannelName].length > 0) {
            console.log(`[CHAT_DEBUG] Displaying ${this.channelMessages[dmChannelName].length} cached messages for DM with ${recipientUser.username}`);
            this.channelMessages[dmChannelName].forEach(msg => this.displayMessageInUI(msg, dmChannelName));
        } else {
            this.displaySystemMessage(`This is the beginning of your conversation with ${recipientUser.username}`);
        }
        
        // Request DM history from server
        console.log(`[CHAT_DEBUG] Requesting messages for DM channel: ${dmChannelName}`);
        this.socket.emit('get-messages', { 
            channel: dmChannelName,
            isDM: true,
            participants: [this.currentUser.id, recipientUser.id]
        });
        
        // Mark conversation as active in UI
        this.updateActiveDM(recipientUser.username);
        
        // Add to the UI for easy access if not already there
        this.addDMToSidebar(recipientUser);
    }
    
    // Add a DM to the sidebar if it doesn't exist
    addDMToSidebar(user) {
        const dmList = document.getElementById('dm-list');
        if (!dmList) return;
        
        // Check if this DM already exists in the sidebar
        const existingDM = Array.from(dmList.querySelectorAll('.dm-item')).find(item => {
            return item.querySelector('span').textContent === user.username;
        });
        
        if (!existingDM) {
            console.log(`[CHAT_DEBUG] Adding ${user.username} to DM sidebar`);
            
            // Create the DM item
            const dmItem = document.createElement('div');
            dmItem.className = 'dm-item';
            dmItem.innerHTML = `
                <div class="dm-avatar">
                    <img src="https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1744642336378" alt="${user.username} Avatar">
                    <div class="dm-status ${user.status || 'offline'}"></div>
                </div>
                <span>${user.username}</span>
            `;
            
            // Add click event to open the DM
            dmItem.addEventListener('click', () => {
                this.openDM(user.username);
            });
            
            // Add to the list
            dmList.appendChild(dmItem);
        }
    }
    
    // Update the active DM in the UI
    updateActiveDM(username) {
        // First, remove active class from all DM items and channels
        const allDmItems = document.querySelectorAll('.dm-item');
        allDmItems.forEach(item => item.classList.remove('active'));
        
        const allChannelItems = document.querySelectorAll('.channel-item');
        allChannelItems.forEach(item => item.classList.remove('active'));
        
        // Then find and activate the matching DM item
        let found = false;
        allDmItems.forEach(item => {
            const itemUsername = item.querySelector('span').textContent.trim();
            if (itemUsername === username) {
                item.classList.add('active');
                found = true;
            }
        });
        
        // If the DM isn't in the list yet, add it
        if (!found) {
            this.addDmToList(username);
        }
        
        // Re-attach click handlers for DM items to ensure they're clickable
        this.setupChannelHandlers();
    }
    
    // Add a DM to the list if it doesn't exist
    addDmToList(username) {
        // Check if this DM is already in the list
        const allDmItems = document.querySelectorAll('.dm-item');
        for (const item of allDmItems) {
            const itemUsername = item.querySelector('span').textContent.trim();
            if (itemUsername === username) {
                return; // Already exists
            }
        }
        
        // Create new DM item
        const dmListContainer = document.getElementById('dm-list');
        const dmItem = document.createElement('div');
        dmItem.className = 'dm-item';
        dmItem.innerHTML = `
            <div class="dm-avatar">
                <img src="https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1744642336378" alt="User Avatar">
                <div class="dm-status"></div>
            </div>
            <span>${username}</span>
        `;
        
        // Add click handler
        dmItem.addEventListener('click', () => {
            this.openDM(username);
        });
        
        // Add to the list
        dmListContainer.appendChild(dmItem);
    }

    // Helper method to get user ID by username
    getUserIdByUsername(username) {
        for (const userId in this.allUsers) {
            if (this.allUsers[userId].username === username) {
                return userId;
            }
        }
        return null;
    }

    // Toggle emoji picker visibility
    toggleEmojiPicker() {
        if (this.emojiPicker) {
            this.emojiPicker.classList.toggle('d-none');
            
            // Position the emoji picker relative to the emoji button
            if (!this.emojiPicker.classList.contains('d-none')) {
                const buttonRect = this.emojiButton.getBoundingClientRect();
                this.emojiPicker.style.bottom = `${window.innerHeight - buttonRect.top + 10}px`;
                this.emojiPicker.style.left = `${buttonRect.left}px`;
            }
        }
    }
    
    // Insert an emoji at cursor position
    insertEmoji(emoji) {
        if (!this.messageInput) return;
        
        const cursorPos = this.messageInput.selectionStart;
        const textBefore = this.messageInput.value.substring(0, cursorPos);
        const textAfter = this.messageInput.value.substring(cursorPos);
        
        this.messageInput.value = textBefore + emoji + textAfter;
        
        // Set cursor position after the inserted emoji
        this.messageInput.selectionStart = cursorPos + emoji.length;
        this.messageInput.selectionEnd = cursorPos + emoji.length;
        this.messageInput.focus();
        
        // Hide emoji picker after selection
        if (this.emojiPicker) {
            this.emojiPicker.classList.add('d-none');
        }
    }

    // Update current user display in sidebar
    updateCurrentUserDisplay() {
        if (this.currentUserDisplay && this.currentUser) {
            this.currentUserDisplay.textContent = this.currentUser.username;
            
            // Update user ID display if available
            const userIdElement = document.querySelector('.user-id');
            if (userIdElement) {
                userIdElement.textContent = `@${this.currentUser.username}`;
            }
        }
    }

    // Attach all event listeners
    attachEventListeners() {
        console.log('[CHAT_DEBUG] Attaching event listeners...');
        
        // --- Message Sending ---
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent textarea newline
                this.sendMessage();
            }
        });
        
        // --- Channel Switching ---
        document.querySelectorAll('.channel-item').forEach(channel => {
            channel.addEventListener('click', () => {
                const channelName = channel.getAttribute('data-channel');
                this.switchChannel(channelName);
            });
        });
        
        // --- Add Server Icon Click Handlers ---
        const dmServerIcon = document.getElementById('dm-server-icon');
        if (dmServerIcon) {
            dmServerIcon.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] DM server icon clicked');
                this.showDMInterface();
            });
        }

        // Add group chat icon handler to go back to channels
        const groupServerIcon = document.querySelector('.server-icon:first-of-type');
        if (groupServerIcon) {
            groupServerIcon.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Group server icon clicked');
                this.showChannelsInterface();
                this.switchChannel('general');
            });
        }
        
        // --- DM Handling ---
        document.querySelectorAll('.dm-item').forEach(dm => {
            dm.addEventListener('click', () => {
                const username = dm.querySelector('span').textContent;
                this.openDM(username);
            });
        });
        
        // --- Friend Request Handling ---
        const addFriendBtn = document.getElementById('add-friend-btn');
        if (addFriendBtn) {
            addFriendBtn.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Add friend button clicked');
                this.showAddFriendModal();
            });
        }
        
        // Send friend request button
        const sendFriendRequestBtn = document.getElementById('send-friend-request-btn');
        if (sendFriendRequestBtn) {
            sendFriendRequestBtn.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Send friend request button clicked');
                this.sendFriendRequest();
            });
        }
        
        // Accept friend request button in notification modal
        const acceptFriendRequestBtn = document.getElementById('accept-friend-request-btn');
        if (acceptFriendRequestBtn) {
            acceptFriendRequestBtn.addEventListener('click', () => {
                const username = document.getElementById('friend-request-username').textContent;
                this.acceptFriendRequest(username);
                
                // Close the modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('friend-request-notification-modal'));
                if (modal) modal.hide();
            });
        }
        
        // Reject friend request button in notification modal
        const rejectFriendRequestBtn = document.getElementById('reject-friend-request-btn');
        if (rejectFriendRequestBtn) {
            rejectFriendRequestBtn.addEventListener('click', () => {
                const username = document.getElementById('friend-request-username').textContent;
                this.rejectFriendRequest(username);
            });
        }
        
        // --- Emoji Picker ---
        this.emojiButton.addEventListener('click', this.toggleEmojiPicker);
        
        // Add click handlers to all emoji buttons
        this.emojiButtons.forEach(btn => {
            btn.addEventListener('click', () => this.insertEmoji(btn.textContent));
        });
        
        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (this.emojiPicker && !this.emojiPicker.classList.contains('d-none') && 
                !this.emojiPicker.contains(e.target) && e.target !== this.emojiButton) {
                this.emojiPicker.classList.add('d-none');
            }
        });
        
        // --- Settings and Logout ---
        if (this.settingsButton) {
            this.settingsButton.addEventListener('click', () => {
                alert('Settings feature coming soon!');
            });
        }
        
        // Add event listeners for channel creation UI
        const addChannelBtn = document.getElementById('add-channel-btn');
        if (addChannelBtn) {
            addChannelBtn.addEventListener('click', () => {
                // Show the create channel modal
                const modal = new bootstrap.Modal(document.getElementById('create-channel-modal'));
                modal.show();
            });
        }
        
        // Add event listener for create channel submit button
        const createChannelSubmit = document.getElementById('create-channel-submit');
        if (createChannelSubmit) {
            createChannelSubmit.addEventListener('click', this.handleCreateChannelUI.bind(this));
        }
        
        // Listen for new channel creation from server
        this.socket.on('channel-created', (channel) => {
            console.log('[CHAT_DEBUG] New channel created:', channel);
            this.addChannelToUI(channel);
        });
        
        // Listen for channels list update
        this.socket.on('channels-list', (data) => {
            console.log('[CHAT_DEBUG] Received channels list:', data);
            
            // Update channels in UI
            if (data.channels && Array.isArray(data.channels)) {
                data.channels.forEach(channel => {
                    this.addChannelToUI(channel);
                });
            }
        });
        
        // Socket event listeners
        this.socket.on('connect', this.handleSocketConnect);
        this.socket.on('disconnect', this.handleSocketDisconnect);
        this.socket.on('user-connected', this.handleUserConnected.bind(this));
        this.socket.on('user-disconnected', this.handleUserDisconnected.bind(this));
        this.socket.on('chat-message', this.handleIncomingMessage.bind(this));
        this.socket.on('message-history', this.handleMessageHistory.bind(this));
        this.socket.on('user-list', this.handleUserList.bind(this));
        this.socket.on('general-messages', this.handleGeneralMessages.bind(this));
        this.socket.on('channel-messages', this.handleChannelMessages.bind(this));
        this.socket.on('message-sent', this.handleMessageConfirmation.bind(this)); // Add for chat messages
        this.socket.on('dm-sent-confirmation', this.handleMessageConfirmation.bind(this)); // Add for direct messages
        this.socket.on('message-error', (errorData) => {
            console.error('[CHAT_ERROR] Received message error from server:', errorData);
            // --- Placeholder for error handling logic ---
            // We will implement the logic to update the UI (e.g., mark message as failed) later.
        });
        
        console.log('[CHAT_DEBUG] All event listeners attached');
        
        // Friend code buttons
        const generateFriendCodeBtn = document.getElementById('generate-friend-code-btn');
        if (generateFriendCodeBtn) {
            generateFriendCodeBtn.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Generate friend code button clicked');
                this.generateFriendCode();
            });
        }
        
        const copyFriendCodeBtn = document.getElementById('copy-friend-code-btn');
        if (copyFriendCodeBtn) {
            copyFriendCodeBtn.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Copy friend code button clicked');
                this.copyFriendCode();
            });
        }
        
        const sendFriendRequestByCodeBtn = document.getElementById('send-friend-request-by-code-btn');
        if (sendFriendRequestByCodeBtn) {
            sendFriendRequestByCodeBtn.addEventListener('click', () => {
                console.log('[CHAT_DEBUG] Send friend request by code button clicked');
                this.sendFriendRequestByCode();
            });
        }
    }

    // Handle socket connection
    handleSocketConnect() {
        console.log('[CHAT_DEBUG] Socket connected');
        this.isSocketConnected = true;
        
        if (this.needsInitialDataFetch) {
            this.performInitialDataFetch();
        }
        
        this.displaySystemMessage('Connected to server');
    }
    
    // Handle socket disconnect
    handleSocketDisconnect(reason) {
        console.log(`[CHAT_DEBUG] Socket disconnected: ${reason}`);
        this.isSocketConnected = false;
        this.displaySystemMessage('Disconnected from server');
    }
    
    // Perform initial data fetch
    performInitialDataFetch() {
        console.log('[CHAT_DEBUG] Performing initial data fetch');
        
        // Request user list
        this.socket.emit('get-users');
        
        // Join default channel
        this.socket.emit('join-channel', { channel: 'general' });
        
        // Request general messages
        this.socket.emit('get-general-messages');
        
        this.needsInitialDataFetch = false;
    }
    
    // Handle reconnection
    handleReconnect() {
        console.log('[CHAT_DEBUG] Handling reconnect');
        this.isSocketConnected = true;
        this.performInitialDataFetch();
    }
    
    // Open General chat
    openGeneralChat() {
        this.switchChannel('general');
    }
    
    // Handle user connected event
    handleUserConnected(data) {
        console.log(`[CHAT_DEBUG] User connected: ${data.username}`);
        
        // Add user to allUsers if not already there
        if (data.id && data.username) {
            this.allUsers[data.id] = {
                id: data.id,
                username: data.username,
                status: 'online'
            };
        }
        
        this.displaySystemMessage(`${data.username} connected`);
        this.updateUserList();
    }
    
    // Handle user disconnected event
    handleUserDisconnected(data) {
        console.log(`[CHAT_DEBUG] User disconnected: ${data.username}`);
        
        // Update user status
        if (data.id && this.allUsers[data.id]) {
            this.allUsers[data.id].status = 'offline';
        }
        
        this.displaySystemMessage(`${data.username} disconnected`);
        this.updateUserList();
    }
    
    // Handle incoming message
    handleIncomingMessage(message) {
        console.log('[CHAT_DEBUG] Received message:', message);
        
        if (!message) return;
        
        // Make sure we have a channel property
        if (!message.channel && message.isGeneralMessage) {
            message.channel = 'general';
        }
        
        // Generate a unique message ID if it doesn't have one
        if (!message.id) {
            message.id = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        // Store the sender info in allUsers if not already present
        if (message.senderId && message.sender && !this.allUsers[message.senderId]) {
            this.allUsers[message.senderId] = {
                id: message.senderId,
                username: message.sender,
                status: 'online'
            };
            // Update UI with new user
            this.updateUserList();
        }
        
        // Initialize channel if needed
        if (message.channel && !this.channelMessages[message.channel]) {
            this.channelMessages[message.channel] = [];
        }
        
        // Check for duplicates in cache AND DOM
        const isDuplicateInCache = message.channel && 
            this.channelMessages[message.channel] && 
            this.channelMessages[message.channel].some(existingMsg => 
                (existingMsg.id && existingMsg.id === message.id) || 
                (existingMsg.timestamp === message.timestamp && 
                 existingMsg.sender === message.sender && 
                 existingMsg.content === message.content));
        
        // Check if message is already in the DOM
        const isDuplicateInDOM = message.id && 
            document.querySelector(`[data-message-id="${message.id}"]`) !== null;
                
        if (isDuplicateInCache || isDuplicateInDOM) {
            console.log(`[CHAT_DEBUG] Skipping duplicate message with ID: ${message.id}`);
            return;
        }
        
        // Handle different message types
        if (message.channel === 'general' || message.isGeneralMessage) {
            // General chat message
            // Ensure generalChatMessages is initialized (should be in constructor, but good practice)
            if (!Array.isArray(this.generalChatMessages)) {
                console.warn('[CHAT_WARN] generalChatMessages was not an array. Initializing.');
                this.generalChatMessages = [];
            }
            this.generalChatMessages.push(message);

            if (this.inGeneralChat || this.currentChannel === 'general') {
                this.displayMessageInUI(message, 'general');
            }
        } else if (message.channel && message.channel.startsWith('dm_')) {
            // DM message - format is dm_userId1_userId2
            // Store in the channel messages
            // Ensure the array exists before pushing
            if (!Array.isArray(this.channelMessages[message.channel])) {
                console.log(`[CHAT_DEBUG] Initializing message array for DM channel: ${message.channel}`);
                this.channelMessages[message.channel] = [];
            }
            this.channelMessages[message.channel].push(message);

            const userIds = message.channel.replace('dm_', '').split('_');
            const otherUserId = userIds[0] === this.currentUser.id ? 
                userIds[1] : userIds[0];
            
            // If this is the current conversation, display it
            if (this.currentChannel === message.channel) {
                this.displayMessageInUI(message, message.channel);
            } else {
                // Notify user of new message
                this.showUnreadIndicator(otherUserId);
            }
        } else if (message.channel) {
            // Regular channel message
            // Ensure the array exists before pushing
            if (!Array.isArray(this.channelMessages[message.channel])) {
                 console.log(`[CHAT_DEBUG] Initializing message array for channel: ${message.channel}`);
                this.channelMessages[message.channel] = [];
            }
            this.channelMessages[message.channel].push(message);

            if (this.currentChannel === message.channel) {
                this.displayMessageInUI(message, message.channel);
            }
        }
    }
    
    // Handle message history
    handleMessageHistory(data) {
        console.log('[CHAT_DEBUG] Received message-history:', data);
        
        if (!data || !data.channel || !Array.isArray(data.messages)) {
            console.log('[CHAT_DEBUG] Invalid message history data:', data);
            this.displaySystemMessage('No messages found for this channel.');
            return;
        }
        
        // Normalize channel name to include hashtag for public channels
        let channelName = data.channel;
        if (!channelName.startsWith('#') && !channelName.startsWith('dm_')) {
            channelName = `#${channelName}`;
        }
        
        console.log(`[CHAT_DEBUG] Processing ${data.messages.length} messages for channel: ${channelName}`);
        
        // Cache messages for this channel
        this.channelMessages[channelName] = data.messages;
        
        // If this is the current channel, render messages
        if (this.currentChannel === channelName) {
            this.clearMessagesContainer();
            
            if (data.messages.length === 0) {
                this.displaySystemMessage('No messages yet. Start the conversation!');
            } else {
                data.messages.forEach(msg => {
                    // Ensure message has proper format
                    const formattedMsg = {
                        id: msg.id,
                        sender: msg.sender || msg.username || 'Unknown User',
                        username: msg.username || msg.sender || 'Unknown User',
                        senderId: msg.sender_id || msg.senderId,
                        content: msg.content || msg.message || '',
                        timestamp: msg.created_at || msg.timestamp,
                        channel: channelName
                    };
                    
                    this.displayMessageInUI(formattedMsg);
                });
            }
            
            this.scrollToBottom();
        }
    }
    
    // Handle general messages
    handleGeneralMessages(messages) {
        console.log('[CHAT_DEBUG] Received general messages:', messages);
        
        if (!messages || !Array.isArray(messages)) return;
        
        this.generalChatMessages = messages;
        
        if (this.inGeneralChat) {
            this.clearMessagesContainer();
            messages.forEach(msg => this.displayMessageInUI(msg, 'general'));
        }
    }
    
    // Handle channel messages
    handleChannelMessages(data) {
        console.log('[CHAT_DEBUG] Received channel messages:', data);
        
        if (!data || !data.channel || !data.messages) return;
        
        this.channelMessages[data.channel] = data.messages;
        
        if (this.currentChannel === data.channel) {
            this.clearMessagesContainer();
            data.messages.forEach(msg => this.displayMessageInUI(msg, data.channel));
        }
    }
    
    // Handle user list
    handleUserList(users) {
        console.log('[CHAT_DEBUG] Received user list:', users);
        
        if (!users || !Array.isArray(users)) return;
        
        // Update allUsers with received users
        users.forEach(user => {
            this.allUsers[user.id] = user;
        });
        
        this.updateUserList();
    }
    
    // Update user list in UI
    updateUserList() {
        if (!this.dmListContainer) return;
        
        // Clear existing DM items (except General chat)
        const existingItems = this.dmListContainer.querySelectorAll('.dm-item:not(.general-chat-item)');
        existingItems.forEach(item => item.remove());
        
        // Add each user
        for (const userId in this.allUsers) {
            // Skip current user
            if (userId === this.currentUser.id) continue;
            
            const user = this.allUsers[userId];
            
            const dmItem = document.createElement('div');
            dmItem.className = 'sidebar-item';
            dmItem.innerHTML = `
                <div class="user-status ${user.status || 'offline'}"></div>
                <span>${user.username}</span>
            `;
            
            // Add click event
            dmItem.addEventListener('click', () => {
                this.openDM(user.username);
            });
            
            this.dmListContainer.appendChild(dmItem);
        }
    }
    
    // Send a message
    sendMessage() {
        if (!this.messageInput) return;
        let message = this.messageInput.value.trim();
        // Prevent blank, whitespace, or empty messages
        if (!message || message.length === 0) {
            this.addSystemMessage('Cannot send an empty message.');
            return;
        }
        // Add further validation if needed (e.g., max length)
        if (message.length > 2000) {
            this.addSystemMessage('Message too long. 2000 characters max.');
            return;
        }
        // Sanitize message to prevent XSS
        message = this.sanitizeHTML(message);
        this._sendMessageNow(message);
        this.messageInput.value = '';
    }
    
    // Helper method to actually send the message
    _sendMessageNow(message) {
        // Clear input immediately for better UX
        this.messageInput.value = '';
        
        try {
            // Get user info from session (should be set by AuthManager)
            const user = JSON.parse(sessionStorage.getItem('user'));
            
            if (!user || !user.username) {
                console.error('[CHAT_DEBUG] No user found in session storage');
                this.addSystemMessage('Error: You are not logged in. Please refresh and log in again.');
                return;
            }
            
            // Generate a temporary ID for this message
            const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Prepare message data
            const messageData = {
                username: user.username,
                senderId: user.id,
                message: message,
                timestamp: Date.now(),
                tempId: tempId // Add tempId to track this message
            };
            
            if (this.inGeneralChat) {
                // General chat message
                messageData.channel = 'general';
                console.log('[CHAT_DEBUG] Sending message to general chat:', messageData);
                this.socket.emit('chat-message', messageData);
            } else if (this.currentDmRecipientId) {
                // Direct message
                messageData.recipientId = this.currentDmRecipientId;
                console.log('[CHAT_DEBUG] Sending DM to', this.currentDmRecipientId, ':', messageData);
                this.socket.emit('direct-message', messageData);
            } else {
                // Channel message
                messageData.channel = this.currentChannel;
                console.log('[CHAT_DEBUG] Sending message to channel', this.currentChannel, ':', messageData);
                this.socket.emit('chat-message', messageData);
            }
            
            // Add to UI immediately for instant feedback with the temp ID
            messageData.id = tempId; // Set the ID to the temp ID for DOM tracking
            this.displayMessageInUI(messageData);
        } catch (error) {
            console.error('[CHAT_DEBUG] Error sending message:', error);
            this.addSystemMessage('Error sending message. Please try again.');
        }
    }
    
    // Display a message in the UI
    displayMessageInUI(message, contextChannel = 'general') {
        // Prevent adding duplicate message elements to the DOM
        if (this.messagesContainer.querySelector(`[data-message-id="${message.id}"]`)) {
            console.log(`[CHAT_DEBUG] Message element with ID ${message.id} already exists. Skipping DOM append.`);
            return;
        }
        
        console.log(`[CHAT_DEBUG] Displaying message:`, message);
        
        // Get current user from session storage
        let currentUser = this.currentUser;
        if (!currentUser) {
            try {
                currentUser = JSON.parse(sessionStorage.getItem('user'));
                this.currentUser = currentUser; // Store for future use
            } catch (e) {
                console.error('[CHAT_DEBUG] Error getting user from session storage:', e);
            }
        }
        
        // Check if this is the user's own message
        const isOwn = currentUser && (
            message.senderId === currentUser.id ||
            message.username === currentUser.username ||
            message.sender === currentUser.username
        );
        
        console.log(`[CHAT_DEBUG] Message ownership check: ${isOwn ? 'OWN' : 'OTHER'} message`, {
            msgSenderId: message.senderId,
            msgUsername: message.username,
            msgSender: message.sender,
            currentUserId: currentUser?.id,
            currentUsername: currentUser?.username
        });
        
        // Create message container
        const messageElement = document.createElement('div');
        messageElement.className = isOwn ? 'message own-message' : 'message';
        messageElement.setAttribute('data-message-id', message.id || 'temp-' + Date.now());
        
        // Add sender and timestamp attributes for grouping
        const sender = message.username || message.sender || 'unknown';
        messageElement.setAttribute('data-sender', sender);
        messageElement.setAttribute('data-timestamp', message.timestamp || Date.now());
        
        // Check if this should be a first message in a group (with avatar and header)
        const isFirstMessageInGroup = this.isFirstMessageInGroup(message);
        if (isFirstMessageInGroup) {
            messageElement.classList.add('first-message');
        } else {
            messageElement.classList.add('grouped');
        }
        
        // Basic classes
        let messageClasses = ['message'];
        if (isOwn) {
            messageClasses.push('own-message');
        }
        
        // Apply all classes to the message div
        messageElement.className = messageClasses.join(' ');
        
        // Build message HTML
        let messageHTML = '';
        
        // Only first message in a group gets avatar and header
        if (isFirstMessageInGroup) {
            // Get avatar URL - use default if not provided
            const avatarUrl = message.avatarUrl || 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1744642336378';
            
            // Format the timestamp
            const timestamp = this.formatTimestamp(message.timestamp);
            
            // Use message.username or message.sender for the display name
            const displayName = message.username || message.sender || 'Unknown User';
            
            messageHTML += `
                <img src="${avatarUrl}" alt="${displayName}" class="message-avatar">
                <div class="message-header">
                    <span class="message-author">${this.sanitizeHTML(displayName)}</span>&nbsp;<span class="message-timestamp">${timestamp}</span>
                </div>
            `;
        } else {
            // For grouped messages, simplified structure
            messageHTML += `
                <div class="message-content">
            `;
        }
        
        // Message content - handle different message types
        if (message.type === 'file') {
            // Handle file type message
            messageHTML += `
                <div class="message-text">
                    <div class="message-file">
                        <a href="${message.fileUrl}" target="_blank" class="file-link">
                            <i class="bi bi-file-earmark"></i> ${this.sanitizeHTML(message.content || message.message || 'Shared a file')}
                        </a>
                    </div>
                </div>
            `;
        } else {
            // Regular text message - use message.content or message.message
            const messageContent = message.content || message.message || '';
            messageHTML += `
                <div class="message-text">
                    ${this.formatMessageContent(messageContent)}
                </div>
            `;
        }
        
        // Close message-content div
        messageHTML += `</div>`;
        
        // Add message actions menu
        messageHTML += `
            <div class="message-actions">
                <button class="message-actions-btn" aria-label="Message actions">
                    <i class="bi bi-three-dots-vertical"></i>
                </button>
                <div class="message-actions-menu">
                    <div class="message-action-item" data-action="copy">
                        <i class="bi bi-clipboard"></i> Copy Message
                    </div>
                    ${isOwn ? `
                    <div class="message-action-item danger" data-action="delete">
                        <i class="bi bi-trash"></i> Delete Message
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Set message HTML
        messageElement.innerHTML = messageHTML;
        
        // Add to container
        this.messagesContainer.appendChild(messageElement);
        
        // Setup message action handlers
        this.setupMessageActionHandlers(messageElement);
        
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        
        // Remove the 'new-message' class after animation completes to avoid replay
        setTimeout(() => {
            messageElement.classList.remove('new-message');
        }, 500);
    }
    
    // Check if this should be a first message in a group (with avatar and header)
    isFirstMessageInGroup(message) {
        // Get all messages in the container
        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.message'));
        
        // If this is the first message, it's definitely a first in group
        if (allMessages.length === 0) {
            return true;
        }
        
        // Get the previous message element
        const prevMessageElement = allMessages[allMessages.length - 1];
        
        // If no previous message, this is a first in group
        if (!prevMessageElement) {
            return true;
        }
        
        // Get the previous message's sender
        const prevMessageSender = prevMessageElement.getAttribute('data-sender');
        const currentSender = message.username || message.sender || 'unknown';
        
        // If different senders, this is a first in group
        if (prevMessageSender !== currentSender) {
            return true;
        }
        
        // Check time difference (if within 5 minutes, group together)
        const prevMessageTime = prevMessageElement.getAttribute('data-timestamp');
        const currentMessageTime = message.timestamp || Date.now();
        
        // If time difference is more than 5 minutes (300000ms), this is a first in group
        if (!prevMessageTime || !currentMessageTime || 
            Math.abs(parseInt(currentMessageTime) - parseInt(prevMessageTime)) > 300000) {
            return true;
        }
        
        // If we got here, this message should be grouped with the previous one
        return false;
    }

    // Handle confirmation that a message was saved (received permanent ID)
    handleMessageConfirmation(confirmedMessage) {
        console.log('[CHAT_DEBUG] Message confirmation received:', confirmedMessage);
        
        if (!confirmedMessage || (!confirmedMessage.tempId && !confirmedMessage.id)) {
            console.warn('[CHAT_DEBUG] Invalid message confirmation data');
            return;
        }
        
        // Find the temporary message element in the DOM
        const tempMessageElement = this.messagesContainer.querySelector(`[data-message-id="${confirmedMessage.tempId}"]`);
        
        if (tempMessageElement) {
            // Update the message element with the permanent ID
            tempMessageElement.setAttribute('data-message-id', confirmedMessage.id);
            console.log(`[CHAT_DEBUG] Updated message element ID from ${confirmedMessage.tempId} to ${confirmedMessage.id}`);
        } else {
            console.log(`[CHAT_DEBUG] Temp message element not found for ID: ${confirmedMessage.tempId}`);
        }
        
        // Update the message in the cache
        this._updateMessageCache(confirmedMessage);
    }
    
    // Helper function to update messages in the cache
    _updateMessageCache(confirmedMessage) {
        const channel = confirmedMessage.channel || this.currentChannel;
        
        // Ensure the channel cache exists
        if (!this.channelMessages[channel]) {
            this.channelMessages[channel] = [];
        }
        
        // Find the temporary message in the cache by tempId
        const tempMessageIndex = this.channelMessages[channel].findIndex(
            msg => msg.tempId === confirmedMessage.tempId || 
            (msg.id && msg.id === confirmedMessage.tempId)
        );
        
        if (tempMessageIndex !== -1) {
            // Update the existing message with the permanent ID and any other new data
            this.channelMessages[channel][tempMessageIndex] = {
                ...this.channelMessages[channel][tempMessageIndex],
                id: confirmedMessage.id,
                created_at: confirmedMessage.created_at
            };
            console.log(`[CHAT_DEBUG] Updated message in cache for channel ${channel}`);
        } else {
            // If we couldn't find the temp message, it might be because we're receiving a confirmation
            // for a message that was sent before we joined this channel. In this case, we should add it.
            console.log(`[CHAT_DEBUG] Temp message not found in cache for channel ${channel}, adding as new`);
        }
    }

    // Setup message action handlers
    setupMessageActionHandlers(messageElement) {
        if (!messageElement) return;
        
        const actionsBtn = messageElement.querySelector('.message-actions-btn');
        const actionsMenu = messageElement.querySelector('.message-actions-menu');
        
        if (actionsBtn && actionsMenu) {
            // Toggle menu on button click
            actionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Close all other open menus first
                document.querySelectorAll('.message-actions-menu.show').forEach(menu => {
                    if (menu !== actionsMenu) {
                        menu.classList.remove('show');
                    }
                });
                
                // Toggle this menu
                actionsMenu.classList.toggle('show');
            });
            
            // Setup action handlers
            actionsMenu.querySelectorAll('.message-action-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    const action = item.getAttribute('data-action');
                    const messageId = messageElement.getAttribute('data-message-id');
                    const messageContent = messageElement.querySelector('.message-text')?.textContent.trim();
                    
                    if (action === 'copy' && messageContent) {
                        // Copy to clipboard
                        navigator.clipboard.writeText(messageContent)
                            .then(() => {
                                console.log('[CHAT_DEBUG] Message copied to clipboard');
                                this.displaySystemMessage('Message copied to clipboard');
                            })
                            .catch(err => {
                                console.error('[CHAT_DEBUG] Failed to copy message:', err);
                            });
                        
                        // Close menu
                        actionsMenu.classList.remove('show');
                    }
                    else if (action === 'delete' && messageId) {
                        // Delete message
                        this.socket.emit('delete-message', { messageId }, (response) => {
                            if (response.success) {
                                console.log(`[CHAT_DEBUG] Message deleted successfully: ${messageId}`);
                                // Remove the message from UI immediately 
                                messageElement.remove();
                                
                                // Remove from local cache in ALL channels
                                for (const channelId in this.channelMessages) {
                                    const index = this.channelMessages[channelId].findIndex(
                                        msg => msg.id === messageId
                                    );
                                    
                                    if (index !== -1) {
                                        this.channelMessages[channelId].splice(index, 1);
                                        console.log(`[CHAT_DEBUG] Removed deleted message from channel cache: ${channelId}`);
                                    }
                                }
                            } else {
                                console.error(`[CHAT_DEBUG] Failed to delete message: ${messageId}`, response.error);
                                this.displaySystemMessage('Failed to delete message: ' + (response.error || 'Unknown error'));
                            }
                            
                            // Close menu
                            actionsMenu.classList.remove('show');
                        });
                    }
                });
            });
        }
    }
    
    // Close all message action menus when clicking elsewhere
    setupGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            // If the click is not inside any message-actions element, close all menus
            if (!e.target.closest('.message-actions')) {
                document.querySelectorAll('.message-actions-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
    }

    // Format timestamp in Discord style
    formatTimestamp(timestamp) {
        if (!timestamp) return 'Unknown time';
        
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isYesterday = new Date(now - 86400000).toDateString() === date.toDateString();
        
        // Format hours and minutes
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        const timeStr = `${hours12}:${minutes} ${ampm}`;
        
        // Format the date string
        if (isToday) {
            return `Today at ${timeStr}`;
        } else if (isYesterday) {
            return `Yesterday at ${timeStr}`;
        } else {
            // Format date as MM/DD/YYYY
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const year = date.getFullYear();
            return `${month}/${day}/${year} ${timeStr}`;
        }
    }

    // Helper function to sanitize HTML content to prevent XSS
    sanitizeHTML(html) {
        if (!html) return '';
        
        // Simple sanitization by replacing problematic characters
        return String(html)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    // Format message content (handle links, emojis, etc.)
    formatMessageContent(content) {
        if (!content) return '';
        
        // Convert URLs to clickable links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        content = content.replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
        
        // Handle newlines
        content = content.replace(/\n/g, '<br>');
        
        return content;
    }
    
    // Display system message
    displaySystemMessage(message) {
        if (!this.messagesContainer) return;
        
        const systemElement = document.createElement('div');
        systemElement.className = 'system-message';
        systemElement.textContent = message;
        
        this.messagesContainer.appendChild(systemElement);
        this.scrollToBottom();
    }
    
    // Clear messages container
    clearMessagesContainer() {
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
        }
    }
    
    // Scroll to bottom of messages
    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
    
    // Add system message
    addSystemMessage(message) {
        this.displaySystemMessage(message);
    }

    // Create a new channel
    createChannel(name, description = '', isPrivate = false) {
        if (!this.socket || !name || name.trim() === '') {
            console.error('[CHAT_DEBUG] Cannot create channel: Invalid name or socket not connected');
            return;
        }
        
        console.log(`[CHAT_DEBUG] Requesting creation of channel: ${name}`);
        
        // Send create-channel request to server
        this.socket.emit('create-channel', {
            name: name,
            description: description,
            isPrivate: isPrivate
        }, (response) => {
            if (response.success) {
                console.log(`[CHAT_DEBUG] Channel created successfully: ${response.channel.name}`);
                this.addChannelToUI(response.channel);
                
                // Switch to the new channel
                this.switchChannel(response.channel.name);
            } else {
                console.error(`[CHAT_DEBUG] Failed to create channel: ${response.error}`);
                // Could display error to user here
            }
        });
    }
    
    // Load all available channels
    loadChannels() {
        if (!this.socket) {
            console.error('[CHAT_DEBUG] Cannot load channels: Socket not connected');
            return;
        }
        
        console.log('[CHAT_DEBUG] Requesting channels list');
        
        // Request channels from server
        this.socket.emit('get-channels', (response) => {
            if (response && response.channels) {
                console.log(`[CHAT_DEBUG] Received ${response.channels.length} channels`);
                
                // Clear existing channels first
                const channelsList = document.getElementById('channels-list');
                // Keep only the channels header
                const header = channelsList.querySelector('.channels-header');
                if (header) {
                    channelsList.innerHTML = '';
                    channelsList.appendChild(header);
                }
                
                // Add each channel to the UI
                response.channels.forEach(channel => {
                    this.addChannelToUI(channel);
                });
            }
        });
    }
    
    // Add a channel to the UI
    addChannelToUI(channel) {
        const channelsList = document.getElementById('channels-list');
        if (!channelsList) {
            console.error('[CHAT_DEBUG] Channels list element not found');
            return;
        }
        
        // Check if channel already exists in UI
        const existingChannel = document.querySelector(`.channel-item[data-channel="${channel.name}"]`);
        if (existingChannel) {
            console.log(`[CHAT_DEBUG] Channel ${channel.name} already exists in UI`);
            return;
        }
        
        // Create channel element
        const channelItem = document.createElement('div');
        channelItem.className = 'channel-item';
        channelItem.setAttribute('data-channel', channel.name);
        
        const icon = channel.is_private ? 'lock-fill' : 'hash';
        
        channelItem.innerHTML = `
            <i class="bi bi-${icon}"></i>
            <span>${channel.name}</span>
        `;
        
        // Add click handler
        channelItem.addEventListener('click', () => {
            this.switchChannel(channel.name);
        });
        
        // Add to channels list
        channelsList.appendChild(channelItem);
    }
    
    // Handle new channel creation from UI
    handleCreateChannelUI() {
        // Get channel name from UI
        const channelNameInput = document.getElementById('new-channel-name');
        if (!channelNameInput || !channelNameInput.value.trim()) {
            console.error('[CHAT_DEBUG] Invalid channel name');
            return;
        }
        
        const channelName = channelNameInput.value.trim();
        const channelDesc = document.getElementById('new-channel-desc')?.value || '';
        const isPrivate = document.getElementById('new-channel-private')?.checked || false;
        
        // Create the channel
        this.createChannel(channelName, channelDesc, isPrivate);
        
        // Reset form
        channelNameInput.value = '';
        if (document.getElementById('new-channel-desc')) {
            document.getElementById('new-channel-desc').value = '';
        }
        if (document.getElementById('new-channel-private')) {
            document.getElementById('new-channel-private').checked = false;
        }
        
        // Close modal
        const modal = document.getElementById('create-channel-modal');
        if (modal) {
            // Close bootstrap modal
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) bsModal.hide();
        }
    }

    // Show unread indicator for a DM
    showUnreadIndicator(userId) {
        if (!userId) return;
        
        const dmItem = document.querySelector(`.dm-item[data-user-id="${userId}"]`);
        if (dmItem) {
            dmItem.classList.add('unread');
            
            // Add an unread dot if it doesn't exist
            if (!dmItem.querySelector('.unread-dot')) {
                const unreadDot = document.createElement('span');
                unreadDot.className = 'unread-dot';
                dmItem.appendChild(unreadDot);
            }
        }
    }
    
    // Clear unread indicator for a DM
    clearUnreadIndicator(userId) {
        if (!userId) return;
        
        const dmItem = document.querySelector(`.dm-item[data-user-id="${userId}"]`);
        if (dmItem) {
            dmItem.classList.remove('unread');
            
            // Remove the unread dot if it exists
            const unreadDot = dmItem.querySelector('.unread-dot');
            if (unreadDot) {
                unreadDot.remove();
            }
        }
    }

    // Add event listener for message deletion request
    handleMessageDeletion() {
        // Add click event listener on messages container for delegation
        document.getElementById('messages-container').addEventListener('contextmenu', (e) => {
            // Check if the click was on a message or within a message
            const messageElement = e.target.closest('.message');
            if (messageElement) {
                e.preventDefault(); // Prevent the default context menu
                
                // Get message ID
                const messageId = messageElement.getAttribute('data-message-id');
                if (!messageId) return;
                
                // Simple confirmation to delete
                if (confirm('Delete this message?')) {
                    console.log(`[CHAT_DEBUG] Requesting deletion of message: ${messageId}`);
                    
                    // Send delete request to server
                    this.socket.emit('delete-message', { messageId }, (response) => {
                        if (response.success) {
                            console.log(`[CHAT_DEBUG] Message deleted successfully: ${messageId}`);
                            // Remove the message from UI immediately 
                            messageElement.remove();
                        } else {
                            console.error(`[CHAT_DEBUG] Failed to delete message: ${messageId}`, response.error);
                            alert(`Failed to delete message: ${response.message}`);
                        }
                    });
                }
            }
        });
        
        // Handle message deletion events from server
        this.socket.on('message-deleted', (data) => {
            console.log('[CHAT_DEBUG] Received message deletion notification:', data);
            
            if (!data || !data.messageId) return;
            
            // Remove message from UI if present
            const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
            if (messageElement) {
                messageElement.remove();
                console.log(`[CHAT_DEBUG] Removed deleted message from UI: ${data.messageId}`);
            }
            
            // Remove from stored messages in ALL channels (in case it appears in multiple places)
            for (const channelId in this.channelMessages) {
                const index = this.channelMessages[channelId].findIndex(
                    msg => msg.id === data.messageId
                );
                
                if (index !== -1) {
                    this.channelMessages[channelId].splice(index, 1);
                    console.log(`[CHAT_DEBUG] Removed deleted message from channel cache: ${channelId}`);
                }
            }
            
            // Also check general messages
            if (this.generalChatMessages) {
                const genIndex = this.generalChatMessages.findIndex(
                    msg => msg.id === data.messageId
                );
                
                if (genIndex !== -1) {
                    this.generalChatMessages.splice(genIndex, 1);
                    console.log(`[CHAT_DEBUG] Removed deleted message from general chat cache`);
                }
            }
        });
    }

    // Get current user's friend code
    getFriendCode() {
        console.log('[CHAT_DEBUG] Getting friend code for current user');
        
        // Make sure we have a current user with an ID
        if (!this.currentUser || !this.currentUser.id) {
            console.error('[CHAT_DEBUG] Cannot get friend code: No current user');
            return;
        }
        
        // Request friend code from server
        this.socket.emit('get-friend-code', {}, (response) => {
            console.log('[CHAT_DEBUG] Friend code response:', response);
            
            if (response.success && response.friendCode) {
                this.currentUser.friendCode = response.friendCode;
                this.updateFriendCodeDisplay();
            } else {
                console.error('[CHAT_DEBUG] Failed to get friend code:', response.message || 'Unknown error');
                
                // Try to regenerate if missing
                if (response.message === 'No friend code found') {
                    this.generateNewFriendCode();
                }
            }
        });
    }
    
    // Generate a new friend code
    generateNewFriendCode() {
        console.log('[CHAT_DEBUG] Generating new friend code');
        
        // Show loading state
        const codeDisplay = document.getElementById('current-friend-code');
        if (codeDisplay) {
            codeDisplay.innerHTML = '<span class="text-muted"><i class="bi bi-hourglass-split me-2"></i>Generating...</span>';
        }
        
        this.socket.emit('generate-friend-code', (response) => {
            if (response.success) {
                console.log('[CHAT_DEBUG] New friend code generated:', response.friendCode);
                this.currentUser.friendCode = response.friendCode;
                this.updateFriendCodeDisplay();
            } else {
                console.error('[CHAT_DEBUG] Failed to generate friend code:', response.message);
                // Restore previous code on error
                this.updateFriendCodeDisplay();
            }
        });
    }
    
    // Update the friend code display in UI
    updateFriendCodeDisplay() {
        const codeDisplay = document.getElementById('current-friend-code');
        if (codeDisplay && this.currentUser && this.currentUser.friendCode) {
            codeDisplay.textContent = this.currentUser.friendCode;
        }
    }

    // Load pending friend requests from the server
    loadPendingFriendRequests() {
        console.log('[CHAT_DEBUG] Loading pending friend requests');
        
        // Emit event to get pending requests
        this.socket.emit('get-pending-requests', {}, (response) => {
            if (response.success) {
                console.log('[CHAT_DEBUG] Pending requests loaded:', response.requests);
                this.updatePendingRequestsList(response.requests);
            } else {
                console.error('[CHAT_DEBUG] Failed to load pending requests:', response.message);
            }
        });
    }
    
    // Update pending requests list in the UI
    updatePendingRequestsList(requests) {
        const pendingRequestsList = document.getElementById('pending-requests-list');
        const noRequestsMessage = document.getElementById('no-pending-requests');
        
        if (!pendingRequestsList) return;
        
        // Clear previous items (except the no-requests message)
        Array.from(pendingRequestsList.children).forEach(child => {
            if (child.id !== 'no-pending-requests') {
                child.remove();
            }
        });
        
        // Show or hide no requests message
        if (!requests || requests.length === 0) {
            if (noRequestsMessage) noRequestsMessage.classList.remove('d-none');
            return;
        } else {
            if (noRequestsMessage) noRequestsMessage.classList.add('d-none');
        }
        
        // Add each request to the list
        requests.forEach(request => {
            const requestItem = document.createElement('div');
            requestItem.className = 'friend-request-item list-group-item';
            requestItem.setAttribute('data-request-id', request.id);
            
            const avatarUrl = this.getDefaultAvatar(request.user_id);
            const username = this.sanitizeHTML(request.username);
            
            requestItem.innerHTML = 
                '<div class="friend-request-info">' +
                '    <div class="friend-request-avatar">' +
                '        <img src="' + avatarUrl + '" alt="' + username + '\'s Avatar">' +
                '    </div>' +
                '    <div class="friend-request-details">' +
                '        <div class="friend-request-username">' + username + '</div>' +
                '        <div class="friend-request-status">Pending</div>' +
                '    </div>' +
                '</div>' +
                '<div class="friend-request-actions">' +
                '    <button class="accept-btn" data-username="' + username + '">Accept</button>' +
                '    <button class="reject-btn" data-username="' + username + '">Reject</button>' +
                '</div>';
            
            // Add event listeners for accept/reject buttons
            const acceptBtn = requestItem.querySelector('.accept-btn');
            const rejectBtn = requestItem.querySelector('.reject-btn');
            
            if (acceptBtn) {
                acceptBtn.addEventListener('click', () => {
                    const username = acceptBtn.getAttribute('data-username');
                    this.acceptFriendRequest(username);
                    requestItem.remove();
                    
                    // Check if there are no more requests
                    if (pendingRequestsList.querySelectorAll('.friend-request-item').length === 0) {
                        if (noRequestsMessage) noRequestsMessage.classList.remove('d-none');
                    }
                });
            }
            
            if (rejectBtn) {
                rejectBtn.addEventListener('click', () => {
                    const username = rejectBtn.getAttribute('data-username');
                    this.rejectFriendRequest(username);
                    requestItem.remove();
                    
                    // Check if there are no more requests
                    if (pendingRequestsList.querySelectorAll('.friend-request-item').length === 0) {
                        if (noRequestsMessage) noRequestsMessage.classList.remove('d-none');
                    }
                });
            }
            
            pendingRequestsList.appendChild(requestItem);
        });
    }

    // Show Add Friend Modal
    showAddFriendModal() {
        const addFriendModal = document.getElementById('add-friend-modal');
        if (addFriendModal) {
            // Load pending friend requests
            this.loadPendingFriendRequests();
            
            // Load the current user's friend code
            this.loadFriendCode();
            
            const modal = new bootstrap.Modal(addFriendModal);
            modal.show();
        }
    }
    
    // Send a friend request
    sendFriendRequest() {
        const usernameInput = document.getElementById('friend-username-input');
        if (!usernameInput || !usernameInput.value.trim()) {
            this.displaySystemMessage('Please enter a username');
            return;
        }
        
        const username = usernameInput.value.trim();
        
        // Don't allow sending friend request to yourself
        if (username === this.currentUser.username) {
            this.displaySystemMessage('You cannot send a friend request to yourself');
            return;
        }
        
        console.log('[CHAT_DEBUG] Sending friend request to:', username);
        
        // First, find the user ID by username
        this.socket.emit('get-user-by-username', { username }, (userResponse) => {
            if (userResponse.success && userResponse.user) {
                const recipientId = userResponse.user.id;
                
                // Now send the friend request with the recipient ID
                this.socket.emit('send-friend-request', { recipientId }, (response) => {
                    if (response.success) {
                        console.log('[CHAT_DEBUG] Friend request sent successfully');
                        this.displaySystemMessage(`Friend request sent to ${username}`);
                        
                        // Clear the input field
                        usernameInput.value = '';
                        
                        // Close the modal
                        const addFriendModal = document.getElementById('add-friend-modal');
                        if (addFriendModal) {
                            const modal = bootstrap.Modal.getInstance(addFriendModal);
                            if (modal) {
                                modal.hide();
                            }
                        }
                    } else {
                        console.error('[CHAT_DEBUG] Failed to send friend request:', response.message);
                        this.displaySystemMessage(`Failed to send friend request: ${response.message}`);
                    }
                });
            } else {
                console.error('[CHAT_DEBUG] User not found:', username);
                this.displaySystemMessage(`User not found: ${username}`);
            }
        });
    }
    
    // Accept a friend request
    acceptFriendRequest(username) {
        if (!username) return;
        
        console.log('[CHAT_DEBUG] Accepting friend request from:', username);
        
        // Emit event to accept friend request
        this.socket.emit('accept-friend-request', { username }, (response) => {
            if (response.success) {
                console.log('[CHAT_DEBUG] Friend request accepted successfully');
                this.displaySystemMessage(`You are now friends with ${username}`);
                
                // Refresh the DM list
                this.populateDMList();
            } else {
                console.error('[CHAT_DEBUG] Failed to accept friend request:', response.message);
                this.displaySystemMessage(`Failed to accept friend request: ${response.message}`);
            }
        });
    }
    
    // Reject a friend request
    rejectFriendRequest(username) {
        if (!username) return;
        
        console.log('[CHAT_DEBUG] Rejecting friend request from:', username);
        
        // Emit event to reject friend request
        this.socket.emit('reject-friend-request', { username }, (response) => {
            if (response.success) {
                console.log('[CHAT_DEBUG] Friend request rejected successfully');
                this.displaySystemMessage(`Friend request from ${username} rejected`);
            } else {
                console.error('[CHAT_DEBUG] Failed to reject friend request:', response.message);
                this.displaySystemMessage(`Failed to reject friend request: ${response.message}`);
            }
        });
    }
    
    // Handle incoming friend request
    handleIncomingFriendRequest(data) {
        console.log('[CHAT_DEBUG] Incoming friend request:', data);
        
        // Show notification modal
        const notificationModal = document.getElementById('friend-request-notification-modal');
        if (notificationModal) {
            // Set the username
            const usernameElement = document.getElementById('friend-request-username');
            if (usernameElement) {
                usernameElement.textContent = data.username;
            }
            
            // Set up accept button
            const acceptBtn = document.getElementById('accept-friend-request-btn');
            if (acceptBtn) {
                // Remove existing event listeners
                const newAcceptBtn = acceptBtn.cloneNode(true);
                acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
                
                // Add new event listener
                newAcceptBtn.addEventListener('click', () => {
                    this.acceptFriendRequest(data.username);
                    
                    // Close the modal
                    const modal = bootstrap.Modal.getInstance(notificationModal);
                    if (modal) {
                        modal.hide();
                    }
                });
            }
            
            // Set up reject button
            const rejectBtn = document.getElementById('reject-friend-request-btn');
            if (rejectBtn) {
                // Remove existing event listeners
                const newRejectBtn = rejectBtn.cloneNode(true);
                rejectBtn.parentNode.replaceChild(newRejectBtn, rejectBtn);
                
                // Add new event listener
                newRejectBtn.addEventListener('click', () => {
                    this.rejectFriendRequest(data.username);
                });
            }
            
            // Show the modal
            const modal = new bootstrap.Modal(notificationModal);
            modal.show();
        }
    }
    
    // Get default avatar for a user
    getDefaultAvatar(userId) {
        // Generate a consistent color based on the user ID
        const hash = userId ? userId.toString().split('').reduce((acc, char) => {
            return acc + char.charCodeAt(0);
        }, 0) : 0;
        
        const colors = [
            '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33F0',
            '#33FFF0', '#F0FF33', '#FF3333', '#33FF33', '#3333FF'
        ];
        
        const colorIndex = hash % colors.length;
        const color = colors[colorIndex];
        
        // Return a data URL for a colored circle with the first letter of the username
        return `https://ui-avatars.com/api/?name=${userId}&background=${color.substring(1)}&color=fff`;
    }
    
    // Sanitize HTML to prevent XSS
    sanitizeHTML(text) {
        if (!text) return '';
        return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    // Show DM interface (switch to DM mode)
    showDMInterface() {
        console.log('[CHAT_DEBUG] Switching to DM interface');
        
        // Update UI state
        this.isDMMode = true;
        
        // Update server icons active state
        document.querySelectorAll('.server-icon').forEach(icon => icon.classList.remove('active'));
        const dmIcon = document.getElementById('dm-server-icon');
        if (dmIcon) dmIcon.classList.add('active');
        
        // Update sidebar content
        const channelsHeader = document.getElementById('channels-header');
        const channelsList = document.getElementById('channels-list');
        
        if (channelsHeader) channelsHeader.style.display = 'none';
        if (channelsList) channelsList.style.display = 'none';
        
        // Show DM section
        const dmSection = document.querySelector('.sidebar-section');
        if (dmSection) dmSection.style.display = 'block';
        
        // Refresh DM list
        this.populateDMList();
        
        // If we have DMs, open the first one
        const firstDM = document.querySelector('.dm-item');
        if (firstDM) {
            const username = firstDM.querySelector('span').textContent.trim();
            if (username) {
                this.openDM(username);
            } else {
                // Display a welcome message if no DMs
                this.clearMessagesContainer();
                this.displaySystemMessage("Welcome to your Direct Messages! Click on a friend to start chatting.");
                if (this.chatTitle) this.chatTitle.textContent = "Direct Messages";
            }
        } else {
            // No DMs yet
            this.clearMessagesContainer();
            this.displaySystemMessage("You don't have any direct messages yet. Add friends to start chatting!");
            if (this.chatTitle) this.chatTitle.textContent = "Direct Messages";
        }
    }
    
    // Show Channels interface (switch to channels mode)
    showChannelsInterface() {
        console.log('[CHAT_DEBUG] Switching to Channels interface');
        
        // Update UI state
        this.isDMMode = false;
        
        // Update server icons active state
        document.querySelectorAll('.server-icon').forEach(icon => icon.classList.remove('active'));
        const serverIcon = document.querySelector('.server-icon:first-of-type');
        if (serverIcon) serverIcon.classList.add('active');
        
        // Update sidebar content
        const channelsHeader = document.getElementById('channels-header');
        const channelsList = document.getElementById('channels-list');
        
        if (channelsHeader) channelsHeader.style.display = 'flex';
        if (channelsList) channelsList.style.display = 'block';
        
        // Hide DM section
        const dmSection = document.querySelector('.sidebar-section');
        if (dmSection) dmSection.style.display = 'none';
    }
    
    // Load the current user's friend code
    loadFriendCode() {
        const friendCodeInput = document.getElementById('your-friend-code');
        if (!friendCodeInput) return;
        
        // Check if we have the friend code in the current user object
        if (this.currentUser && this.currentUser.friend_code) {
            friendCodeInput.value = this.currentUser.friend_code;
        } else {
            // If not, fetch it from the server
            this.socket.emit('get-current-user', {}, (response) => {
                if (response.success && response.user && response.user.friend_code) {
                    friendCodeInput.value = response.user.friend_code;
                    
                    // Update the current user object
                    if (this.currentUser) {
                        this.currentUser.friend_code = response.user.friend_code;
                    }
                } else {
                    console.error('[CHAT_DEBUG] Failed to get friend code:', response.message);
                    friendCodeInput.value = 'Not available';
                }
            });
        }
    }
    
    // Generate a new friend code
    generateFriendCode() {
        this.socket.emit('generate-friend-code', {}, (response) => {
            if (response.success) {
                console.log('[CHAT_DEBUG] Generated new friend code:', response.friendCode);
                
                // Update the input field
                const friendCodeInput = document.getElementById('your-friend-code');
                if (friendCodeInput) {
                    friendCodeInput.value = response.friendCode;
                }
                
                // Update the current user object
                if (this.currentUser) {
                    this.currentUser.friend_code = response.friendCode;
                }
                
                this.displaySystemMessage('Your friend code has been updated');
            } else {
                console.error('[CHAT_DEBUG] Failed to generate friend code:', response.message);
                this.displaySystemMessage(`Failed to generate friend code: ${response.message}`);
            }
        });
    }
    
    // Copy friend code to clipboard
    copyFriendCode() {
        const friendCodeInput = document.getElementById('your-friend-code');
        if (!friendCodeInput || !friendCodeInput.value) {
            this.displaySystemMessage('No friend code available to copy');
            return;
        }
        
        // Copy to clipboard
        friendCodeInput.select();
        document.execCommand('copy');
        
        // Show feedback
        this.displaySystemMessage('Friend code copied to clipboard');
    }
    
    // Send a friend request using a friend code
    sendFriendRequestByCode() {
        const codeInput = document.getElementById('friend-code-input');
        if (!codeInput || !codeInput.value.trim()) {
            this.displaySystemMessage('Please enter a friend code');
            return;
        }
        
        const friendCode = codeInput.value.trim();
        
        console.log('[CHAT_DEBUG] Sending friend request using code:', friendCode);
        
        // Emit event to send friend request by code
        this.socket.emit('send-friend-request-by-code', { friendCode }, (response) => {
            if (response.success) {
                console.log('[CHAT_DEBUG] Friend request sent successfully');
                this.displaySystemMessage(`Friend request sent to ${response.recipientUsername}`);
                
                // Clear the input field
                codeInput.value = '';
                
                // Close the modal
                const addFriendModal = document.getElementById('add-friend-modal');
                if (addFriendModal) {
                    const modal = bootstrap.Modal.getInstance(addFriendModal);
                    if (modal) {
                        modal.hide();
                    }
                }
            } else {
                console.error('[CHAT_DEBUG] Failed to send friend request:', response.message);
                this.displaySystemMessage(`Failed to send friend request: ${response.message}`);
            }
        });
    }
}

// Export the ChatManager class
console.log('[CHAT_DEBUG] Chat module loaded and ready');
