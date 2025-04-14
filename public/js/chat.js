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
            const itemName = item.querySelector('span').textContent.trim();
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
        
        // Display channel messages
        if (this.channelMessages[channelName]) {
            this.channelMessages[channelName].forEach(msg => this.displayMessageInUI(msg, channelName));
        } else {
            this.displaySystemMessage(`Welcome to #${channelName}`);
        }
        
        // Request channel history from server
        this.socket.emit('join-channel', { channel: channelName });
        
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
        
        // Update state
        this.currentDmRecipientId = recipientUser.id;
        this.inGeneralChat = false;
        this.currentChannel = null;
        
        // Update UI
        this.chatTitle.textContent = `@${username}`;
        
        // Clear messages container
        this.messagesContainer.innerHTML = '';
        
        // Show DM messages if available
        const conversationKey = this.currentUser.id + '_' + recipientUser.id;
        const reverseKey = recipientUser.id + '_' + this.currentUser.id;
        
        if (this.dmConversations[conversationKey]) {
            this.renderMessageHistory(this.dmConversations[conversationKey]);
        } else if (this.dmConversations[reverseKey]) {
            this.renderMessageHistory(this.dmConversations[reverseKey]);
        } else {
            this.addSystemMessage(`This is the beginning of your conversation with ${username}`);
        }
        
        // Mark conversation as active in UI
        this.updateActiveDM(username);
        
        // Focus message input
        this.messageInput.focus();
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
        
        // Handle different message types
        if (message.channel === 'general' || message.isGeneralMessage) {
            // General chat message
            this.generalChatMessages.push(message);
            
            if (this.inGeneralChat) {
                this.displayMessageInUI(message, 'general');
            }
        } else if (message.channel && this.channelMessages[message.channel]) {
            // Channel message
            this.channelMessages[message.channel].push(message);
            
            if (this.currentChannel === message.channel) {
                this.displayMessageInUI(message, message.channel);
            }
        } else if (message.recipientId === this.currentUser.id || message.senderId === this.currentUser.id) {
            // DM message
            const otherUserId = message.senderId === this.currentUser.id ? message.recipientId : message.senderId;
            
            if (!this.dmConversations[otherUserId]) {
                this.dmConversations[otherUserId] = [];
            }
            
            this.dmConversations[otherUserId].push(message);
            
            if (this.currentDmRecipientId === otherUserId) {
                this.displayMessageInUI(message, 'dm');
            }
        }
    }
    
    // Handle message history
    handleMessageHistory(data) {
        console.log('[CHAT_DEBUG] Received message history:', data);
        
        if (!data || !data.messages) return;
        
        if (data.type === 'dm' && data.userId) {
            // DM history
            this.dmConversations[data.userId] = data.messages;
            
            if (this.currentDmRecipientId === data.userId) {
                this.clearMessagesContainer();
                data.messages.forEach(msg => this.displayMessageInUI(msg, 'dm'));
            }
        } else if (data.type === 'channel' && data.channel) {
            // Channel history
            this.channelMessages[data.channel] = data.messages;
            
            if (this.currentChannel === data.channel) {
                this.clearMessagesContainer();
                data.messages.forEach(msg => this.displayMessageInUI(msg, data.channel));
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
        const message = this.messageInput.value.trim();
        
        if (!message) {
            return; // Don't send empty messages
        }
        
        // Force socket reconnection if needed
        if (!this.socket.connected) {
            console.log('[CHAT_DEBUG] Socket disconnected, attempting to reconnect...');
            this.socket.connect();
            
            // Add system message
            this.addSystemMessage('Reconnecting to server...');
            
            // Give it a moment to reconnect
            setTimeout(() => {
                if (this.socket.connected) {
                    console.log('[CHAT_DEBUG] Socket reconnected, sending message');
                    this._sendMessageNow(message);
                } else {
                    console.log('[CHAT_DEBUG] Cannot send message: Socket not connected.');
                    this.addSystemMessage('Cannot send message: disconnected. Try refreshing the page.');
                    
                    // Store message in local storage to try later
                    const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
                    pendingMessages.push({
                        message,
                        timestamp: Date.now(),
                        channel: this.currentChannel,
                        dmRecipient: this.currentDmRecipientId
                    });
                    localStorage.setItem('pendingMessages', JSON.stringify(pendingMessages));
                }
            }, 1000);
            return;
        }
        
        this._sendMessageNow(message);
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
    
    // Add a missing function to render message history
    renderMessageHistory(messages) {
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            this.addSystemMessage("No previous messages");
            return;
        }
        
        // Sort messages by timestamp if they have timestamps
        const sortedMessages = [...messages].sort((a, b) => {
            return (a.timestamp || 0) - (b.timestamp || 0);
        });
        
        // Display each message in the UI
        sortedMessages.forEach(message => {
            this.displayMessageInUI(message, 'dm');
        });
        
        // Scroll to bottom after rendering
        this.scrollToBottom();
    }
    
    // Display message in UI
    displayMessageInUI(message, context) {
        if (!this.messagesContainer || !message) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        
        // Format timestamp
        const timestamp = new Date(message.timestamp);
        const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const formattedDate = timestamp.toLocaleDateString();
        const timeDisplay = `Today at ${formattedTime}`;
        
        // Create avatar (default or user avatar)
        const avatarSrc = message.avatarUrl || 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1744642336378';
        
        // Construct message HTML
        messageElement.innerHTML = `
            <img src="${avatarSrc}" alt="${message.username}'s Avatar" class="message-avatar">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${message.username}</span>
                    <span class="message-timestamp">${timeDisplay}</span>
                </div>
                <div class="message-text">
                    ${this.formatMessageContent(message.message)}
                </div>
            </div>
        `;
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
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
}

// Export the ChatManager class
console.log('[CHAT_DEBUG] Chat module loaded and ready');
