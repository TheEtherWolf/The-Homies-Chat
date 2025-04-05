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
    }
    
    initialize() {
        this.initEventListeners();
        this.initChannelListeners();
        this.loadMessageHistory();
        
        // Update status options handlers
        document.querySelectorAll('.status-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                const status = e.currentTarget.getAttribute('data-status');
                this.updateUserStatus(status);
            });
        });
    }
    
    initChannelListeners() {
        // Set up channel switching
        document.querySelectorAll('.channel-item').forEach(channel => {
            channel.addEventListener('click', (e) => {
                // Remove active class from all channels
                document.querySelectorAll('.channel-item').forEach(c => {
                    c.classList.remove('active');
                });
                
                // Add active class to clicked channel
                e.currentTarget.classList.add('active');
                
                // Get channel name from text content (remove the # and spaces)
                const channelText = e.currentTarget.textContent.trim();
                const channelName = channelText.replace(/^[#\s]+/, '').trim();
                
                this.switchChannel(channelName);
            });
        });
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
    
    initEventListeners() {
        // Message sending
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Typing indicator
        this.messageInput.addEventListener('input', () => this.handleTyping());
        
        // Socket events
        socket.on('new-message', (message) => {
            // Add message to cache for the appropriate channel
            const channel = message.channel || 'general';
            if (!this.messageCache[channel]) {
                this.messageCache[channel] = [];
            }
            this.messageCache[channel].push(message);
            
            // Only display if we're in that channel
            if (this.currentChannel === channel) {
                this.displayMessage(message);
            }
        });
        
        socket.on('message-history', (data) => {
            const { channel, messages } = data;
            // Store messages in cache
            this.messageCache[channel] = messages;
            
            // Only display if we're in that channel
            if (this.currentChannel === channel) {
                this.displayMessageHistory(messages);
            }
        });
        
        socket.on('user-joined', (username) => this.addSystemMessage(`${username} has joined the chat`));
        socket.on('user-left', (username) => this.addSystemMessage(`${username} has left the chat`));
        socket.on('user-status-update', (users) => this.updateUsersList(users));
        socket.on('user-typing', (data) => this.showTypingIndicator(data.username));
        socket.on('user-stopped-typing', (data) => this.hideTypingIndicator());
        socket.on('user-status-change', (data) => this.updateUserInList(data.username, data.status));
        
        // Request users list
        socket.emit('get-active-users');
    }
    
    loadMessageHistory() {
        this.loadChannelMessages(this.currentChannel);
    }
    
    loadChannelMessages(channel) {
        socket.emit('get-messages', { channel });
    }
    
    sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content) return;
        
        console.log('Attempting to send message:', content);
        
        // Get user
        const username = localStorage.getItem('username');
        if (!username) {
            console.error('No username found in localStorage');
            return;
        }
        
        // Encrypt message for secure transmission
        let encrypted = false;
        let encryptedContent = content;
        
        if (this.encryptionKey) {
            try {
                encryptedContent = CryptoJS.AES.encrypt(content, this.encryptionKey).toString();
                encrypted = true;
            } catch (error) {
                console.error('Encryption error:', error);
            }
        }
        
        // Create message object
        const messageData = {
            content: encryptedContent,
            encrypted,
            channel: this.currentChannel,
            timestamp: new Date().toISOString() // Add precise timestamp
        };
        
        console.log('Emitting message to server:', messageData);
        
        // Try both new and legacy formats to ensure compatibility
        socket.emit('send-message', messageData);
        
        // Also try legacy format as fallback
        socket.emit('message', {
            message: content,
            username: username
        });
        
        // Add message to local display immediately to improve UX
        this.displayMessage({
            content: content,
            sender: username,
            timestamp: new Date().toISOString(),
            channel: this.currentChannel,
            forceNewGroup: true // Always start a new message group for our own messages
        });
        
        this.messageInput.value = '';
        
        // Clear typing indicator
        this.stopTypingNotification();
        
        // Focus the input field
        this.messageInput.focus();
    }
    
    displayMessageHistory(messages) {
        this.messagesContainer.innerHTML = '';
        messages.forEach(message => this.displayMessage(message, false));
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
        this.currentStatus = status;
        
        // Update UI - for our new Discord-like UI
        const statusIcon = document.getElementById('user-status-display');
        const statusText = document.getElementById('status-text');
        
        // Remove all classes and add the new one
        Object.values(this.statusIcons).forEach(cls => {
            const classes = cls.split(' ');
            classes.forEach(c => statusIcon.classList.remove(c));
        });
        
        const newClasses = this.statusIcons[status].split(' ');
        newClasses.forEach(c => statusIcon.classList.add(c));
        
        statusText.textContent = this.statusText[status];
        
        // Send to server
        socket.emit('status-update', status);
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
}

// Will be initialized in app.js
