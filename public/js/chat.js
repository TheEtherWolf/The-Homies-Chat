/**
 * Chat module for The Homies App
 * Handles messaging, user status, and UI updates
 */

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
        socket.on('new-message', (message) => this.displayMessage(message));
        socket.on('message-history', (messages) => this.displayMessageHistory(messages));
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
        socket.emit('get-messages');
    }
    
    sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content) return;
        
        // Get user
        const username = localStorage.getItem('username');
        if (!username) return;
        
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
        
        socket.emit('send-message', {
            content: encryptedContent,
            encrypted
        });
        
        this.messageInput.value = '';
        
        // Clear typing indicator
        this.stopTypingNotification();
    }
    
    displayMessageHistory(messages) {
        this.messagesContainer.innerHTML = '';
        messages.forEach(message => this.displayMessage(message, false));
        this.scrollToBottom();
    }
    
    displayMessage(message, scroll = true) {
        const isCurrentUser = message.sender === localStorage.getItem('username');
        
        // Decrypt if encrypted
        let content = message.content;
        if (message.encrypted && this.encryptionKey) {
            try {
                content = CryptoJS.AES.decrypt(content, this.encryptionKey).toString(CryptoJS.enc.Utf8);
            } catch (error) {
                console.error('Decryption error:', error);
                content = '[Encrypted message - Cannot decrypt]';
            }
        }
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', isCurrentUser ? 'message-sent' : 'message-received');
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div class="message-content">${this.formatMessageContent(content)}</div>
            <div class="message-info">
                <span class="message-sender">${isCurrentUser ? 'You' : message.sender}</span>
                <span class="message-time">${timestamp}</span>
                ${message.encrypted ? '<i class="bi bi-lock-fill" title="End-to-End Encrypted"></i>' : ''}
            </div>
            <div class="message-reactions"></div>
        `;
        
        this.messagesContainer.appendChild(messageElement);
        
        if (scroll) {
            this.scrollToBottom();
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
        
        users.forEach(user => {
            const username = typeof user === 'string' ? user : user.username;
            const status = user.status || 'online';
            
            if (username === localStorage.getItem('username')) return;
            
            const userElement = document.createElement('div');
            userElement.classList.add('user-item');
            userElement.setAttribute('data-username', username);
            
            const statusClass = this.statusIcons[status] || this.statusIcons.online;
            
            userElement.innerHTML = `
                <i class="bi ${statusClass}"></i>
                <span class="user-name">${username}</span>
                <button class="btn btn-sm btn-outline-primary float-end call-btn" data-username="${username}">
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
        
        // Update UI
        const statusDisplay = document.getElementById('user-status-display');
        const statusIcon = statusDisplay.querySelector('i');
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
