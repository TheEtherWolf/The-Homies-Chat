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

        // --- State Variables ---
        this.currentDmRecipientId = null;
        this.dmConversations = {}; // Cache messages: { 'recipientUserId': [messages] }
        this.allUsers = {}; // Store all fetched users: { 'userId': {username, id, status?, avatar_url?} }
        this.currentStatus = 'online';
        this.currentUser = null; // Store current user info { username, id }
        this.isInitialized = false;
        this.needsInitialDataFetch = false; // Flag to fetch users/status on connect
        this.isSocketConnected = this.socket ? this.socket.connected : false; // Track connection state
        this.inGeneralChat = false; // Flag to track if we're in the general chat
        this.currentChannel = 'general'; // Default channel
        
        // Add a default general chat and channel structure
        this.generalChatMessages = [];
        this.channelMessages = {
            'general': [],
            'announcements': [],
            'memes': []
        };

        this.statusIcons = {
            online: 'success',
            away: 'warning',
            busy: 'danger',
            offline: 'text-muted'
        };
        
        // Bind methods that need 'this' context
        this.sendMessage = this.sendMessage.bind(this);
        this.handleReconnect = this.handleReconnect.bind(this);
        this.handleSocketConnect = this.handleSocketConnect.bind(this);
        this.handleSocketDisconnect = this.handleSocketDisconnect.bind(this);
        this.attachEventListeners = this.attachEventListeners.bind(this);
        this.openGeneralChat = this.openGeneralChat.bind(this);
        this.switchChannel = this.switchChannel.bind(this);
        this.toggleEmojiPicker = this.toggleEmojiPicker.bind(this);
        this.insertEmoji = this.insertEmoji.bind(this);
    }

    // Initialize chat manager with user data
    initialize(user) {
        console.log('[CHAT_DEBUG] ChatManager initialize called with user:', user);
        if (this.isInitialized) {
            console.warn('[CHAT_DEBUG] ChatManager already initialized. Aborting.');
            return;
        }
        if (!user || !user.id || !user.username) {
             console.error('[CHAT_DEBUG] Initialization failed: Invalid user object provided.', user);
             return;
        }
        
        this.currentUser = user; 
        this.updateCurrentUserDisplay();
        this.attachEventListeners();

        this.needsInitialDataFetch = true;
        console.log('[CHAT_DEBUG] Set flag: needsInitialDataFetch = true');

        // Check if socket is already connected
        if (this.isSocketConnected) {
            console.log('[CHAT_DEBUG] Socket already connected during init, triggering initial data fetch.');
            this.performInitialDataFetch();
        } else {
            console.log('[CHAT_DEBUG] Socket not connected during init, waiting for connect event.');
        }
        
        // Set up channel click handlers
        this.setupChannelHandlers();
        
        // Open General chat by default
        this.switchChannel('general');
        
        // Load available channels from the server
        this.loadChannels();
        
        // Initialize emoji picker functionality
        this.initEmojiPicker();
        
        this.isInitialized = true;
        console.log('[CHAT_DEBUG] ChatManager successfully initialized.');
    }

    // Set up click handlers for channels
    setupChannelHandlers() {
        const channelItems = document.querySelectorAll('.channel-item');
        channelItems.forEach(item => {
            const channelName = item.querySelector('span').textContent.trim();
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
        console.log(`[CHAT_DEBUG] Switching to channel: ${channelName}`);
        
        // Update UI active state
        const allChannelItems = document.querySelectorAll('.channel-item');
        allChannelItems.forEach(item => {
            const itemName = item.getAttribute('data-channel') || item.querySelector('span').textContent.trim();
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
        this.inGeneralChat = (channelName === 'general');
        this.currentDmRecipientId = null;
        
        // Clear message container
        this.clearMessagesContainer();
        
        // Display channel messages from cache if available
        if (this.channelMessages[channelName] && this.channelMessages[channelName].length > 0) {
            console.log(`[CHAT_DEBUG] Displaying ${this.channelMessages[channelName].length} cached messages for channel: ${channelName}`);
            this.channelMessages[channelName].forEach(msg => this.displayMessageInUI(msg, channelName));
        } else {
            this.displaySystemMessage(`Welcome to #${channelName}`);
        }
        
        // Always request fresh messages from server
        console.log(`[CHAT_DEBUG] Requesting messages for channel: ${channelName}`);
        this.socket.emit('get-messages', { channel: channelName });
        
        // Update input placeholder
        if (this.messageInput) {
            this.messageInput.placeholder = `Message #${channelName}`;
            this.messageInput.disabled = false;
            this.messageInput.focus();
        }
    }
    
    // Open a direct message conversation
    openDM(username) {
        console.log('[CHAT_DEBUG] Opening DM with:', username);
        
        // Find the user by username
        let recipientUser = null;
        
        // Search for user in our list
        for (const userId in this.allUsers) {
            if (this.allUsers[userId].username === username) {
                recipientUser = this.allUsers[userId];
                break;
            }
        }
        
        // If user not found in the list, create a temporary user
        if (!recipientUser) {
            console.log('[CHAT_DEBUG] User not found in list, creating temporary user');
            
            // Generate temporary ID
            const tempUserId = 'temp-' + Date.now();
            
            // Create temporary user
            recipientUser = {
                id: tempUserId,
                username: username,
                status: 'offline'
            };
            
            // Add to user list
            this.allUsers[tempUserId] = recipientUser;
            
            // Add to UI for future selection
            this.updateUserList();
        }
        
        // Create a consistent DM channel name (sorted IDs to ensure the same channel name regardless of sender/receiver)
        const userIds = [this.currentUser.id, recipientUser.id].sort();
        const dmChannelName = `dm_${userIds[0]}_${userIds[1]}`;
        
        // Update state
        this.currentDmRecipientId = recipientUser.id;
        this.inGeneralChat = false;
        this.currentChannel = dmChannelName; // Use the DM channel name
        
        // Update UI
        if (this.chatTitle) {
            this.chatTitle.textContent = `@${username}`;
        }
        
        // Clear messages container
        this.clearMessagesContainer();
        
        // Display cached DM messages if available
        if (this.channelMessages[dmChannelName] && this.channelMessages[dmChannelName].length > 0) {
            console.log(`[CHAT_DEBUG] Displaying ${this.channelMessages[dmChannelName].length} cached messages for DM with ${username}`);
            this.channelMessages[dmChannelName].forEach(msg => this.displayMessageInUI(msg, dmChannelName));
        } else {
            this.displaySystemMessage(`This is the beginning of your conversation with ${username}`);
        }
        
        // Request DM history from server
        console.log(`[CHAT_DEBUG] Requesting messages for DM channel: ${dmChannelName}`);
        this.socket.emit('get-messages', { channel: dmChannelName });
        
        // Mark conversation as active in UI
        this.updateActiveDM(username);
        
        // Update input placeholder
        if (this.messageInput) {
            this.messageInput.placeholder = `Message @${username}`;
            this.messageInput.disabled = false;
            this.messageInput.focus();
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
        // DOM event listeners
        if (this.sendButton) {
            this.sendButton.addEventListener('click', this.sendMessage);
        }
        
        if (this.messageInput) {
            this.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        
        if (this.emojiButton) {
            this.emojiButton.addEventListener('click', this.toggleEmojiPicker);
        }
        
        // Add click handlers to all emoji buttons
        if (this.emojiButtons) {
            this.emojiButtons.forEach(btn => {
                btn.addEventListener('click', () => this.insertEmoji(btn.textContent));
            });
        }
        
        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (this.emojiPicker && !this.emojiPicker.classList.contains('d-none') && 
                !this.emojiPicker.contains(e.target) && e.target !== this.emojiButton) {
                this.emojiPicker.classList.add('d-none');
            }
        });
        
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
        
        console.log('[CHAT_DEBUG] All event listeners attached');
    }

    initializeEventListeners() {
        // Message input event listeners
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });
        
        // Setup channel switching
        this.setupChannelSwitch();
        
        // Setup emoji picker
        this.setupEmojiPicker();
        
        // Setup message deletion
        this.handleMessageDeletion();
        
        // Setup global click handler for message action menus
        this.setupGlobalClickHandler();
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
        
        // Check if this is a duplicate message we already have
        const isDuplicate = message.channel && this.channelMessages[message.channel] && 
            this.channelMessages[message.channel].some(existingMsg => 
                (existingMsg.id && existingMsg.id === message.id) || 
                (existingMsg.timestamp === message.timestamp && 
                 existingMsg.sender === message.sender && 
                 existingMsg.content === message.content)
            );
        
        if (isDuplicate) {
            console.log('[CHAT_DEBUG] Skipping duplicate message:', message);
            return;
        }
        
        // Handle different message types
        if (message.channel === 'general' || message.isGeneralMessage) {
            // General chat message
            this.generalChatMessages.push(message);
            
            if (this.inGeneralChat || this.currentChannel === 'general') {
                this.displayMessageInUI(message, 'general');
            }
        } else if (message.channel && message.channel.startsWith('dm_')) {
            // DM message - format is dm_userId1_userId2
            // Store in the channel messages
            this.channelMessages[message.channel].push(message);
            
            const userIds = message.channel.replace('dm_', '').split('_');
            const otherUserId = userIds[0] === this.currentUser.id ? userIds[1] : userIds[0];
            
            // If this is the current conversation, display it
            if (this.currentChannel === message.channel) {
                this.displayMessageInUI(message, message.channel);
            } else {
                // Notify user of new message
                this.showUnreadIndicator(otherUserId);
            }
        } else if (message.channel) {
            // Regular channel message
            this.channelMessages[message.channel].push(message);
            
            if (this.currentChannel === message.channel) {
                this.displayMessageInUI(message, message.channel);
            }
        }
    }
    
    // Handle message history
    handleMessageHistory(data) {
        console.log('[CHAT_DEBUG] Received message history:', data);
        
        if (!data || !data.messages) {
            console.error('[CHAT_DEBUG] Invalid message history data received:', data);
            return;
        }
        
        // Get the channel from the data object
        const channel = data.channel || 'general';
        
        console.log(`[CHAT_DEBUG] Processing ${data.messages.length} messages for channel ${channel}`);
        
        // Store messages in appropriate collection
        if (channel.startsWith('dm_')) {
            // DM history - extract user IDs from channel name
            const userIds = channel.replace('dm_', '').split('_');
            const otherUserId = userIds[0] === this.currentUser?.id ? userIds[1] : userIds[0];
            
            if (!this.dmConversations[otherUserId]) {
                this.dmConversations[otherUserId] = [];
            }
            
            // Add new messages, avoiding duplicates
            data.messages.forEach(msg => {
                const isDuplicate = this.dmConversations[otherUserId].some(existingMsg => 
                    (existingMsg.id && existingMsg.id === msg.id) ||
                    (existingMsg.timestamp === msg.timestamp && 
                     existingMsg.sender === msg.sender && 
                     existingMsg.content === msg.content));
                
                if (!isDuplicate) {
                    this.dmConversations[otherUserId].push(msg);
                }
            });
            
            // Display if this is the active conversation
            if (this.currentChannel === channel) {
                this.clearMessagesContainer();
                this.dmConversations[otherUserId].forEach(msg => 
                    this.displayMessageInUI(msg, channel));
            }
        } else {
            // Regular channel history
            if (!this.channelMessages[channel]) {
                this.channelMessages[channel] = [];
            }
            
            // Add new messages, avoiding duplicates
            data.messages.forEach(msg => {
                const isDuplicate = this.channelMessages[channel].some(existingMsg => 
                    (existingMsg.id && existingMsg.id === msg.id) ||
                    (existingMsg.timestamp === msg.timestamp && 
                     existingMsg.sender === msg.sender && 
                     existingMsg.content === msg.content));
                
                if (!isDuplicate) {
                    this.channelMessages[channel].push(msg);
                }
            });
            
            // Sort by timestamp
            this.channelMessages[channel].sort((a, b) => 
                new Date(a.timestamp) - new Date(b.timestamp)
            );
            
            // Display if this is the active channel
            if (this.currentChannel === channel) {
                console.log(`[CHAT_DEBUG] Displaying ${this.channelMessages[channel].length} messages for current channel: ${channel}`);
                this.clearMessagesContainer();
                this.channelMessages[channel].forEach(msg => 
                    this.displayMessageInUI(msg, channel));
            }
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
        if (!this.socket) {
            console.error('[CHAT_DEBUG] Cannot send message: Socket not connected');
            return;
        }
        
        const messageContent = this.messageInput.value.trim();
        if (!messageContent) {
            console.log('[CHAT_DEBUG] Cannot send empty message');
            return;
        }
        
        // Get the appropriate channel based on context
        let channel = this.currentChannel;
        
        // If we're in a DM, make sure to use the DM channel format
        if (this.currentDmRecipientId) {
            const userIds = [this.currentUser.id, this.currentDmRecipientId].sort();
            channel = `dm_${userIds[0]}_${userIds[1]}`;
        }
        
        console.log(`[CHAT_DEBUG] Sending message to channel: ${channel}`);
        
        // Create message object
        const messageObj = {
            content: messageContent,
            sender: this.currentUser.username,
            senderId: this.currentUser.id,
            timestamp: Date.now(),
            channel: channel
        };
        
        // Add to local messages cache
        if (!this.channelMessages[channel]) {
            this.channelMessages[channel] = [];
        }
        
        // Add to local cache
        this.channelMessages[channel].push(messageObj);
        
        // Display in UI
        this.displayMessageInUI(messageObj, channel);
        
        // Send to server
        this.socket.emit('chat-message', messageObj);
        
        // Clear input
        this.messageInput.value = '';
        this.messageInput.focus();
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
            
            // Prepare message data
            const messageData = {
                username: user.username,
                senderId: user.id,
                message: message,
                timestamp: Date.now()
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
            
            // Add to UI immediately for instant feedback
            this.displayMessageInUI(messageData, true);
        } catch (error) {
            console.error('[CHAT_DEBUG] Error sending message:', error);
            this.addSystemMessage('Error sending message. Please try again.');
        }
    }
    
    // Display a message in the UI
    displayMessageInUI(message, channelId) {
        if (!message) return;
        
        console.log('[CHAT_DEBUG] Displaying message:', message);
        
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;
        
        // Check if this is a grouped message (same sender as previous message within 5 minutes)
        let isGroupedMessage = false;
        const previousMessage = messagesContainer.lastElementChild;
        
        if (previousMessage && previousMessage.classList.contains('message')) {
            const prevAuthor = previousMessage.querySelector('.message-author');
            const prevTimestamp = previousMessage.getAttribute('data-timestamp');
            
            if (prevAuthor && prevTimestamp) {
                const prevAuthorName = prevAuthor.textContent;
                const prevTime = new Date(prevTimestamp).getTime();
                const currentTime = new Date(message.timestamp).getTime();
                const timeDiff = currentTime - prevTime;
                
                // If same sender and less than 5 minutes between messages, group them
                if (prevAuthorName === message.sender && timeDiff < 5 * 60 * 1000) {
                    isGroupedMessage = true;
                }
            }
        }
        
        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.setAttribute('data-message-id', message.id || '');
        messageDiv.setAttribute('data-timestamp', message.timestamp || new Date().toISOString());
        messageDiv.setAttribute('data-sender', message.sender || 'Unknown');
        messageDiv.setAttribute('data-sender-id', message.senderId || '');
        
        // Add first-message class if not grouped
        if (!isGroupedMessage) {
            messageDiv.classList.add('first-message');
        }
        
        // Determine if this is the current user's message
        const isOwnMessage = this.currentUser && message.senderId === this.currentUser.id;
        if (isOwnMessage) {
            messageDiv.classList.add('own-message');
        }
        
        // Build message content
        let messageHTML = '';
        
        // Only add avatar and header for first message in a group
        if (!isGroupedMessage) {
            // Get avatar URL (default or user's)
            const avatarUrl = message.avatarUrl || 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1744642336378';
            
            // Format timestamp
            const timestamp = this.formatTimestamp(message.timestamp);
            
            messageHTML += `
                <img src="${avatarUrl}" alt="${message.sender}" class="message-avatar">
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-author">${this.sanitizeHTML(message.sender || 'Unknown User')}</span>&nbsp;<span class="message-timestamp">${timestamp}</span>
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
                            <i class="bi bi-file-earmark"></i> ${this.sanitizeHTML(message.content || 'Shared a file')}
                        </a>
                    </div>
                </div>
            `;
        } else {
            // Regular text message
            messageHTML += `
                <div class="message-text">
                    ${this.sanitizeHTML(message.content || '')}
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
                    ${isOwnMessage ? `
                    <div class="message-action-item danger" data-action="delete">
                        <i class="bi bi-trash"></i> Delete Message
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Set message HTML
        messageDiv.innerHTML = messageHTML;
        
        // Add to container
        messagesContainer.appendChild(messageDiv);
        
        // Setup message action handlers
        this.setupMessageActionHandlers(messageDiv);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
                                
                                // Also check general messages
                                if (this.generalChatMessages) {
                                    const genIndex = this.generalChatMessages.findIndex(
                                        msg => msg.id === messageId
                                    );
                                    
                                    if (genIndex !== -1) {
                                        this.generalChatMessages.splice(genIndex, 1);
                                        console.log(`[CHAT_DEBUG] Removed deleted message from general chat cache`);
                                    }
                                }
                            } else {
                                console.error(`[CHAT_DEBUG] Failed to delete message: ${response.message}`);
                                alert(`Failed to delete message: ${response.message}`);
                            }
                        });
                        
                        // Close menu
                        actionsMenu.classList.remove('show');
                    }
                });
            });
        }
    }
    
    // Close all message action menus when clicking elsewhere
    setupGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            // Check if click is outside any message action menu
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
        
        // Close modal if using one
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
                            console.error(`[CHAT_DEBUG] Failed to delete message: ${response.message}`);
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

    // Initialize emoji picker
    initEmojiPicker() {
        const emojiButton = document.getElementById('emoji-button');
        const emojiPicker = document.querySelector('.emoji-picker');
        const messageInput = document.getElementById('message-input');
        const emojiCategories = document.querySelectorAll('.emoji-category');
        const emojiCategoryContents = document.querySelectorAll('.emoji-category-content');
        const emojiButtons = document.querySelectorAll('.emoji-btn');
        const emojiSearchInput = document.getElementById('emoji-search-input');
        
        // Store recently used emojis (get from local storage if available)
        let recentEmojis = JSON.parse(localStorage.getItem('recentEmojis')) || [];
        
        // Initialize recent emojis display
        this.updateRecentEmojis();
        
        // Toggle emoji picker visibility
        if (emojiButton) {
            emojiButton.addEventListener('click', (e) => {
                e.preventDefault();
                emojiPicker.classList.toggle('d-none');
                
                // Position the emoji picker properly
                if (!emojiPicker.classList.contains('d-none')) {
                    // Calculate position relative to the emoji button
                    const buttonRect = emojiButton.getBoundingClientRect();
                    const pickerHeight = emojiPicker.offsetHeight;
                    
                    // Position the picker above the button
                    emojiPicker.style.bottom = (window.innerHeight - buttonRect.top + 10) + 'px';
                    emojiPicker.style.right = (window.innerWidth - buttonRect.right + 10) + 'px';
                }
            });
        }
        
        // Close the emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPicker.classList.contains('d-none') && 
                !emojiPicker.contains(e.target) && 
                e.target !== emojiButton) {
                emojiPicker.classList.add('d-none');
            }
        });
        
        // Switch between emoji categories
        emojiCategories.forEach(category => {
            category.addEventListener('click', () => {
                // Remove active class from all categories
                emojiCategories.forEach(cat => cat.classList.remove('active'));
                // Add active class to clicked category
                category.classList.add('active');
                
                // Hide all category contents
                emojiCategoryContents.forEach(content => content.classList.remove('active'));
                
                // Show clicked category content
                const categoryName = category.getAttribute('data-category');
                const categoryContent = document.querySelector(`.emoji-category-content[data-category="${categoryName}"]`);
                if (categoryContent) {
                    categoryContent.classList.add('active');
                }
            });
        });
        
        // Handle emoji button clicks
        emojiButtons.forEach(button => {
            button.addEventListener('click', () => {
                const emoji = button.textContent;
                
                // Insert emoji at cursor position
                this.insertEmojiAtCursor(emoji);
                
                // Add to recent emojis
                this.addToRecentEmojis(emoji);
                
                // Update the recent emojis display
                this.updateRecentEmojis();
            });
        });
        
        // Handle emoji search
        if (emojiSearchInput) {
            emojiSearchInput.addEventListener('input', () => {
                const searchTerm = emojiSearchInput.value.toLowerCase();
                
                // If search is empty, reset to showing categories
                if (!searchTerm) {
                    emojiCategoryContents.forEach(content => {
                        content.style.display = content.classList.contains('active') ? 'grid' : 'none';
                    });
                    return;
                }
                
                // Hide all category contents
                emojiCategoryContents.forEach(content => {
                    content.style.display = 'none';
                });
                
                // Show all categories for searching
                const allEmojis = document.querySelectorAll('.emoji-btn');
                allEmojis.forEach(emojiBtn => {
                    const emoji = emojiBtn.textContent;
                    // Simple contains search for now
                    if (emoji.includes(searchTerm)) {
                        emojiBtn.style.display = 'block';
                    } else {
                        emojiBtn.style.display = 'none';
                    }
                });
            });
        }
    }
    
    // Insert emoji at the cursor position in message input
    insertEmojiAtCursor(emoji) {
        const messageInput = document.getElementById('message-input');
        if (!messageInput) return;
        
        const startPos = messageInput.selectionStart;
        const endPos = messageInput.selectionEnd;
        const text = messageInput.value;
        
        // Insert emoji at cursor position
        messageInput.value = text.substring(0, startPos) + emoji + text.substring(endPos);
        
        // Move cursor after the inserted emoji
        messageInput.selectionStart = startPos + emoji.length;
        messageInput.selectionEnd = startPos + emoji.length;
        
        // Focus on the input
        messageInput.focus();
    }
    
    // Add emoji to recent emojis list
    addToRecentEmojis(emoji) {
        // Get recent emojis from local storage
        let recentEmojis = JSON.parse(localStorage.getItem('recentEmojis')) || [];
        
        // Remove emoji if it already exists to avoid duplicates
        recentEmojis = recentEmojis.filter(e => e !== emoji);
        
        // Add emoji to the beginning of the array
        recentEmojis.unshift(emoji);
        
        // Limit to 20 recent emojis
        if (recentEmojis.length > 20) {
            recentEmojis = recentEmojis.slice(0, 20);
        }
        
        // Save back to local storage
        localStorage.setItem('recentEmojis', JSON.stringify(recentEmojis));
    }
    
    // Update the recent emojis display
    updateRecentEmojis() {
        const recentEmojiContent = document.querySelector('.emoji-category-content[data-category="recent"]');
        if (!recentEmojiContent) return;
        
        // Get recent emojis from local storage
        const recentEmojis = JSON.parse(localStorage.getItem('recentEmojis')) || [];
        
        // Clear existing content
        recentEmojiContent.innerHTML = '';
        
        if (recentEmojis.length === 0) {
            // Show a message when no recent emojis
            const noEmojisMsg = document.createElement('div');
            noEmojisMsg.className = 'text-center text-muted p-3';
            noEmojisMsg.textContent = 'No recent emojis';
            recentEmojiContent.appendChild(noEmojisMsg);
        } else {
            // Add each recent emoji
            recentEmojis.forEach(emoji => {
                const emojiBtn = document.createElement('button');
                emojiBtn.className = 'emoji-btn';
                emojiBtn.textContent = emoji;
                
                // Add click event to insert emoji
                emojiBtn.addEventListener('click', () => {
                    this.insertEmojiAtCursor(emoji);
                });
                
                recentEmojiContent.appendChild(emojiBtn);
            });
        }
    }
}

// Export the ChatManager class
console.log('[CHAT_DEBUG] Chat module loaded and ready');
