const fs = require("fs");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { saveToMega, loadFromMega, initializeMega } = require("./mega-storage");
const { 
    registerUser, 
    signInUser, 
    signOutUser, 
    getCurrentUser, 
    getAllUsers 
} = require("./supabase-client");
const {
    sendVerificationEmail,
    verifyCode,
    getVerificationExpiration,
    resendVerificationEmail
} = require("./email-verification");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Add middleware for parsing JSON
app.use(express.json());

const MESSAGE_FILE = "messages.json";

// Serve static files (like index.html)
app.use(express.static('public'));

// Serve the index.html for root path
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// REST API endpoints for verification
app.post('/api/send-verification', async (req, res) => {
    const { email, username, password } = req.body;
    
    if (!email || !username || !password) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    const success = await sendVerificationEmail(email, username, password);
    
    if (success) {
        res.json({ success: true, message: 'Verification email sent' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to send verification email' });
    }
});

app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;
    
    if (!email || !code) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    const userData = verifyCode(email, code);
    
    if (userData) {
        res.json({ success: true, user: userData });
    } else {
        res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }
});

app.post('/api/resend-verification', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Missing email' });
    }
    
    const success = await resendVerificationEmail(email);
    
    if (success) {
        res.json({ success: true, message: 'Verification email resent' });
    } else {
        res.status(400).json({ success: false, message: 'Failed to resend verification email' });
    }
});

// Track active users and socket connections
const users = {};  // socket.id -> username
const activeUsers = new Map();  // username -> socket.id

// Messages storage by channel
let messagesByChannel = {};
const DEFAULT_CHANNEL = 'general';
const BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MESSAGE_RETENTION = 1000; // messages per channel

// Load message history from MEGA or local backup
async function loadMessages() {
    try {
        // Try to load channel-specific messages file
        const messagesData = await loadFromMega(MESSAGE_FILE);
        if (messagesData) {
            try {
                const parsedData = JSON.parse(messagesData);
                
                // Check if the format is the new channel-based format or old format
                if (typeof parsedData === 'object' && !Array.isArray(parsedData)) {
                    messagesByChannel = parsedData;
                    // Count total messages across all channels
                    const totalMessages = Object.values(messagesByChannel)
                        .reduce((sum, messages) => sum + (Array.isArray(messages) ? messages.length : 0), 0);
                    console.log(`Loaded ${totalMessages} messages across ${Object.keys(messagesByChannel).length} channels`);
                } else if (Array.isArray(parsedData)) {
                    // Legacy format - migrate to new format
                    console.log('Migrating from legacy message format to channel-based format');
                    messagesByChannel[DEFAULT_CHANNEL] = parsedData.filter(msg => {
                        // Validate each message during migration
                        return msg && msg.username && (msg.text || msg.content) && 
                               (typeof msg.text === 'string' || typeof msg.content === 'string');
                    }).map(msg => ({
                        // Normalize message format
                        content: msg.text || msg.content,
                        sender: msg.username,
                        timestamp: msg.timestamp || new Date().toISOString(),
                        channel: DEFAULT_CHANNEL
                    }));
                    console.log(`Migrated ${messagesByChannel[DEFAULT_CHANNEL].length} messages to '${DEFAULT_CHANNEL}' channel`);
                    
                    // Save in the new format immediately
                    await saveMessages();
                }
            } catch (parseError) {
                console.error('Error parsing messages file:', parseError);
                initializeDefaultChannels();
            }
        } else {
            console.log('No message history found, initializing with empty channels');
            initializeDefaultChannels();
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        initializeDefaultChannels();
    }
}

// Initialize with default empty channels
function initializeDefaultChannels() {
    messagesByChannel = {
        'general': [],
        'random': [],
        'welcome': []
    };
}

// Create automatic backup of messages periodically
function setupAutomaticBackup() {
    setInterval(async () => {
        try {
            console.log('Performing automatic message backup...');
            await saveMessages();
        } catch (error) {
            console.error('Automatic backup failed:', error);
        }
    }, BACKUP_INTERVAL);
}

// Save messages to MEGA with backup
async function saveMessages() {
    try {
        // Create a temporary file first to avoid corruption
        const tempFile = `${MESSAGE_FILE}.temp`;
        const jsonData = JSON.stringify(messagesByChannel, null, 2); // Pretty format for debugging
        
        // Save to temp file first
        await saveToMega(tempFile, jsonData);
        
        // Then rename/move to actual file
        await saveToMega(MESSAGE_FILE, jsonData);
        
        console.log('Messages saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving messages:', error);
        return false;
    }
}

// Function to add a message to a specific channel with validation
function addMessageToChannel(message, channelName) {
    // Ensure the channel exists
    if (!messagesByChannel[channelName]) {
        messagesByChannel[channelName] = [];
    }
    
    // Only add if message is valid
    if (message && (message.content || message.text) && (message.sender || message.username)) {
        // Normalize the message format
        const normalizedMsg = {
            content: message.content || message.text,
            sender: message.sender || message.username,
            timestamp: message.timestamp || new Date().toISOString(),
            encrypted: !!message.encrypted,
            channel: channelName
        };
        
        // Add to the channel
        messagesByChannel[channelName].push(normalizedMsg);
        
        // Keep only the last N messages per channel
        if (messagesByChannel[channelName].length > MESSAGE_RETENTION) {
            messagesByChannel[channelName].shift();
        }
        
        return true;
    }
    return false;
}

// Check if a message is a duplicate (to prevent double-saving)
function isMessageDuplicate(message, channelName) {
    if (!messagesByChannel[channelName]) return false;
    
    // Look for messages with same sender, content and timestamp within 2 seconds
    return messagesByChannel[channelName].some(msg => {
        if (msg.sender !== message.sender) return false;
        if (msg.content !== message.content) return false;
        
        // Check if timestamps are within 2 seconds
        const msgTime = new Date(msg.timestamp).getTime();
        const newMsgTime = new Date(message.timestamp).getTime();
        return Math.abs(msgTime - newMsgTime) < 2000; // 2 seconds tolerance
    });
}

// Initialize message history and MEGA storage
(async function initialize() {
    try {
        console.log('Initializing storage...');
        await initializeMega();
        await loadMessages();
        setupAutomaticBackup();
        console.log('Storage initialization complete');
    } catch (error) {
        console.error('Storage initialization failed:', error);
        // Initialize with empty channels as fallback
        initializeDefaultChannels();
    }
})();

function updateUserList() {
    // Send the consistent active users list to all clients
    const userList = Array.from(activeUsers.keys());
    io.emit("active-users", userList);
}

// When a user connects, send stored messages
io.on("connection", (socket) => {
    console.log('User connected:', socket.id);
    
    // Get active users list on request
    socket.on('get-active-users', () => {
        // Send the current active users list to the requesting client
        socket.emit("active-users", Array.from(activeUsers.keys()));
        console.log('Sent active users list to client on request:', Array.from(activeUsers.keys()));
    });
    
    // Login user handler
    socket.on('login-user', async (data, callback) => {
        const { username, password } = data;
        
        console.log(`Login attempt for user: ${username}`);
        
        try {
            // For development mode, allow any credentials
            if (process.env.NODE_ENV === 'development') {
                console.log('Development mode: auto-approving login');
                users[socket.id] = username;
                activeUsers.set(username, socket.id);
                updateUserList();
                return callback({ 
                    success: true, 
                    userId: 'dev-' + Date.now(),
                    username
                });
            }
            
            // In production, verify with Supabase
            const user = await signInUser(username, password);
            if (user) {
                console.log(`User authenticated successfully: ${username}`);
                // Store user in active users list
                users[socket.id] = username;
                activeUsers.set(username, socket.id);
                updateUserList();
                callback({ 
                    success: true, 
                    userId: user.id || 'unknown',
                    username
                });
            } else {
                console.log(`Authentication failed for: ${username}`);
                callback({ success: false, message: "Incorrect username or password" });
            }
        } catch (error) {
            console.error(`Login error for ${username}:`, error);
            callback({ success: false, message: "Authentication error. Please try again." });
        }
    });
    
    // Verify user credentials
    socket.on('verify-user', async (data, callback) => {
        const { username, password } = data;
        
        try {
            const user = await signInUser(username, password);
            if (user) {
                callback({ success: true });
            } else {
                callback({ success: false, message: "Incorrect password" });
            }
        } catch (error) {
            callback({ success: false, message: "User not found" });
        }
    });
    
    // Register a new user
    socket.on('register-user', async (data, callback) => {
        const { username, password, email } = data;
        
        if (!email) {
            callback({ success: false, message: "Email is required" });
            return;
        }
        
        try {
            // Identify the email provider for better user feedback
            const parts = email.split('@');
            const domain = (parts.length > 1 && parts[1]) ? parts[1].toLowerCase() : '';
            let providerName = 'email';
            
            if (domain.includes('gmail')) {
                providerName = 'Gmail';
            } else if (domain.includes('yahoo')) {
                providerName = 'Yahoo';
            } else if (domain.includes('proton') || domain.includes('pm.me')) {
                providerName = 'ProtonMail';
            } else if (domain.includes('outlook') || domain.includes('hotmail')) {
                providerName = 'Outlook';
            }
            
            console.log(`Registering user with ${providerName}: ${username} (${email})`);
            
            // Instead of directly registering, send verification email
            const emailSent = await sendVerificationEmail(email, username, password);
            
            if (emailSent) {
                callback({ 
                    success: true, 
                    requireVerification: true,
                    message: `Verification email sent to your ${providerName} account. Please check your inbox.`,
                    provider: providerName
                });
            } else {
                console.error(`Failed to send verification email to ${providerName} account: ${email}`);
                callback({ 
                    success: false, 
                    message: `Failed to send verification email to your ${providerName} account. Please try again or use a different email provider.` 
                });
            }
        } catch (error) {
            console.error('Registration error:', error);
            callback({ success: false, message: "Failed to register user" });
        }
    });
    
    // Verify email code
    socket.on('verify-email', (data, callback) => {
        const { email, code } = data;
        
        if (!email || !code) {
            callback({ success: false, message: "Email and verification code are required" });
            return;
        }
        
        try {
            // For user experience, log email provider information
            const parts = email.split('@');
            const domain = (parts.length > 1 && parts[1]) ? parts[1].toLowerCase() : '';
            let providerName = 'email';
            
            if (domain.includes('gmail')) {
                providerName = 'Gmail';
            } else if (domain.includes('yahoo')) {
                providerName = 'Yahoo';
            } else if (domain.includes('proton') || domain.includes('pm.me')) {
                providerName = 'ProtonMail';
            } else if (domain.includes('outlook') || domain.includes('hotmail')) {
                providerName = 'Outlook';
            }
            
            console.log(`Verifying ${providerName} account: ${email}`);
            
            const userData = verifyCode(email, code);
            
            if (userData) {
                // Now we can register the user with Supabase
                registerUser(userData.username, userData.password, email)
                    .then(user => {
                        if (user) {
                            console.log(`Successfully verified and registered ${providerName} account: ${email}`);
                            callback({ success: true, username: userData.username });
                        } else {
                            console.error(`Failed to create user account with ${providerName}`);
                            callback({ success: false, message: "Failed to create user account" });
                        }
                    })
                    .catch(error => {
                        console.error(`Error registering verified ${providerName} user:`, error);
                        callback({ success: false, message: "Error creating account" });
                    });
            } else {
                console.error(`Invalid or expired verification code for ${providerName} account: ${email}`);
                callback({ success: false, message: "Invalid or expired verification code" });
            }
        } catch (error) {
            console.error('Verification error:', error);
            callback({ success: false, message: "Error during verification" });
        }
    });
    
    // Resend verification email
    socket.on('resend-verification', async (data, callback) => {
        const { email } = data;
        
        if (!email) {
            callback({ success: false, message: "Email is required" });
            return;
        }
        
        try {
            // Identify the email provider for better user feedback
            const parts = email.split('@');
            const domain = (parts.length > 1 && parts[1]) ? parts[1].toLowerCase() : '';
            let providerName = 'email';
            
            if (domain.includes('gmail')) {
                providerName = 'Gmail';
            } else if (domain.includes('yahoo')) {
                providerName = 'Yahoo';
            } else if (domain.includes('proton') || domain.includes('pm.me')) {
                providerName = 'ProtonMail';
            } else if (domain.includes('outlook') || domain.includes('hotmail')) {
                providerName = 'Outlook';
            }
            
            console.log(`Resending verification to ${providerName} account: ${email}`);
            
            const emailSent = await resendVerificationEmail(email);
            
            if (emailSent) {
                callback({ 
                    success: true, 
                    message: `Verification email resent to your ${providerName} account. Please check your inbox.`,
                    provider: providerName
                });
            } else {
                console.error(`Failed to resend verification to ${providerName} account: ${email}`);
                callback({ 
                    success: false, 
                    message: `Failed to resend verification email to your ${providerName} account. Please try again or use a different email.` 
                });
            }
        } catch (error) {
            console.error('Resend verification error:', error);
            callback({ success: false, message: "Error resending verification" });
        }
    });
    
    // Handle password change requests
    socket.on('change-password', async (data, callback) => {
        const { username, currentPassword, newPassword } = data;
        
        try {
            const user = await getCurrentUser();
            if (user && user.username === username) {
                await signOutUser();
                const updatedUser = await signInUser(username, currentPassword);
                if (updatedUser) {
                    await registerUser(username, newPassword);
                    callback({ success: true });
                } else {
                    callback({ success: false, message: "Current password is incorrect" });
                }
            } else {
                callback({ success: false, message: "User not found" });
            }
        } catch (error) {
            callback({ success: false, message: "Failed to change password" });
        }
    });
    
    // Store username
    socket.on('join', (username) => {
        console.log(`User joined: ${username} with socket: ${socket.id}`);
        
        // If this username is already connected with a different socket, disconnect the old one
        const existingSocketId = activeUsers.get(username);
        if (existingSocketId && existingSocketId !== socket.id) {
            console.log(`User ${username} already has an active connection. Replacing old socket.`);
            const oldSocket = io.sockets.sockets.get(existingSocketId);
            if (oldSocket) {
                oldSocket.disconnect();
            }
        }
        
        // Update users mapping
        users[socket.id] = username;
        activeUsers.set(username, socket.id);
        
        // Notify other users
        socket.broadcast.emit('user-joined', username);
        
        // Send active users list to everyone (not just the new user)
        updateUserList();
        
        // Send chat history to the new user
        // Send channel-specific history instead of all messages
        for (const channel in messagesByChannel) {
            if (messagesByChannel.hasOwnProperty(channel)) {
                socket.emit('message-history', {
                    channel,
                    messages: messagesByChannel[channel] || []
                });
            }
        }
    });
    
    // For backward compatibility
    socket.on('set-username', (username) => {
        console.log(`Setting username: ${username} for socket: ${socket.id}`);
        users[socket.id] = username;
        activeUsers.set(username, socket.id);
        updateUserList();
    });
    
    // Handle channel-specific message requests
    socket.on('get-messages', (data) => {
        const channel = data.channel || DEFAULT_CHANNEL;
        console.log(`Requested messages for channel: ${channel}`);
        
        socket.emit('message-history', {
            channel,
            messages: messagesByChannel[channel] || []
        });
    });
    
    // Listen for chat messages from the client
    socket.on("message", (data) => {
        console.log('Legacy message received on server:', data);
        
        // Validate message structure
        const hasValidMessage = data && 
                               data.message && 
                               typeof data.message === 'string' && 
                               data.message.trim() !== '' && 
                               data.username && 
                               typeof data.username === 'string';
        
        if (hasValidMessage) {
            // Save the message to the chat history with normalized structure
            const msg = {
                content: data.message.trim(), // Ensure content is trimmed
                sender: data.username,
                timestamp: new Date().toISOString(),
                channel: DEFAULT_CHANNEL
            };
            
            addMessageToChannel(msg, DEFAULT_CHANNEL);
            
            // Broadcast to all clients
            io.emit('new-message', {
                channel: DEFAULT_CHANNEL,
                message: msg
            });
        }
    });
    
    // New format message handling with channel support
    socket.on('send-message', (data) => {
        console.log('New message received:', data);
        
        // Validate message structure
        const hasValidMessage = data && 
                               data.content && 
                               typeof data.content === 'string' && 
                               data.content.trim() !== '' && 
                               users[socket.id]; // User must be authenticated
        
        if (hasValidMessage) {
            const channel = data.channel || DEFAULT_CHANNEL;
            
            // Create normalized message object
            const msg = {
                content: data.content.trim(),
                sender: users[socket.id],
                timestamp: data.timestamp || new Date().toISOString(),
                encrypted: !!data.encrypted,
                channel
            };
            
            // Add to channel storage
            addMessageToChannel(msg, channel);
            
            // Broadcast to all clients
            io.emit('new-message', {
                channel,
                message: msg
            });
        } else {
            console.warn('Invalid message received:', data);
        }
    });
    
    // Handle persisting messages to MEGA
    socket.on('persist-message', async (data) => {
        if (!data || !data.message) return;
        
        const message = data.message;
        const channel = data.channel || message.channel || DEFAULT_CHANNEL;
        
        // Ensure the message is valid
        if (message && (message.content || message.text) && (message.sender || message.username)) {
            // Normalize message format
            const normalizedMsg = {
                content: message.content || message.text,
                sender: message.sender || message.username,
                timestamp: message.timestamp || new Date().toISOString(),
                encrypted: !!message.encrypted,
                channel
            };
            
            // Add to storage if not a duplicate
            if (!isMessageDuplicate(normalizedMsg, channel)) {
                addMessageToChannel(normalizedMsg, channel);
                console.log(`Message from ${normalizedMsg.sender} persisted to channel: ${channel}`);
                
                // Save every 10 messages to reduce write operations
                if (messagesByChannel[channel].length % 10 === 0) {
                    saveMessages();
                }
            }
        }
    });
    
    // End of the persist-message handler

    // Call signaling
    socket.on('call-offer', ({offer, caller, target, sender}) => {
        console.log(`Call offer from ${caller} to ${target}`);
        
        // Find the target socket
        const targetSocketId = activeUsers.get(target);
        
        if (targetSocketId) {
            console.log(`Found target socket: ${targetSocketId}`);
            io.to(targetSocketId).emit('call-offer', {
                offer, 
                caller,
                sender: sender || caller // Ensure sender is always present
            });
        } else {
            console.log(`Target user ${target} not found`);
            socket.emit('call-error', {
                message: `User ${target} is not available.`,
                code: 'USER_NOT_FOUND'
            });
        }
    });
    
    socket.on('call-answer', ({answer, caller, callee, sender}) => {
        console.log(`Call answer from ${callee || sender} to ${caller}`);
        
        // Find the caller socket
        const callerSocketId = activeUsers.get(caller);
        
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-answer', {
                answer,
                callee: callee || sender || users[socket.id],
                sender: sender || callee || users[socket.id]
            });
        } else {
            socket.emit('call-error', {
                message: `User ${caller} is not available anymore.`,
                code: 'USER_DISCONNECTED'
            });
        }
    });
    
    socket.on('ice-candidate', ({candidate, target, sender}) => {
        console.log(`ICE candidate from ${sender || users[socket.id]} to ${target}`);
        
        // Find the target socket
        const targetSocketId = activeUsers.get(target);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                candidate,
                sender: sender || users[socket.id] // Always include who sent this candidate
            });
        }
    });
    
    socket.on('call-declined', ({caller, reason}) => {
        console.log(`Call declined to ${caller}, reason: ${reason}`);
        
        // Find the target socket
        const callerSocketId = activeUsers.get(caller);
        
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-declined', {reason});
        }
    });
    
    socket.on('end-call', ({target}) => {
        console.log(`Call ended to ${target}`);
        
        if (target) {
            const targetSocketId = activeUsers.get(target);
            
            if (targetSocketId) {
                io.to(targetSocketId).emit('call-ended');
            }
        }
    });
    
    // Logout user handler
    socket.on('logout-user', () => {
        const username = users[socket.id];
        if (username) {
            console.log(`User logged out: ${username}`);
            delete users[socket.id];
            activeUsers.delete(username);
            io.emit('user-left', username);
            updateUserList();
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            console.log(`User disconnected: ${username}`);
            delete users[socket.id];
            activeUsers.delete(username);
            io.emit('user-left', username);
            updateUserList(); // Update the active user list after someone leaves
        }
    });
});

// Listen on the port provided by Glitch or default to 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Chat server running on port ${PORT}`);
});

// Clean up stale connections every 5 minutes
setInterval(() => {
    console.log("Cleaning up stale connections...");
    for (const [username, socketId] of activeUsers.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
            console.log(`Removing stale connection for user: ${username}`);
            activeUsers.delete(username);
            // Remove from users object as well
            for (const [id, name] of Object.entries(users)) {
                if (name === username) {
                    delete users[id];
                }
            }
        }
    }
    updateUserList();
}, 5 * 60 * 1000); // 5 minutes
