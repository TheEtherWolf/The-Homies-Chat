/**
 * Chat module for The Homies App - DM Focused
 * Handles direct messaging, user list, settings, and UI updates
 */

// Use the global socket from app.js directly
console.log('[CHAT_DEBUG] Chat module initialized, using global socket connection');

class ChatManager {
    constructor(socket, authManager) {
        console.log('[CHAT_DEBUG] ChatManager constructor called.');
        this.socket = socket;
        this.authManager = authManager; // Keep reference if needed for user info
        
        // --- DOM Element References (Updated for DM Layout) ---
        this.messagesContainer = document.getElementById('messages-container');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.dmListContainer = document.getElementById('dm-list'); // *** UPDATED ***
        this.chatHeader = document.getElementById('chat-header'); // Use the whole header
        this.dmPartnerName = document.getElementById('dm-partner-name'); // *** NEW ***
        this.dmPartnerAvatar = document.getElementById('dm-partner-avatar'); // *** NEW ***
        this.statusOptions = document.querySelectorAll('.status-option'); // Keep status dropdown for now
        this.currentUserDisplay = document.getElementById('current-user'); // In sidebar
        this.settingsButton = document.getElementById('settings-button'); // *** NEW ***
        this.settingsPane = document.getElementById('settings-pane'); // *** NEW ***
        this.closeSettingsButton = document.getElementById('close-settings-button'); // *** NEW ***
        this.mainContentArea = document.getElementById('main-content'); // *** NEW ***
        this.sidebar = document.getElementById('sidebar'); // *** NEW ***
        // --- Removed: usersList, chatTitle, typingIndicator, channelButtons ---

        // --- State Variables (Updated for DM Layout) ---
        this.currentDmRecipientId = null; // *** NEW *** Track the user ID of the current DM conversation
        this.dmConversations = {}; // *** NEW *** Cache messages: { 'recipientUserId': [messages] }
        this.allUsers = {}; // *** NEW *** Store all fetched users: { 'userId': {username, id, status?, avatar_url?} }
        this.currentStatus = 'online'; // Keep status for now
        this.currentUser = null; // Store current user info { username, id }
        this.isInitialized = false;
        // --- Removed: currentChannel, messagesByChannel, messageCache, unreadMessagesByChannel, activeUsers, typingTimeout ---

        this.statusIcons = { // Keep for potential future use
            online: 'text-success',
            away: 'text-warning',
            busy: 'text-danger'
        };
        this.statusText = { // Keep for potential future use
            online: 'Online',
            away: 'Away',
            busy: 'Do Not Disturb'
        };
        
        // Bind methods needed early or frequently
        this.sendMessage = this.sendMessage.bind(this); // Will be refactored later
        this.handleReconnect = this.handleReconnect.bind(this); // Will be refactored later
        this.showSettings = this.showSettings.bind(this); // Add settings toggle later
        this.hideSettings = this.hideSettings.bind(this); // Add settings toggle later
        // Other methods will be bound/defined later
    }

    // Modified initialize to accept user info and set up for DMs
    initialize(user) {
        console.log('[CHAT_DEBUG] ChatManager initialize called with user:', user);
        if (this.isInitialized) {
            console.warn('[CHAT_DEBUG] ChatManager already initialized. Aborting.');
            return;
        }
        if (!user || !user.id || !user.username) {
             console.error('[CHAT_DEBUG] Initialization failed: Invalid user object provided.', user);
             // Potentially notify the user or AuthManager
             return;
        }
        
        this.currentUser = user; 
        this.updateCurrentUserDisplay(); // Update sidebar display
        this.attachEventListeners(); // Call this, but listeners will be added in next steps
        this.updateUserStatus(this.currentStatus); // Set initial status (will emit later)

        // Request the list of users AFTER basic setup
        console.log('[CHAT_DEBUG] Requesting user list after initialization...');
        this.requestUserList(); // Define this method later
        
        // Don't request message history here, wait for DM selection
        this.displayPlaceholderMessage("Select a conversation from the left to start chatting."); // Define later
        
        this.isInitialized = true;
        console.log('[CHAT_DEBUG] ChatManager successfully initialized (structure setup).');
        // Removed: setActiveChannel, requestInitialData (replaced by requestUserList)
    }

    // Implemented: Attaches DOM and Socket Listeners
    attachEventListeners() {
        console.log('[CHAT_DEBUG] Attaching ChatManager event listeners...');

        // --- DOM Event Listeners ---
        if (this.sendButton && this.messageInput) {
            // Use named functions for easier removal if needed later
            this.sendMessageHandler = this.sendMessage.bind(this); // Defined later
            this.messageKeypressHandler = (e) => { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    this.sendMessage(); // Defined later
                } 
            };
            
            this.sendButton.removeEventListener('click', this.sendMessageHandler);
            this.messageInput.removeEventListener('keypress', this.messageKeypressHandler);

            this.sendButton.addEventListener('click', this.sendMessageHandler);
            this.messageInput.addEventListener('keypress', this.messageKeypressHandler);
        } else {
            console.error('[CHAT_DEBUG] Send button or message input not found!');
        }

        // Event delegation for dynamically added DM list items
        if (this.dmListContainer) {
            // Define handler separately for potential removal
            this.handleDmItemClick = (event) => {
                 const dmItem = event.target.closest('.dm-item');
                 if (dmItem && dmItem.dataset.userId) {
                     event.preventDefault();
                     const recipientId = dmItem.dataset.userId;
                     this.openDmConversation(recipientId); // Define later
                 }
            };
            this.dmListContainer.removeEventListener('click', this.handleDmItemClick); // Remove previous if any
            this.dmListContainer.addEventListener('click', this.handleDmItemClick);
        } else {
             console.error('[CHAT_DEBUG] DM list container not found!');
        }
        
        // Settings toggle
        if(this.settingsButton) {
             this.settingsButton.removeEventListener('click', this.showSettings); // Remove previous
             this.settingsButton.addEventListener('click', this.showSettings);
        }
         if(this.closeSettingsButton) {
             this.closeSettingsButton.removeEventListener('click', this.hideSettings); // Remove previous
             this.closeSettingsButton.addEventListener('click', this.hideSettings);
        }

        // Status options (keep logic, ensure updateUserStatus is implemented)
        this.statusOptions.forEach(option => {
            const status = option.dataset.status;
            // Ensure handler is bound correctly and remove previous if any
            const handler = () => this.updateUserStatus(status); // Implemented below
            option.removeEventListener('click', option.handlerRef); // Use stored ref if exists
            option.addEventListener('click', handler);
            option.handlerRef = handler; // Store reference for removal
        });

        // --- Socket Event Listeners (Use .off().on() pattern) ---
        console.log('[CHAT_DEBUG] Attaching/Re-attaching socket event listeners using .off().on()');
        
        // Listen for the list of all users
        this.socket.off('user-list-all').on('user-list-all', (users) => {
            console.log('[CHAT_DEBUG] Received user-list-all event:', users);
            this.updateAllUsers(users); // Define later
            this.displayUserList(); // Define later
        });

        // Listen for Direct Messages
        this.socket.off('dm-message').on('dm-message', (data) => {
            console.log('[CHAT_DEBUG] Received dm-message event:', data);
            this.handleIncomingDm(data); // Define later
        });
        
        // Listen for DM history response
        this.socket.off('dm-history').on('dm-history', (data) => {
            console.log('[CHAT_DEBUG] Received dm-history event for recipient:', data.recipientId);
            this.handleDmHistory(data); // Define later
        });

        // Listen for updates to a specific user's status/info
        this.socket.off('user-updated').on('user-updated', (user) => {
             console.log('[CHAT_DEBUG] Received user-updated event:', user);
             this.handleUserUpdate(user); // Define later
        });
        
         // Listen for users joining (might be new potential DM partners)
        this.socket.off('user-joined').on('user-joined', (user) => {
            console.log('[CHAT_DEBUG] Received user-joined event (new potential DM partner):', user);
             this.handleUserJoined(user); // Define later
        });

        // Listen for users leaving
        this.socket.off('user-left').on('user-left', (userId) => {
            console.log('[CHAT_DEBUG] Received user-left event:', userId);
             this.handleUserLeft(userId); // Define later
        });

        console.log('[CHAT_DEBUG] Socket event listeners attached/re-attached.');
    }

    // Implemented: Emit event
    requestUserList() {
        console.log('[CHAT_DEBUG] Requesting full user list from server...');
        // TODO: Implement socket emit in the next edit
        if (this.socket && this.socket.connected) {
             this.socket.emit('get-all-users'); 
        } else {
             console.error('[CHAT_DEBUG] Cannot request user list: Socket not connected.');
        }
    }
    
    // Implemented: Basic placeholder display
    displayPlaceholderMessage(text) {
         console.log('[CHAT_DEBUG] Displaying placeholder message:', text);
         if (this.messagesContainer) {
             // Basic placeholder for now
             this.messagesContainer.innerHTML = `<div class="text-center text-muted mt-5 placeholder-message">${text}</div>`;
         } else {
             console.error('[CHAT_DEBUG] messagesContainer not found for placeholder.');
         }
     }
     
     // Implemented: Update text content
     updateCurrentUserDisplay() {
         console.log('[CHAT_DEBUG] Updating current user display...');
          if (this.currentUserDisplay && this.currentUser) {
             this.currentUserDisplay.textContent = this.currentUser.username;
         } else {
              console.warn('[CHAT_DEBUG] Cannot update current user display.');
         }
     }
     
     // Implemented: Update status and emit event
     updateUserStatus(status) {
         console.log('[CHAT_DEBUG] Updating user status to:', status);
         if (!this.statusText[status]) {
              console.warn('[CHAT_DEBUG] Invalid status provided:', status);
              return;
         }
         this.currentStatus = status;
         
         // TODO: Update any visual indicator for the current user's status in the UI
         // Example: Update the icon in the profile dropdown
         const statusDisplay = document.getElementById('user-status-display'); // Assuming ID exists
         const statusTextElement = document.getElementById('status-text'); // Assuming ID exists
         if (statusDisplay) {
            statusDisplay.className = 'bi bi-circle-fill me-2'; // Reset classes
            statusDisplay.classList.add(this.statusIcons[status] || 'text-secondary');
         }
         if (statusTextElement) {
             statusTextElement.textContent = this.statusText[status];
         }
         
         // Emit the update to the server
         if (this.socket && this.socket.connected && this.currentUser) {
             this.socket.emit('status-update', { userId: this.currentUser.id, status: this.currentStatus });
             console.log('[CHAT_DEBUG] Emitted status-update:', { userId: this.currentUser.id, status: this.currentStatus });
         } else {
              console.error('[CHAT_DEBUG] Cannot emit status update: Socket not connected or user not identified.');
         }
     }

    // To be fully implemented later
    handleReconnect() {
        console.log('[CHAT_DEBUG] Handling socket reconnection (placeholder)...');
        if (!this.isInitialized || !this.currentUser) {
            console.warn('[CHAT_DEBUG] ChatManager not fully initialized, cannot handle reconnect.');
            return;
        }
        // Re-attach listeners is handled by .off().on() in attachEventListeners
        // Re-emit current status
        this.updateUserStatus(this.currentStatus);
        // Request fresh user list
        this.requestUserList(); 
        // Re-request history for the currently open DM if any
        if (this.currentDmRecipientId) {
             this.requestDmHistory(this.currentDmRecipientId); // Define later
        }
    }
    
    // Placeholder - Define later
    sendMessage() {
        console.log('[CHAT_DEBUG] sendMessage called (placeholder)...');
        // TODO: Implement DM sending logic later
    }
    
    // Implemented: Show settings pane
    showSettings() {
        console.log('[CHAT_DEBUG] showSettings called.');
        if (this.settingsPane && this.mainContentArea && this.sidebar) {
             this.settingsPane.classList.remove('d-none');
             this.mainContentArea.classList.add('d-none'); // Hide chat view
             // Optional: Add class to sidebar to indicate settings are open
             this.sidebar.classList.add('settings-open'); 
        } else {
             console.error('[CHAT_DEBUG] Cannot show settings: Pane or main content area not found.');
        }
    }
    
    // Implemented: Hide settings pane
    hideSettings() {
        console.log('[CHAT_DEBUG] hideSettings called.');
         if (this.settingsPane && this.mainContentArea && this.sidebar) {
             this.settingsPane.classList.add('d-none');
             this.mainContentArea.classList.remove('d-none'); // Show chat view
             this.sidebar.classList.remove('settings-open'); 
        } else {
             console.error('[CHAT_DEBUG] Cannot hide settings: Pane or main content area not found.');
        }
    }

    // --- REMOVED OLD METHODS ---
    // switchChannel, setActiveChannel, displayMessageHistory (old version),
    // updateUsersList, addUserToList, removeUserFromList, addSystemMessage (old version),
    // updateUserStatusDisplay, handleTyping, startTyping, stopTyping, etc.
    
    // Method to add messages (will be used by incoming/history later)
    // Placeholder - Define later
    addMessageToDisplay(message, isCurrentUser) {
        console.log('[CHAT_DEBUG] Adding message to display (placeholder)...', message);
        // TODO: Implement message element creation and appending later
    }

    // Placeholder - Define later
    scrollToBottom() {
        console.log('[CHAT_DEBUG] Scrolling to bottom (placeholder)...');
         if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
    
    // --- NEW PLACEHOLDERS for socket event handlers ---
    
    // Placeholder - Define later
    updateAllUsers(users) {
        console.log('[CHAT_DEBUG] Updating local user cache (placeholder)...', users);
        // TODO: Implement logic to update this.allUsers
    }
    
    // Placeholder - Define later
    displayUserList() {
         console.log('[CHAT_DEBUG] Displaying user list in sidebar (placeholder)...');
         // TODO: Implement logic to render users in this.dmListContainer
    }
    
    // Placeholder - Define later
    handleIncomingDm(data) {
         console.log('[CHAT_DEBUG] Handling incoming DM (placeholder)...', data);
         // TODO: Implement logic to cache and potentially display message
    }
    
    // Placeholder - Define later
    handleDmHistory(data) {
         console.log('[CHAT_DEBUG] Handling DM history response (placeholder)...', data);
         // TODO: Implement logic to cache and display history
    }
    
    // Placeholder - Define later
    handleUserUpdate(user) {
         console.log('[CHAT_DEBUG] Handling user update (placeholder)...', user);
         // TODO: Implement logic to update user in this.allUsers and potentially UI
    }
    
    // Placeholder - Define later
    handleUserJoined(user) {
         console.log('[CHAT_DEBUG] Handling user joined (placeholder)...', user);
         // TODO: Implement logic to add user to this.allUsers and potentially UI
    }
    
    // Placeholder - Define later
    handleUserLeft(userId) {
         console.log('[CHAT_DEBUG] Handling user left (placeholder)...', userId);
         // TODO: Implement logic to remove user from this.allUsers and potentially UI
    }
    
     // Placeholder - Define later
     openDmConversation(recipientId) {
          console.log('[CHAT_DEBUG] Opening DM conversation (placeholder)...', recipientId);
          // TODO: Implement logic to set current recipient, update header, request history
     }
     
     // Placeholder - Define later
     requestDmHistory(recipientId) {
         console.log('[CHAT_DEBUG] Requesting DM history (placeholder)...', recipientId);
         // TODO: Implement socket emit later
     }
}
