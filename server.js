const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4, validate: isValidUUID } = require('uuid');
require('dotenv').config();

// Import storage and email verification modules
const storage = require('./mega-storage');
const { 
  sendVerificationEmail, 
  verifyEmail, 
  resendVerificationEmail 
} = require('./email-verification');

const { 
    registerUser, 
    signInUser, 
    signOutUser, 
    getCurrentUser, 
    getAllUsers,
    saveMessageToSupabase
} = require("./supabase-client");

// Set NODE_ENV to development if not set
process.env.NODE_ENV = 'development';
process.env.ALLOW_DEV_AUTH = 'true';
console.log(`Running in ${process.env.NODE_ENV} mode with dev auth enabled`);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Add middleware for parsing JSON
app.use(express.json());

// Check various paths for serving static files
const possiblePaths = ['public', '.', './public', '../public'];
let staticPath = 'public'; // Default path

// Attempt to find the correct static file path
for (const path of possiblePaths) {
    try {
        const indexPath = path === '.' ? './index.html' : `${path}/index.html`;
        if (fs.existsSync(indexPath)) {
            staticPath = path;
            console.log(`Found index.html at ${indexPath}`);
            break;
        }
    } catch (err) {
        // Continue checking other paths
    }
}

// Serve static files from the validated path
app.use(express.static(staticPath));
console.log(`Serving static files from: ${staticPath}`);

// Serve the index.html for root path with fallback options
app.get('/', (req, res) => {
    // Try multiple possible locations for index.html
    const possibleIndexPaths = [
        __dirname + '/public/index.html',
        __dirname + '/index.html',
        './public/index.html',
        './index.html'
    ];

    // Try each path until we find one that exists
    for (const indexPath of possibleIndexPaths) {
        try {
            if (fs.existsSync(indexPath)) {
                console.log(`Serving index.html from: ${indexPath}`);
                return res.sendFile(indexPath, { root: '.' });
            }
        } catch (err) {
            // Continue to next path
        }
    }

    // If no index.html is found, return an error
    res.status(404).send('Cannot find index.html in any expected location');
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
let users = {}; // Map of socket ID to { username, userId }

// Initialize storage and load messages
async function initializeStorage() {
    try {
        // Connect to MEGA
        await storage.connectToMega();
        
        // Load messages from storage (Supabase first, then MEGA, then local backup)
        const messagesData = await storage.loadMessages();
        
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
            await storage.saveMessages({ channels: channelMessages });
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
        return await storage.saveMessages({ channels: channelMessages });
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
            // Always allow login for testing
            const forceAuth = true; // Set to false when ready for production authentication
            
            if (forceAuth || (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true')) {
                console.log('Development/testing mode: approving login');
                
                // Instead of making up a dev ID that won't work with foreign key constraints,
                // check if this user exists in Supabase first
                let userId;
                
                try {
                    // Try to find user in Supabase
                    const existingUser = await signInUser(username, password);
                    if (existingUser && existingUser.id) {
                        // If user exists, use their actual UUID
                        userId = existingUser.id;
                        console.log(`Development mode: Found existing user with ID: ${userId}`);
                    } else {
                        // If user doesn't exist, create a test user in Supabase
                        // This ensures the user ID will satisfy the foreign key constraint
                        console.log(`Development mode: Auto-creating test user in Supabase`);
                        const devEmail = `${username}@example.com`;
                        const testUser = await registerUser(username, password, devEmail);
                        
                        if (testUser && testUser.id) {
                            userId = testUser.id;
                            console.log(`Development mode: Created test user with ID: ${userId}`);
                        } else {
                            // If we can't create a user, generate a valid UUID but warn it may not work
                            userId = uuidv4(); 
                            console.warn(`Development mode: Could not create Supabase user. Generated UUID ${userId} may not satisfy foreign key constraints.`);
                        }
                    }
                } catch (userError) {
                    console.error('Error finding/creating test user:', userError);
                    // Fall back to UUID, but at least generate a proper UUID without 'dev-' prefix
                    userId = uuidv4();
                    console.warn(`Development mode: Using generated UUID ${userId}. This may not work for message sending.`);
                }
                
                users[socket.id] = { username, userId }; // Store username and userId
                activeUsers.add(username);
                updateUserList();
                return callback({ 
                    success: true, 
                    userId, // Return userId
                    username
                });
            }
            
            // In production, verify with Supabase
            const user = await signInUser(username, password);
            if (user) {
                console.log(`User authenticated successfully: ${username} with ID: ${user.id}`);
                // Store user in active users list
                users[socket.id] = { username, userId: user.id }; // Store username and actual userId (UUID)
                activeUsers.add(username);
                updateUserList();
                callback({ 
                    success: true, 
                    userId: user.id, // Return actual userId
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
            
            // Always allow registration for testing
            const forceRegistration = true; // Set to false for production
            
            // Check if in development mode or if we're forcing registration for testing
            if (forceRegistration || (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true')) {
                console.log('Testing mode: skipping email verification');
                
                // Try to create a real user in Supabase
                try {
                    const newUser = await registerUser(username, password, email);
                    if (newUser && newUser.id) {
                        callback({ 
                            success: true,
                            userId: newUser.id,
                            username,
                            message: `Account created successfully!`
                        });
                        return;
                    }
                } catch (supabaseError) {
                    console.warn('Could not create Supabase user:', supabaseError.message);
                }
                
                // Fallback to a test user if Supabase creation failed
                const testUserId = uuidv4();
                
                callback({ 
                    success: true,
                    userId: testUserId,
                    username,
                    message: `Test account created successfully!`
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
        const existingSocketId = Object.keys(users).find(id => users[id] && users[id].username === username);
        if (existingSocketId && existingSocketId !== socket.id) {
            console.log(`User ${username} already has an active connection. Replacing old socket.`);
            const oldSocket = io.sockets.sockets.get(existingSocketId);
            if (oldSocket) {
                oldSocket.disconnect();
            }
        }
        
        // Update users mapping
        users[socket.id] = { username, userId: null }; // Initialize with null userId
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
        users[socket.id] = { username, userId: null }; // Initialize with null userId
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

        const userInfo = users[socket.id]; // Get user info object { username, userId }
        if (!userInfo || !userInfo.username) {
            console.error('User not found for socket:', socket.id);
            return; // Don't process if user info is incomplete
        }
        
        const username = userInfo.username;
        
        // CRITICAL FIX: Ensure we have a valid sender ID that exists in Supabase
        let userId = null;
        
        // First try to use the socket's stored userId (should be a valid UUID)
        if (userInfo.userId && typeof userInfo.userId === 'string') {
            userId = userInfo.userId;
        }
        
        // If we don't have a valid userId in the socket info, try to find one in Supabase
        if (!userId || !isValidUUID(userId)) {
            try {
                // Get or create a user record for this username
                console.log(`Finding or creating user record for ${username}`);
                const { data: userRecord } = await supabase
                    .from('users')
                    .select('id')
                    .eq('username', username)
                    .limit(1);
                    
                if (userRecord && userRecord.length > 0) {
                    // Use the existing user's ID
                    userId = userRecord[0].id;
                    console.log(`Found existing user ID for ${username}: ${userId}`);
                } else {
                    // Create a new user record with a proper UUID
                    const newUserId = uuidv4();
                    const { error } = await supabase
                        .from('users')
                        .insert([{ 
                            id: newUserId, 
                            username: username,
                            created_at: new Date().toISOString()
                        }]);
                        
                    if (!error) {
                        userId = newUserId;
                        console.log(`Created new user record for ${username} with ID: ${userId}`);
                    } else {
                        console.error(`Error creating user record: ${error.message}`);
                    }
                }
                
                // Update our local users map with the valid ID
                if (userId) {
                    users[socket.id].userId = userId;
                }
            } catch (err) {
                console.error('Error finding/creating user record:', err);
            }
        }
        
        // If we still don't have a valid userId, we can't proceed
        if (!userId || !isValidUUID(userId)) {
            console.error(`Could not get or create valid user ID for ${username}`);
            return;
        }

        const channel = data.channel || 'general';
        
        // Ensure channel exists
        if (!channelMessages[channel]) {
            channelMessages[channel] = [];
        }

        // Create message object with proper structure
        const messageObj = {
            id: uuidv4(), // Use proper UUID for the message ID
            senderId: userId, // <--- Use the actual sender's UUID
            username,     // Keep username for broadcasting to clients
            message: data.message,
            timestamp: Date.now(),
            channel: channel // Changed from channelId to channel for consistency
        };

        // Add to channel
        channelMessages[channel].push(messageObj);

        // Broadcast to all users (still include username for display)
        // Pass the original messageObj plus the channel info
        io.emit('chat-message', {...messageObj, channel}); 

        // Save to Supabase immediately and then throttle for batch saves
        // We're wrapping this in try/catch to prevent any errors from disrupting the app
        try {
            // Pass the complete messageObj which now includes senderId
            const saved = await saveMessageToSupabase(messageObj).catch(err => {
                // Log the specific error from Supabase
                console.error('Error saving message to Supabase:', err);
                return false;
            });
            
            if (saved) {
                console.log(`Message saved to Supabase with sender ${userId}`);
            }
        } catch (error) {
            console.error('Failed to save message to Supabase:', error);
        }

        // Save messages (throttled to prevent excessive writes)
        throttledSave(); // Consider calling saveAllMessages directly if critical
    });
    
    // Handle direct messages
    socket.on('direct-message', async (data) => {
        // Skip blank or null messages
        if (!data.message || data.message.trim() === '') {
            return;
        }

        const userInfo = users[socket.id]; // Get user info object { username, userId }
        if (!userInfo || !userInfo.username) {
            console.error('User not found for socket:', socket.id);
            return; // Don't process if user info is incomplete
        }
        
        const username = userInfo.username;
        
        // CRITICAL FIX: Ensure we have a valid sender ID that exists in Supabase
        let userId = null;
        
        // First try to use the socket's stored userId (should be a valid UUID)
        if (userInfo.userId && typeof userInfo.userId === 'string') {
            userId = userInfo.userId;
        }
        
        // If we don't have a valid userId in the socket info, try to find one in Supabase
        if (!userId || !isValidUUID(userId)) {
            try {
                // Get or create a user record for this username
                console.log(`Finding or creating user record for ${username}`);
                const { data: userRecord } = await supabase
                    .from('users')
                    .select('id')
                    .eq('username', username)
                    .limit(1);
                    
                if (userRecord && userRecord.length > 0) {
                    // Use the existing user's ID
                    userId = userRecord[0].id;
                    console.log(`Found existing user ID for ${username}: ${userId}`);
                }
            } catch (error) {
                console.error('Error finding user record:', error);
            }
        }
        
        // If still no valid userId, try to create a new user
        if (!userId || !isValidUUID(userId)) {
            try {
                userId = uuidv4();
                console.log(`Created new user ID for ${username}: ${userId}`);
                
                // Create user record in background, don't await to avoid blocking
                supabase
                    .from('users')
                    .insert([{ id: userId, username, created_at: new Date().toISOString() }])
                    .then(result => {
                        if (result.error) {
                            console.error('Error creating user record:', result.error);
                        }
                    });
            } catch (error) {
                console.error('Error creating user ID:', error);
                // Last resort fallback: use a deterministic UUID based on username
                userId = uuidv4({ name: username });
            }
        }
        
        // Update the userId in the socket session
        users[socket.id].userId = userId;
        
        // Construct the message object
        const messageObj = {
            username: username,
            message: data.message,
            timestamp: data.timestamp || Date.now(),
            senderId: userId,
            recipientId: data.recipientId,
            isDM: true // Flag this as a direct message
        };
        
        // Make sure the DM structure exists
        if (!channelMessages.dm) {
            channelMessages.dm = [];
        }
        
        // Store in DM list with a unique conversation identifier
        const dmId = [userId, data.recipientId].sort().join('_');
        if (!channelMessages[dmId]) {
            channelMessages[dmId] = [];
        }
        
        // Add message to the conversation
        channelMessages[dmId].push(messageObj);
        
        // Find the recipient socket by recipientId
        const recipientSocketId = Object.keys(users).find(id => 
            users[id] && users[id].userId === data.recipientId
        );
        
        if (recipientSocketId) {
            // Send directly to recipient
            io.to(recipientSocketId).emit('direct-message', messageObj);
        }
        
        // Also send back to sender for confirmation
        socket.emit('direct-message', messageObj);
        
        // Store the message in Supabase
        try {
            const saved = await saveMessageToSupabase({
                ...messageObj,
                type: 'direct',
                channel: dmId // Use the conversation ID as the channel
            }).catch(err => {
                console.error('Error saving DM to Supabase:', err);
                return false;
            });
            
            if (saved) {
                console.log(`DM saved to Supabase for conversation ${dmId}`);
            }
        } catch (error) {
            console.error('Failed to save DM to Supabase:', error);
        }
        
        // Save all messages (throttled)
        throttledSave();
    });
    
    // Call signaling
    socket.on('call-offer', ({offer, caller, target, sender}) => {
        console.log(`Call offer from ${caller} to ${target}`);
        
        // Find the target socket by username in the users map
        const targetSocketId = Object.keys(users).find(id => users[id] && users[id].username === target);
        
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
        
        // Find the caller socket by username
        const callerSocketId = Object.keys(users).find(id => users[id] && users[id].username === caller);
        
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-answer', {
                answer,
                callee: callee || sender || (users[socket.id] ? users[socket.id].username : 'unknown'),
                sender: sender || callee || (users[socket.id] ? users[socket.id].username : 'unknown')
            });
        } else {
            socket.emit('call-error', {
                message: `User ${caller} is not available anymore.`,
                code: 'USER_DISCONNECTED'
            });
        }
    });
    
    socket.on('ice-candidate', ({candidate, target, sender}) => {
        const senderUsername = sender || (users[socket.id] ? users[socket.id].username : 'unknown');
        console.log(`ICE candidate from ${senderUsername} to ${target}`);
        
        // Find the target socket by username
        const targetSocketId = Object.keys(users).find(id => users[id] && users[id].username === target);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                candidate,
                sender: senderUsername // Always include who sent this candidate
            });
        }
    });

    socket.on('end-call', ({target, sender}) => {
        const senderUsername = sender || (users[socket.id] ? users[socket.id].username : 'unknown');
        console.log(`Call ended by ${senderUsername} for ${target}`);
        
        // Find the target socket by username
        const targetSocketId = Object.keys(users).find(id => users[id] && users[id].username === target);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-end', {
                sender: senderUsername
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const userInfo = users[socket.id];
        if (userInfo && userInfo.username) {
            console.log(`User disconnected: ${userInfo.username} (${socket.id})`);
            
            // Remove from active users and update list
            activeUsers.delete(userInfo.username);
            delete users[socket.id]; // Remove the user entry using socket.id
            updateUserList();
            
            // Notify others
            socket.broadcast.emit('user-left', userInfo.username);
        } else {
            console.log(`User disconnected: ${socket.id} (no username associated)`);
        }
        
        // Save messages on disconnect to ensure data is persisted
        throttledSave(); // Consider calling saveAllMessages directly if critical
    });
    
    // Handle user registration request
    socket.on('register', async (data) => {
        try {
            console.log(`Registering user with ${data.email && data.email.includes('@proton') ? 'ProtonMail' : 'email'}: ${data.username} (${data.email})`);
            
            // Only use simplified registration in strict development mode
            if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true') {
                console.log(`Development mode: Simplified registration for ${data.username}`);
                
                // Still try to send verification email, but don't require success
                try {
                    await sendVerificationEmail(data.email, data.username, data.password);
                } catch (emailError) {
                    console.warn('Email verification skipped in development mode:', emailError.message);
                }
                
                // Create the user in Supabase for testing
                try {
                    const hashedPassword = await bcrypt.hash(data.password, 10);
                    const userId = await registerUser(data.username, hashedPassword, data.email);
                    
                    socket.emit('register-success', {
                        message: 'Development mode: Registration successful!',
                        username: data.username,
                        userId
                    });
                } catch (authError) {
                    console.error('Dev mode - Auth error:', authError);
                    socket.emit('register-fail', { message: 'Registration failed. User might already exist.' });
                }
                return;
            }
            
            // Send verification email
            const success = await sendVerificationEmail(data.email, data.username, data.password);
            
            if (success) {
                socket.emit('verification-sent', {
                    email: data.email,
                    message: 'Verification email sent! Please check your inbox and spam folder.'
                });
            } else {
                console.error(`Failed to send verification email to ${data.email}`);
                socket.emit('register-fail', { message: 'Failed to send verification email. Please try again or use a different email address.' });
            }
        } catch (error) {
            console.error('Error during registration:', error);
            socket.emit('register-fail', { message: 'Registration failed. Please try again.' });
        }
    });

    // Handle verification code submission
    socket.on('verify-code', async (data) => {
        try {
            // Verify the code
            const userData = verifyEmail(data.email, data.code);
            
            if (!userData) {
                socket.emit('verify-fail', { message: 'Invalid or expired verification code.' });
                return;
            }
            
            // Create user in Supabase
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            const userId = await registerUser(userData.username, hashedPassword, userData.email);
            
            socket.emit('register-success', {
                message: 'Registration successful!',
                username: userData.username,
                userId
            });
        } catch (error) {
            console.error('Error during verification:', error);
            socket.emit('verify-fail', { message: 'Verification failed. Please try again.' });
        }
    });

    // Handle resend verification code
    socket.on('resend-verification', async (data) => {
        try {
            const success = await resendVerificationEmail(data.email);
            
            if (success) {
                socket.emit('verification-sent', {
                    email: data.email,
                    message: 'Verification email resent! Please check your inbox and spam folder.'
                });
            } else {
                socket.emit('verify-fail', { message: 'Failed to resend verification email. Please try again later.' });
            }
        } catch (error) {
            console.error('Error resending verification:', error);
            socket.emit('verify-fail', { message: 'Failed to resend verification. Please try again.' });
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
        const socketId = Object.keys(users).find(id => users[id] && users[id].username === username);
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
