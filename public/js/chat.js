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
        this.needsInitialDataFetch = false; // Flag to fetch users/status on connect
        this.isSocketConnected = this.socket ? this.socket.connected : false; // Track connection state
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
        
        // Bind methods that need 'this' context, especially event handlers
        this.sendMessage = this.sendMessage.bind(this);
        this.handleReconnect = this.handleReconnect.bind(this); // Still useful for specific reconnect logic
        this.showSettings = this.showSettings.bind(this);
        this.hideSettings = this.hideSettings.bind(this);
        this.handleSocketConnect = this.handleSocketConnect.bind(this); // New connect handler
        this.handleSocketDisconnect = this.handleSocketDisconnect.bind(this); // New disconnect handler
        this.attachEventListeners = this.attachEventListeners.bind(this); // Bind attach function itself
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
        this.updateCurrentUserDisplay(); // Update sidebar display immediately
        this.attachEventListeners(); // Attach DOM listeners and BASIC socket listeners

        // --- Don't emit yet! Set flags instead --- 
        this.needsInitialDataFetch = true;
        console.log('[CHAT_DEBUG] Set flag: needsInitialDataFetch = true');

        // Check if socket is ALREADY connected (might happen on quick reloads)
        if (this.isSocketConnected) {
            console.log('[CHAT_DEBUG] Socket already connected during init, triggering initial data fetch.');
            this.performInitialDataFetch(); // Defined below
        } else {
            console.log('[CHAT_DEBUG] Socket not connected during init, waiting for connect event.');
            // Add a system message maybe? 
            // this.addSystemMessage('Connecting...'); // Could add this later
        }
        
        // Don't request message history here, wait for DM selection
        this.displayPlaceholderMessage("Select a conversation from the left to start chatting."); // Define later
        
        this.isInitialized = true;
        console.log('[CHAT_DEBUG] ChatManager successfully initialized (structure setup, waiting for socket).');
        // Removed: setActiveChannel, updateUserStatus(), requestUserList()
    }
    
    // Centralized place to perform actions needed on connection/initialization
    performInitialDataFetch() {
        if (!this.needsInitialDataFetch) return; // Only run once
        
        console.log('[CHAT_DEBUG] Performing initial data fetch...');
        this.updateUserStatus(this.currentStatus); // Now it's safe to emit
        this.requestUserList(); // Now it's safe to emit
        
        this.needsInitialDataFetch = false; // Clear the flag
        console.log('[CHAT_DEBUG] Initial data fetch complete, flag cleared.');
    }

    // Implemented: Attaches DOM and Socket Listeners
    attachEventListeners() {
        console.log('[CHAT_DEBUG] Attaching ChatManager event listeners...');

        // --- DOM Event Listeners (Keep existing logic) ---
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

        // --- Socket Event Listeners (Use .off().on() pattern AND manage connection state) ---
        console.log('[CHAT_DEBUG] Attaching/Re-attaching CORE socket event listeners using .off().on()');
        
        // Handle connection
        this.socket.off('connect').on('connect', this.handleSocketConnect);
        
        // Handle disconnection
        this.socket.off('disconnect').on('disconnect', this.handleSocketDisconnect);
        
        // Listen for connection errors (optional but good for debugging)
        this.socket.off('connect_error').on('connect_error', (error) => {
            console.error('[CHAT_DEBUG] Socket connection error:', error);
            this.addSystemMessage('Connection error...'); // Use addSystemMessage if defined
            this.isSocketConnected = false; // Ensure state is updated
        });
        
        // --- Attach application-specific listeners AFTER connection --- 
        // These are now attached/re-attached in handleSocketConnect
        // this.attachAppSocketListeners(); // We'll call this from handleSocketConnect

        console.log('[CHAT_DEBUG] CORE socket event listeners attached.');
    }
    
    // NEW: Handler for socket connection
    handleSocketConnect() {
        console.log('[APP_DEBUG] Socket connected with ID:', this.socket.id);
        this.isSocketConnected = true;
        this.addSystemMessage('Connected to server.'); // Use addSystemMessage if defined
        
        // Re-authenticate or inform server of user identity if necessary (depends on server setup)
        // This might be handled by AuthManager or here
        // Example: this.socket.emit('re-authenticate', { userId: this.currentUser.id });
        
        // Attach application-specific listeners now that we are connected
        this.attachAppSocketListeners();
        
        // Perform initial data fetch if needed (e.g., after login or reconnection)
        if (this.isInitialized && this.needsInitialDataFetch) {
            console.log('[CHAT_DEBUG] Socket connected, performing initial data fetch.');
            this.performInitialDataFetch();
        } else if (this.isInitialized) {
            // If it's a reconnect, just request user list/status again
            console.log('[CHAT_DEBUG] Socket reconnected, refreshing user status and list.');
            this.updateUserStatus(this.currentStatus); 
            this.requestUserList();
        }
    }

    // NEW: Handler for socket disconnection
    handleSocketDisconnect(reason) {
        console.log('[APP_DEBUG] Socket disconnected:', reason);
        this.isSocketConnected = false;
        this.addSystemMessage(`Disconnected: ${reason}. Attempting to reconnect...`); // Use addSystemMessage if defined
        // Clear user list? Maybe show a disconnected state?
        // this.dmListContainer.innerHTML = '<p class="text-muted p-2">Disconnected</p>';
        // Set flag to refetch data on reconnect
        this.needsInitialDataFetch = true; 
    }
    
    // NEW: Attach application-specific socket listeners (called on connect)
    attachAppSocketListeners() {
         console.log('[CHAT_DEBUG] Attaching application-specific socket listeners...');
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

        console.log('[CHAT_DEBUG] Application-specific socket listeners attached.');
    }

    // Implemented: Emit event - Request full user list
    requestUserList() {
        if (this.isSocketConnected) {
            console.log('[CHAT_DEBUG] Requesting full user list from server...');
            this.socket.emit('get-all-users'); 
        } else {
             console.error('[CHAT_DEBUG] Cannot request user list: Socket not connected.');
             this.addSystemMessage('Cannot fetch users: disconnected.'); // Inform user
        }
    }

    // Implemented: Emit event - Send a DM
    sendMessage() {
        const messageText = this.messageInput.value.trim();
        
        if (!this.currentDmRecipientId) {
            console.warn('[CHAT_DEBUG] Cannot send message: No DM recipient selected.');
            this.addSystemMessage('Please select a conversation first.');
            return;
        }

        if (messageText === '') {
            return; // Don't send empty messages
        }

        if (!this.isSocketConnected) {
            console.error('[CHAT_DEBUG] Cannot send message: Socket not connected.');
            this.addSystemMessage('Cannot send message: disconnected.');
            return;
        }
        
        console.log(`[CHAT_DEBUG] Sending DM to ${this.currentDmRecipientId}: ${messageText}`);

        const messageData = {
            recipientId: this.currentDmRecipientId,
            message: messageText,
            // senderId will be added by the server based on the socket connection
        };
        
        this.socket.emit('send-dm', messageData);

        // Add message optimistically to the UI (or wait for confirmation)
        // For now, let's assume we wait for 'dm-message' broadcast or direct confirmation
        // addMessageToConversation(this.currentDmRecipientId, { ... message content, senderId: this.currentUser.id });

        this.messageInput.value = ''; // Clear input field
        this.messageInput.focus();
    }

    // Implemented: Display list of users for DMs
    displayUserList() {
         console.log('[CHAT_DEBUG] Displaying user list in sidebar (placeholder)...');
         // TODO: Implement logic to render users in this.dmListContainer
    }
    
    // Implemented: Update text content
    updateCurrentUserDisplay() {
        if (this.currentUser && this.currentUserDisplay) {
            this.currentUserDisplay.textContent = this.currentUser.username;
            // Update avatar later if available
        } else {
            console.warn('[CHAT_DEBUG] Cannot update current user display.');
        }
    }
    
    // Implemented: Emit event
    updateUserStatus(newStatus) {
        console.log('[CHAT_DEBUG] Attempting to update status to:', newStatus);
        if (!this.currentUser || !this.currentUser.id) {
             console.error("[CHAT_DEBUG] Cannot update status: Current user unknown.");
             return;
        }
        this.currentStatus = newStatus;
        // Update UI immediately (e.g., dropdown indicator)
        // TODO: Add UI update logic here if needed

        if (this.isSocketConnected) {
            console.log(`[CHAT_DEBUG] Emitting user-status-update: ${newStatus}`);
            this.socket.emit('user-status-update', { userId: this.currentUser.id, status: newStatus });
        } else {
            console.error('[CHAT_DEBUG] Cannot emit status update: Socket not connected.');
            // The status will be sent when the 'connect' event fires next via performInitialDataFetch
        }
    }

    // --- DM Conversation Management ---
    // ... rest of your code remains the same ...
}
