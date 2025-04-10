/**
 * Chat module for The Homies App
 * Handles messaging, user status, and UI updates
 */

// Make sure socket is properly initialized
if (typeof socket === 'undefined') {
    console.log('Initializing socket connection...');
    var socket = io();
    
    // Add connection logging
    socket.on('connect', () => {
        console.log('Socket connected successfully with ID:', socket.id);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
}

class ChatManager {
    constructor() {
        this.messagesContainer = document.getElementById('messages-container');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.usersList = document.getElementById('users-list');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.chatTitle = document.getElementById('chat-title');
        
        this.typingTimeout = null;
        this.encryptionKey = localStorage.getItem('messageEncryptionKey');
        this.currentStatus = 'online';
        this.currentChannel = 'general';
        this.messageCache = {}; // Cache for messages by channel
        
        this.statusIcons = {
            'online': 'bi-circle-fill text-success',
            'away': 'bi-circle-fill text-warning',
            'busy': 'bi-circle-fill text-danger'
        };
        
        this.statusText = {
            'online': 'Online',
            'away': 'Away',
            'busy': 'Do Not Disturb'
        };
        
        this.messagesByChannel = {};
        this.unreadMessagesByChannel = {};
    }
    
    initialize() {
        console.log('Initializing chat manager...');
        
        // Ensure username is in localStorage for proper message display
        const userData = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (userData && userData.username) {
            localStorage.setItem('username', userData.username);
            console.log('Set username in localStorage:', userData.username);
        }
        
        // Set up all event listeners
        this.setupEventListeners();
        
        // Load message history
        this.loadMessageHistory();
        
        console.log('Chat manager initialization complete');
    }
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Direct DOM references to ensure we have the elements
        const sendButton = document.getElementById('send-button');
        const messageInput = document.getElementById('message-input');
        const channelItems = document.querySelectorAll('.channel-item');
        const statusOptions = document.querySelectorAll('.status-option');
        
        // Message sending with click
        if (sendButton) {
            sendButton.onclick = (e) => {
                e.preventDefault();
                console.log('Send button clicked');
                this.sendMessage();
                return false;
            };
            console.log('Send button handler attached');
        } else {
            console.error('Send button not found in DOM');
        }
        
        // Message sending with enter key
        if (messageInput) {
            messageInput.onkeypress = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('Enter key pressed, sending message');
                    this.sendMessage();
                    return false;
                }
            };
            
            // Typing indicator
            messageInput.oninput = () => this.handleTyping();
            console.log('Message input handlers attached');
        } else {
            console.error('Message input not found in DOM');
        }
        
        // Channel switching
        channelItems.forEach(channel => {
            channel.onclick = (e) => {
                e.preventDefault();
                console.log('Channel item clicked:', channel.getAttribute('data-channel'));
                
                // Remove active class from all channels
                channelItems.forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked channel
                channel.classList.add('active');
                
                // Switch channel using data attribute
                const channelName = channel.getAttribute('data-channel') || 'general';
                this.switchChannel(channelName);
                return false;
            };
        });
        console.log('Channel item handlers attached to', channelItems.length, 'items');
        
        // Status options
        statusOptions.forEach(option => {
            option.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const status = option.getAttribute('data-status');
                console.log('Status option clicked:', status);
                this.updateUserStatus(status);
                return false;
            };
        });
        console.log('Status option handlers attached');
        
        // Socket events
        socket.on('chat-message', (data) => {
            console.log('Received chat message from server:', data);
            this.addMessageToChat(data);
        });
        
        socket.on('message-history', (data) => {
            console.log('Received message history:', data);
            const channel = data.channel || 'general';
            const messages = data.messages || [];
            
            // Cache the messages for this channel
            this.messageCache[channel] = messages;
            
            // If this is the current channel, display the messages
            if (this.currentChannel === channel) {
                this.displayMessageHistory(messages);
            }
        });
        
        socket.on('active-users', (users) => {
            console.log('Received active users list:', users);
            this.updateUsersList(users);
        });
        
        socket.on('user-joined', (username) => {
            console.log('User joined:', username);
            this.addSystemMessage(`${username} has joined the chat`);
            // Request updated users list
            socket.emit('get-active-users');
        });
        
        socket.on('user-left', (username) => {
            console.log('User left:', username);
            this.addSystemMessage(`${username} has left the chat`);
            // Request updated users list
            socket.emit('get-active-users');
        });
        
        // Request users list
        socket.emit('get-active-users');
        console.log('Socket event handlers attached');
    }
    
    // We'll keep the old initEventListeners for compatibility, but it won't do anything
    initEventListeners() {
        console.log('Deprecated initEventListeners called - using setupEventListeners instead');
    }
    
    // We'll keep the old initChannelListeners for compatibility, but it won't do anything
    initChannelListeners() {
        console.log('Deprecated initChannelListeners called - using setupEventListeners instead');
    }
    
    switchChannel(channelName) {
        this.currentChannel = channelName;
        
        // Update chat title
        this.chatTitle.textContent = `# ${channelName}`;
        
        // Update message input placeholder
        this.messageInput.placeholder = `Message #${channelName}`;
        
        // Load channel messages if available in cache
        if (this.messageCache[channelName]) {
            this.displayMessageHistory(this.messageCache[channelName]);
        } else {
            // Otherwise request from server
            this.loadChannelMessages(channelName);
        }
    }
    
    loadMessageHistory() {
        this.loadChannelMessages(this.currentChannel);
    }
    
    loadChannelMessages(channel) {
        socket.emit('get-messages', { channel });
    }
    
    sendMessage() {
        const messageInput = document.getElementById('message-input');
        if (!messageInput) {
            console.error('Message input element not found');
            return;
        }
        
        const message = messageInput.value.trim();
        console.log('Attempting to send message:', message);
        
        if (message) {
            // Get user info from sessionStorage
            const userData = JSON.parse(sessionStorage.getItem('user') || '{}');
            const username = userData.username || localStorage.getItem('username') || 'Anonymous';
            
            // Create message object
            const messageObj = {
                message: message,
                username: username,
                timestamp: Date.now(),
                channel: this.currentChannel
            };
            
            console.log('Sending message to server:', messageObj);
            
            // Send to server
            socket.emit('chat-message', messageObj);
            
            // Add to UI immediately for faster feedback
            this.addMessageToUI(messageObj);
            
            // Clear input
            messageInput.value = '';
            console.log('Message sent and input cleared');
        } else {
            console.log('Empty message, not sending');
        }
    }
    
    addMessageToChat(data) {
        const message = data.message || data.content || data;
        const username = data.username || data.sender;
        const timestamp = data.timestamp || Date.now();
        const channel = data.channel || data.channelId || this.currentChannel;
        
        // Create the message object with a consistent format
        const messageObj = {
            username,
            message: typeof message === 'object' ? message.message || message.content : message,
            timestamp,
            channelId: channel,
            id: data.id || Date.now() + '-' + Math.random().toString(36).substr(2, 9)
        };
        
        // Add to storage
        this.addMessageToStorage(messageObj, channel);
        
        // Only display if this is the active channel
        if (channel === this.currentChannel) {
            // Add to UI
            this.addMessageToUI(messageObj);
        } else {
            // Increment unread count for this channel
            this.unreadMessagesByChannel[channel] = (this.unreadMessagesByChannel[channel] || 0) + 1;
            // Update the UI to show unread count
            this.updateChannelUnreadCount();
        }
    }
    
    addMessageToStorage(messageObj, channel = 'general') {
        // Ensure channel exists
        if (!this.messagesByChannel[channel]) {
            this.messagesByChannel[channel] = [];
        }
        
        // Add message
        this.messagesByChannel[channel].push(messageObj);
        
        // Limit number of messages stored (prevent memory issues)
        if (this.messagesByChannel[channel].length > 300) {
            this.messagesByChannel[channel].shift();
        }
    }
    
    addMessageToUI(messageObj) {
        const chatMessages = document.getElementById('messages-container');
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        
        // Check if it's the current user's message
        if (messageObj.username === localStorage.getItem('username')) {
            messageElement.classList.add('my-message');
        } else {
            messageElement.classList.add('other-message');
        }
        
        // Format timestamp
        const date = new Date(messageObj.timestamp);
        const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-username">${messageObj.username}</span>
                <span class="message-time">${timeString}</span>
            </div>
            <div class="message-content">${this.formatMessageContent(messageObj.message)}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    displayMessageHistory(messages) {
        this.messagesContainer.innerHTML = '';
        messages.forEach(message => this.addMessageToUI(message));
        this.scrollToBottom();
    }
    
    displayMessage(message, scroll = true) {
        // Check if we need to start a new message group
        const shouldStartNewGroup = this.shouldStartNewMessageGroup(message);
        let messageElement;
        
        // Normalize username field (some may use sender, some username)
        const username = message.username || message.sender;
        const isCurrentUser = username === localStorage.getItem('username');
        
        if (shouldStartNewGroup) {
            // Create a new message group
            messageElement = document.createElement('div');
            messageElement.classList.add('message');
            messageElement.dataset.username = username;
            messageElement.dataset.timestamp = message.timestamp || new Date().toISOString();
            
            let avatarLetter = username ? username.charAt(0).toUpperCase() : 'U';
            
            // Add avatar, sender and message
            messageElement.innerHTML = `
                <div class="message-avatar" style="background-color: ${this.getUserColor(username)}">
                    ${avatarLetter}
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">${isCurrentUser ? 'You' : username}</span>
                        <span class="message-time">${this.formatMessageTime(message.timestamp)}</span>
                        ${message.encrypted ? '<i class="bi bi-lock-fill ms-2" title="End-to-End Encrypted"></i>' : ''}
                    </div>
                    <div class="message-text"></div>
                </div>
            `;
        } else {
            // Find last message in the same group
            const lastMessage = Array.from(this.messagesContainer.children)
                .filter(el => el.dataset.username === username)
                .pop();
                
            if (lastMessage) {
                messageElement = lastMessage;
            } else {
                // Fallback to creating a new message
                return this.displayMessage({...message, forceNewGroup: true}, scroll);
            }
        }
        
        // Decrypt if encrypted
        let content = message.content;
        if (message.encrypted && this.encryptionKey) {
            try {
                content = CryptoJS.AES.decrypt(content, this.encryptionKey).toString(CryptoJS.enc.Utf8);
            } catch (error) {
                console.error('Decryption error:', error);
                content = '🔒 [Encrypted message - Cannot decrypt]';
            }
        }
        
        // Process content for display
        content = this.formatMessageContent(content);
        
        if (shouldStartNewGroup) {
            // Set the content in the new message
            messageElement.querySelector('.message-text').innerHTML = content;
            this.messagesContainer.appendChild(messageElement);
        } else {
            // Add new paragraph to existing message
            const messageText = messageElement.querySelector('.message-text');
            
            // Update message with new content
            messageText.innerHTML += `<br>${content}`;
            
            // Update timestamp
            const timeElement = messageElement.querySelector('.message-time');
            if (timeElement) {
                timeElement.textContent = this.formatMessageTime(message.timestamp);
            }
            
            // Update the message timestamp
            messageElement.dataset.timestamp = message.timestamp || new Date().toISOString();
        }
        
        // Store the message in MEGA after displaying
        this.persistMessageToMEGA(message);
        
        if (scroll) {
            this.scrollToBottom();
        }
    }
    
    persistMessageToMEGA(message) {
        // Make sure we don't try to persist the same message multiple times
        if (message._persisted) return;
        
        // Mark as persisted to avoid duplicates
        message._persisted = true;
        
        // Queue the message for MEGA storage
        socket.emit('persist-message', {
            message,
            channel: message.channel || this.currentChannel
        });
    }
    
    shouldStartNewMessageGroup(message) {
        if (message.forceNewGroup) return true;
        
        // Get all existing messages
        const messages = Array.from(this.messagesContainer.children);
        
        // If no messages yet, start a new group
        if (messages.length === 0) return true;
        
        // Get the last message in the container
        const lastMessage = messages[messages.length - 1];
        
        // Normalize username
        const username = message.username || message.sender;
        
        // If the last message is from a different user, start a new group
        if (lastMessage.dataset.username !== username) return true;
        
        // If the last message is more than 5 minutes older, start a new group
        const lastTimestamp = new Date(lastMessage.dataset.timestamp);
        const currentTimestamp = new Date(message.timestamp || new Date());
        const timeDifference = (currentTimestamp - lastTimestamp) / (1000 * 60); // diff in minutes
        
        return timeDifference > 5;
    }
    
    getUserColor(username) {
        // Generate a consistent color for a username
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Use Discord-like colors
        const colors = [
            '#5865F2', // Discord blue
            '#3BA55C', // Discord green
            '#ED4245', // Discord red
            '#FAA61A', // Discord yellow/orange
            '#9B59B6', // Purple
            '#2ECC71', // Green
            '#E74C3C', // Red
            '#3498DB'  // Blue
        ];
        
        return colors[Math.abs(hash) % colors.length];
    }
    
    formatMessageTime(timestamp) {
        const messageDate = timestamp ? new Date(timestamp) : new Date();
        
        // Today's date for comparison
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Check if same day
        if (messageDate.toDateString() === today.toDateString()) {
            return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } 
        // Check if yesterday
        else if (messageDate.toDateString() === yesterday.toDateString()) {
            return `Yesterday at ${messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } 
        // Otherwise show full date
        else {
            return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
                   ` at ${messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
    }
    
    formatMessageContent(content) {
        // Basic formatting: Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        content = content.replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
        
        // Convert line breaks to <br>
        content = content.replace(/\n/g, '<br>');
        
        // Convert emojis
        content = this.replaceEmojis(content);
        
        return content;
    }
    
    replaceEmojis(text) {
        const emojiMap = {
            ':)': '😊',
            ':D': '😃',
            ':(': '😞',
            ':P': '😋',
            ';)': '😉',
            '<3': '❤️',
            ':+1:': '👍',
            ':-1:': '👎'
        };
        
        for (const [code, emoji] of Object.entries(emojiMap)) {
            text = text.replace(new RegExp(code.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1'), 'g'), emoji);
        }
        
        return text;
    }
    
    addSystemMessage(content) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('system-message');
        messageElement.textContent = content;
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }
    
    updateUsersList(users) {
        this.usersList.innerHTML = '';
        
        // Group users by status
        const onlineUsers = [];
        const awayUsers = [];
        const busyUsers = [];
        
        users.forEach(user => {
            const username = typeof user === 'string' ? user : user.username;
            const status = user.status || 'online';
            
            if (username === localStorage.getItem('username')) return;
            
            switch(status) {
                case 'online':
                    onlineUsers.push({ username, status });
                    break;
                case 'away':
                    awayUsers.push({ username, status });
                    break;
                case 'busy':
                    busyUsers.push({ username, status });
                    break;
                default:
                    onlineUsers.push({ username, status: 'online' });
            }
        });
        
        // Create status group headers and user items
        if (onlineUsers.length > 0) {
            this.createUserStatusGroup('ONLINE', onlineUsers.length, onlineUsers);
        }
        
        if (awayUsers.length > 0) {
            this.createUserStatusGroup('AWAY', awayUsers.length, awayUsers);
        }
        
        if (busyUsers.length > 0) {
            this.createUserStatusGroup('DO NOT DISTURB', busyUsers.length, busyUsers);
        }

        // Update header in the DOM to show actual count
        const membersHeader = document.querySelector('.members-header');
        if (membersHeader) {
            membersHeader.textContent = `ONLINE — ${onlineUsers.length}`;
        }
    }
    
    createUserStatusGroup(statusLabel, count, users) {
        // Create header
        const header = document.createElement('div');
        header.classList.add('members-header');
        header.textContent = `${statusLabel} — ${count}`;
        this.usersList.appendChild(header);
        
        // Create users
        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.classList.add('user-item');
            userElement.setAttribute('data-username', user.username);
            
            const statusClass = this.statusIcons[user.status] || this.statusIcons.online;
            const userInitial = user.username.charAt(0).toUpperCase();
            
            userElement.innerHTML = `
                <div class="user-item-avatar" style="background-color: ${this.getUserColor(user.username)}">
                    ${userInitial}
                    <span class="user-status-indicator ${statusClass}"></span>
                </div>
                <span class="user-name">${user.username}</span>
                <button class="btn btn-sm btn-outline-primary float-end call-btn" data-username="${user.username}">
                    <i class="bi bi-camera-video"></i>
                </button>
            `;
            
            this.usersList.appendChild(userElement);
        });
        
        // Add event listeners to call buttons
        document.querySelectorAll('.call-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetUser = e.currentTarget.getAttribute('data-username');
                
                // This will be handled by video-call.js
                if (window.videoCallManager) {
                    window.videoCallManager.initiateCall(targetUser);
                }
            });
        });
    }
    
    updateUserInList(username, status) {
        const userItem = this.usersList.querySelector(`[data-username="${username}"]`);
        if (!userItem) return;
        
        const statusIcon = userItem.querySelector('.bi');
        if (statusIcon) {
            // Remove all status classes
            Object.values(this.statusIcons).forEach(cls => {
                const classes = cls.split(' ');
                classes.forEach(c => statusIcon.classList.remove(c));
            });
            
            // Add new status class
            const newClasses = this.statusIcons[status].split(' ');
            newClasses.forEach(c => statusIcon.classList.add(c));
        }
    }
    
    updateUserStatus(status) {
        if (!this.statusIcons[status]) return;
        
        // Update UI
        const statusDisplay = document.getElementById('user-status-display');
        const statusText = document.getElementById('status-text');
        
        // Remove all existing classes
        statusDisplay.className = '';
        // Add the new status icon class
        statusDisplay.classList.add('bi', 'bi-circle-fill', this.statusIcons[status].split(' ')[1]);
        
        // Update status text
        statusText.textContent = this.statusText[status];
        
        // Store current status
        this.currentStatus = status;
        
        // Inform the server
        socket.emit('status-update', { status });
        
        console.log(`Status updated to: ${status}`);
    }
    
    handleTyping() {
        socket.emit('typing');
        
        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        // Set new timeout
        this.typingTimeout = setTimeout(() => {
            this.stopTypingNotification();
        }, 3000);
    }
    
    stopTypingNotification() {
        socket.emit('stop-typing');
        
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }
    
    showTypingIndicator(username) {
        this.typingIndicator.textContent = `${username} is typing...`;
        this.typingIndicator.classList.remove('d-none');
    }
    
    hideTypingIndicator() {
        this.typingIndicator.classList.add('d-none');
    }
    
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    updateChannelUnreadCount() {
        // Update unread count for each channel
        document.querySelectorAll('.channel-item').forEach(channel => {
            const channelName = channel.textContent.trim().replace(/^[#\s]+/, '').trim();
            const unreadCount = this.unreadMessagesByChannel[channelName] || 0;
            channel.querySelector('.unread-count').textContent = unreadCount > 0 ? unreadCount : '';
        });
    }
}

// Will be initialized in app.js
