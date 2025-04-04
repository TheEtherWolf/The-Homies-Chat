const fs = require("fs");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { 
    registerUser, 
    signInUser, 
    signOutUser, 
    getCurrentUser, 
    getAllUsers 
} = require("./supabase-client");
const { 
    sendVerificationEmail, 
    verifyEmail, 
    resendVerificationEmail 
} = require("./email-verification");

// Import storage modules
const { 
    connectToMega, 
    loadMessages, 
    saveMessages 
} = require("./mega-storage");

// Set NODE_ENV to development if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Running in ${process.env.NODE_ENV} mode`);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Add middleware for parsing JSON
app.use(express.json());

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
    
    const userData = verifyEmail(email, code);
    
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
let channelMessages = {}; // Messages for each channel
let activeUsers = new Set(); // Set of active users
let users = {}; // Map of socket ID to username

// Initialize storage and load messages
async function initializeStorage() {
    try {
        // Connect to MEGA
        await connectToMega();
        
        // Load messages from storage (Supabase first, then MEGA, then local backup)
        const messagesData = await loadMessages();
        
        if (messagesData && messagesData.channels) {
            channelMessages = messagesData.channels;
            
            // Count messages
            let totalMessages = 0;
            let channelCount = 0;
            
            for (const channel in channelMessages) {
                if (Array.isArray(channelMessages[channel])) {
                    totalMessages += channelMessages[channel].length;
                    channelCount++;
                }
            }
            
            console.log(`Loaded ${totalMessages} messages across ${channelCount} channels`);
        } else {
            console.log('No messages found, creating empty structure');
            channelMessages = { general: [] };
            
            // Save empty initial structure
            await saveMessages({ channels: channelMessages });
        }
        
        console.log('Storage initialization complete');
    } catch (error) {
        console.error('Error initializing storage:', error);
        
        // Create empty structure for fallback
        channelMessages = { general: [] };
    }
}

// Save messages to storage
async function saveAllMessages() {
    try {
        return await saveMessages({ channels: channelMessages });
    } catch (error) {
        console.error('Error saving messages:', error);
        return false;
    }
}

// Throttled save function
let saveTimeout = null;
function throttledSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(async () => {
        await saveAllMessages();
    }, 5000); // Save every 5 seconds
}

// Initialize message history and MEGA storage
(async function initialize() {
    try {
        console.log('Initializing storage...');
        await initializeStorage();
        console.log('Storage initialization complete');
    } catch (error) {
        console.error('Storage initialization failed:', error);
    }
})();

function updateUserList() {
    // Send the consistent active users list to all clients
    const userList = Array.from(activeUsers);
    io.emit("active-users", userList);
}

// When a user connects, send stored messages
io.on("connection", (socket) => {
    console.log('User connected:', socket.id);
    
    // Get active users list on request
    socket.on('get-active-users', () => {
        // Send the current active users list to the requesting client
        socket.emit("active-users", Array.from(activeUsers));
        console.log('Sent active users list to client on request:', Array.from(activeUsers));
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
                activeUsers.add(username);
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
                activeUsers.add(username);
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
            
            // Check if in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log('Development mode: skipping email verification and Supabase registration');
                
                // Store user directly for development
                const userId = 'dev-' + Date.now();
                
                // Add user to active users
                callback({ 
                    success: true,
                    userId: userId,
                    username,
                    message: `Account created successfully in development mode!`
                });
                
                return;
            }
            
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
            
            const userData = verifyEmail(email, code);
            
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
        const existingSocketId = Object.keys(users).find(id => users[id] === username);
        if (existingSocketId && existingSocketId !== socket.id) {
            console.log(`User ${username} already has an active connection. Replacing old socket.`);
            const oldSocket = io.sockets.sockets.get(existingSocketId);
            if (oldSocket) {
                oldSocket.disconnect();
            }
        }
        
        // Update users mapping
        users[socket.id] = username;
        activeUsers.add(username);
        
        // Notify other users
        socket.broadcast.emit('user-joined', username);
        
        // Send active users list to everyone (not just the new user)
        updateUserList();
        
        // Send chat history to the new user
        for (const channel in channelMessages) {
            if (channelMessages.hasOwnProperty(channel)) {
                socket.emit('message-history', {
                    channel,
                    messages: channelMessages[channel] || []
                });
            }
        }
    });
    
    // For backward compatibility
    socket.on('set-username', (username) => {
        console.log(`Setting username: ${username} for socket: ${socket.id}`);
        users[socket.id] = username;
        activeUsers.add(username);
        updateUserList();
    });
    
    // Handle channel-specific message requests
    socket.on('get-messages', (data) => {
        const channel = data.channel || 'general';
        console.log(`Requested messages for channel: ${channel}`);
        
        socket.emit('message-history', {
            channel,
            messages: channelMessages[channel] || []
        });
    });
    
    // Handle message
    socket.on('chat-message', async (data) => {
        // Skip blank or null messages
        if (!data.message || data.message.trim() === '') {
            return;
        }

        const username = users[socket.id];
        if (!username) {
            return;
        }

        const channel = data.channel || 'general';
        
        // Ensure channel exists
        if (!channelMessages[channel]) {
            channelMessages[channel] = [];
        }

        // Create message object with proper structure
        const messageObj = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            username,
            message: data.message,
            timestamp: Date.now(),
            channelId: channel
        };

        // Add to channel
        channelMessages[channel].push(messageObj);

        // Broadcast to all users
        io.emit('chat-message', {...messageObj, channel});

        // Save messages (throttled to prevent excessive writes)
        throttledSave();
    });
    
    // Call signaling
    socket.on('call-offer', ({offer, caller, target, sender}) => {
        console.log(`Call offer from ${caller} to ${target}`);
        
        // Find the target socket
        const targetSocketId = Object.keys(users).find(id => users[id] === target);
        
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
        const callerSocketId = Object.keys(users).find(id => users[id] === caller);
        
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
        const targetSocketId = Object.keys(users).find(id => users[id] === target);
        
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
        const callerSocketId = Object.keys(users).find(id => users[id] === caller);
        
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-declined', {reason});
        }
    });
    
    socket.on('end-call', ({target}) => {
        console.log(`Call ended to ${target}`);
        
        if (target) {
            const targetSocketId = Object.keys(users).find(id => users[id] === target);
            
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
    for (const username of activeUsers) {
        const socketId = Object.keys(users).find(id => users[id] === username);
        const socket = io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
            console.log(`Removing stale connection for user: ${username}`);
            activeUsers.delete(username);
            // Remove from users object as well
            delete users[socketId];
        }
    }
    updateUserList();
}, 5 * 60 * 1000); // 5 minutes
