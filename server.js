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
    saveMessageToSupabase,
    loadMessagesFromSupabase,
    getSupabaseClient
} = require("./supabase-client");

// Environment settings - DO NOT force development mode
// Keep the existing NODE_ENV or default to 'production' for security
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production'; // Default to production for security
}

// IMPORTANT: Disable development authentication bypasses
process.env.ALLOW_DEV_AUTH = 'false';

console.log(`Running in ${process.env.NODE_ENV} mode with dev auth DISABLED`);

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
let userStatus = {}; // Map of user ID to { status, socketId }

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
    
    // Ensure the user's state is properly tracked in our users object
    if (!users[socket.id]) {
        users[socket.id] = {
            socketId: socket.id,
            authenticated: false,
            username: null,
            userId: null
        };
    }
    
    // Get active users list on request
    socket.on('get-active-users', () => {
        // Send the current active users list to the requesting client
        socket.emit("active-users", Array.from(activeUsers));
        console.log('Sent active users list to client on request:', Array.from(activeUsers));
    });
    
    // Register user handler
    socket.on('register-user', async (data, callback) => {
        try {
            console.log('Received registration request:', data.username);
            
            const { username, password, email } = data;
            
            // Validate username
            if (!username || username.length < 3) {
                callback({ 
                    success: false, 
                    message: 'Username must be at least 3 characters long'
                });
                return;
            }
            
            // Validate password
            if (!password || password.length < 6) {
                callback({ 
                    success: false, 
                    message: 'Password must be at least 6 characters long'
                });
                return;
            }
            
            console.log(`Registering user with username: ${username}`);
            
            // Perform actual registration with simplified approach
            const user = await registerUser(username, password, email);
            
            if (user) {
                console.log(`User registered successfully: ${username}`);
                
                callback({ 
                    success: true, 
                    message: 'Registration successful! You can now log in with your credentials.',
                    verificationRequired: false
                });
            } else {
                callback({ 
                    success: false, 
                    message: 'Failed to register user. Please try again.'
                });
            }
        } catch (error) {
            console.error('Error during registration:', error);
            callback({ 
                success: false, 
                message: 'An error occurred during registration. Please try again.'
            });
        }
    });
    
    // Login user handler
    socket.on('login-user', async (data, callback) => {
        const { username, password } = data;
        
        console.log(`Login attempt for user: ${username}`);
        
        try {
            // Attempt to sign in with simplified approach
            const user = await signInUser(username, password);
            
            if (user && user.id) {
                console.log(`User ${username} successfully logged in with ID: ${user.id}`);
                
                // Store user info in socket session
                users[socket.id] = { 
                    username: user.username,
                    userId: user.id
                };
                
                // Mark user as active
                activeUsers.add(username);
                updateUserList();
                
                // Load messages from Supabase for this user
                console.log(`Loading messages for user ${username}`);
                const messages = await loadMessagesFromSupabase();
                
                // Set up default channel messages if none exist
                if (!channelMessages['general']) {
                    channelMessages['general'] = [];
                }
                
                if (messages && messages.length > 0) {
                    // Add all messages to the general channel for now
                    const processedMessages = messages.map(msg => ({
                        id: msg.id,
                        sender: msg.sender_username || 'Unknown User',
                        senderId: msg.sender_id,
                        content: msg.content,
                        timestamp: msg.created_at,
                        channel: 'general'
                    }));
                    
                    // Add only unique messages based on ID
                    processedMessages.forEach(msg => {
                        const isDuplicate = channelMessages['general'].some(existing => 
                            existing.id === msg.id
                        );
                        
                        if (!isDuplicate) {
                            channelMessages['general'].push(msg);
                        }
                    });
                    
                    // Sort messages by timestamp
                    channelMessages['general'].sort((a, b) => 
                        new Date(a.timestamp) - new Date(b.timestamp)
                    );
                    
                    console.log(`Loaded and processed ${messages.length} messages for user ${username}`);
                } else {
                    console.log(`No messages found for user ${username}`);
                }
                
                // Notify user of successful login
                callback({
                    success: true,
                    userId: user.id,
                    username: user.username
                });
                
                // Send chat history to the user
                for (const channel in channelMessages) {
                    if (channelMessages.hasOwnProperty(channel)) {
                        socket.emit('message-history', {
                            channel,
                            messages: channelMessages[channel] || []
                        });
                    }
                }
            } else {
                console.log(`Login failed for user: ${username}`);
                callback({ 
                    success: false, 
                    message: 'Invalid username or password'
                });
            }
        } catch (error) {
            console.error(`Error during login for ${username}:`, error);
            callback({ 
                success: false, 
                message: 'An error occurred during login'
            });
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
    
    // Chat message handler
    socket.on("chat-message", async (data) => {
        if (!users[socket.id] || !users[socket.id].authenticated) {
            console.error('User not authenticated but trying to send message');
            socket.emit('auth-error', { message: 'You must be logged in to send messages' });
            return;
        }
        
        // Skip empty messages
        if (!data.message || data.message.trim() === '') {
            console.log('Ignoring empty message');
            return;
        }
        
        const username = users[socket.id].username;
        let userId = users[socket.id].userId;
        
        console.log(`Chat message from ${username}: ${data.message.substring(0, 30)}${data.message.length > 30 ? '...' : ''}`);
        
        // CRITICAL: First check if this user already exists in the database
        try {
            // Check by username first
            const { data: existingUserByName } = await getSupabaseClient(true)
                .from('users')
                .select('id')
                .eq('username', username)
                .maybeSingle();
                
            if (existingUserByName) {
                // If user exists with this username but different ID, use the existing ID
                console.log(`Found existing user record for username ${username} with ID ${existingUserByName.id}`);
                userId = existingUserByName.id;
                users[socket.id].userId = userId; // Update socket session
            } else {
                // Check by user ID
                const { data: existingUserById } = await getSupabaseClient(true)
                    .from('users')
                    .select('id, username')
                    .eq('id', userId)
                    .maybeSingle();
                    
                if (!existingUserById) {
                    console.log(`Creating new user record for ${username} with ID ${userId}`);
                    // User doesn't exist, create it
                    const { error: insertError } = await getSupabaseClient(true)
                        .from('users')
                        .insert({
                            id: userId,
                            username: username,
                            email: `${username}@homies.app`,
                            password: 'auto-created',
                            created_at: new Date().toISOString(),
                            last_seen: new Date().toISOString(),
                            verified: true,
                            status: 'online',
                            avatar_url: null
                        });
                    
                    if (insertError) {
                        console.error('Error creating user record:', insertError);
                        // Generate a different ID with username as suffix for uniqueness
                        userId = uuidv4();
                        console.log(`Generated new user ID: ${userId}`);
                        
                        // Try one more time with new ID
                        await getSupabaseClient(true)
                            .from('users')
                            .insert({
                                id: userId,
                                username: `${username}_${userId.substring(0, 4)}`, // Make username unique
                                email: `${username}@homies.app`,
                                password: 'auto-created',
                                created_at: new Date().toISOString(),
                                last_seen: new Date().toISOString(),
                                verified: true,
                                status: 'online',
                                avatar_url: null
                            })
                            .then(result => {
                                if (result.error) {
                                    console.error('Failed on second attempt:', result.error);
                                } else {
                                    console.log(`Created user with ID ${userId}`);
                                    users[socket.id].userId = userId;
                                }
                            });
                    }
                }
            }
        } catch (userCheckError) {
            console.error('Error checking/creating user:', userCheckError);
        }
        
        // Create message object with all required fields
        const messageObj = {
            id: uuidv4(), // Give each message a unique ID
            sender: username,
            senderId: userId,
            content: data.message,
            timestamp: data.timestamp || Date.now(),
            channel: data.channel || 'general' // For client-side organization
        };
        
        // Ensure general channel exists
        if (!channelMessages.general) {
            channelMessages.general = [];
        }
        
        // Add to channel messages
        channelMessages.general.push(messageObj);
        
        // Broadcast to all clients with the complete message object
        io.emit("chat-message", messageObj);
        
        // Save message to Supabase
        try {
            // Now that we've verified/created the user, save the message
            const saveResult = await saveMessageToSupabase({
                id: messageObj.id,
                senderId: messageObj.senderId,
                content: messageObj.content,
                sender: messageObj.sender,
                timestamp: messageObj.timestamp
            });
            
            if (saveResult) {
                console.log(`Message saved to Supabase with ID: ${messageObj.id}`);
            } else {
                console.error('Failed to save message to Supabase');
            }
        } catch (error) {
            console.error('Error saving message to Supabase:', error);
        }
    });
    
    // Handle channel-specific message requests
    socket.on('get-messages', async (data) => {
        const channel = data.channel || 'general';
        console.log(`Requested messages for channel: ${channel}`);
        
        try {
            // Load messages from Supabase if not already loaded
            if (!channelMessages[channel] || channelMessages[channel].length === 0) {
                console.log(`Loading messages for channel: ${channel} from database`);
                const messages = await loadMessagesFromSupabase();
                
                if (messages && messages.length > 0) {
                    // Process messages
                    const formattedMessages = messages.map(msg => ({
                        id: msg.id,
                        sender: msg.sender_username || msg.sender || 'Unknown User',
                        senderId: msg.sender_id,
                        content: msg.content,
                        timestamp: msg.created_at,
                        channel: channel
                    }));
                    
                    // Initialize channel if needed
                    if (!channelMessages[channel]) {
                        channelMessages[channel] = [];
                    }
                    
                    // Add messages to channel, avoiding duplicates
                    formattedMessages.forEach(msg => {
                        const exists = channelMessages[channel].some(existing => existing.id === msg.id);
                        if (!exists) {
                            channelMessages[channel].push(msg);
                        }
                    });
                    
                    // Sort by timestamp
                    channelMessages[channel].sort((a, b) => 
                        new Date(a.timestamp) - new Date(b.timestamp)
                    );
                    
                    console.log(`Loaded ${formattedMessages.length} messages for channel: ${channel}`);
                }
            }
            
            // Send the messages to the client
            socket.emit('message-history', {
                channel,
                messages: channelMessages[channel] || []
            });
        } catch (error) {
            console.error(`Error loading messages for channel ${channel}:`, error);
            socket.emit('message-history', { channel, messages: [] });
        }
    });
    
    // Direct message handler
    socket.on("direct-message", async (data) => {
        if (!users[socket.id]) {
            console.error('User not authenticated but trying to send DM');
            return;
        }
        
        const username = users[socket.id].username;
        let userId = users[socket.id].userId;
        
        console.log(`DM from ${username} to ${data.recipientId}: ${data.message.substring(0, 20)}...`);
        
        // CRITICAL: First check and ensure this userId exists in the database
        try {
            const { data: userExists, error } = await getSupabaseClient(true)
                .from('users')
                .select('id')
                .eq('id', userId)
                .maybeSingle();
                
            if (error || !userExists) {
                console.log(`User ID ${userId} doesn't exist in database. Creating user record.`);
                // Create the user record BEFORE trying to save any messages
                const { error: insertError } = await getSupabaseClient(true)
                    .from('users')
                    .insert({
                        id: userId,
                        username: username,
                        email: `${username}@homies.app`,
                        password: 'auto-created',
                        created_at: new Date().toISOString(),
                        last_seen: new Date().toISOString(),
                        verified: true,
                        status: 'online'
                    });
                
                if (insertError) {
                    console.error('Error creating user record for DM sender:', insertError);
                    userId = uuidv4();
                    users[socket.id].userId = userId;
                    
                    // Try one more time with new ID
                    await getSupabaseClient(true)
                        .from('users')
                        .insert({
                            id: userId,
                            username: username,
                            email: `${username}@homies.app`,
                            password: 'auto-created',
                            created_at: new Date().toISOString(),
                            last_seen: new Date().toISOString(),
                            verified: true,
                            status: 'online'
                        });
                }
            }
        } catch (userCheckError) {
            console.error('Error checking/creating user before DM save:', userCheckError);
        }
        
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

    // Handle session authentication for users returning after page reload
    socket.on('register-session', async (userData) => {
        console.log(`Registering session for user: ${userData.username}`);
        
        if (!userData || !userData.id || !userData.username) {
            console.error('Invalid user data for session registration:', userData);
            socket.emit('auth-error', { message: 'Invalid session data' });
            return;
        }
        
        try {
            // First, try to find user by username regardless of ID
            const { data: existingUser, error: lookupError } = await getSupabaseClient(true)
                .from('users')
                .select('id, username')
                .eq('username', userData.username)
                .maybeSingle();
                
            if (lookupError) {
                console.error('Error looking up user by username:', lookupError);
            }
            
            let userId = userData.id;
            
            // If user exists with this username but different ID, use the existing record
            if (existingUser && existingUser.id) {
                console.log(`User ${userData.username} already exists with ID ${existingUser.id}, using existing ID`);
                userId = existingUser.id;
            } else {
                // Verify the user ID exists or create if not
                const { data: userById, error: idLookupError } = await getSupabaseClient(true)
                    .from('users')
                    .select('id, username')
                    .eq('id', userId)
                    .maybeSingle();
                    
                if (idLookupError) {
                    console.error('Error looking up user by ID:', idLookupError);
                }
                
                if (!userById) {
                    console.log(`Creating new user record for ${userData.username} with ID ${userId}`);
                    // Create user record
                    const { error: createError } = await getSupabaseClient(true)
                        .from('users')
                        .insert({
                            id: userId,
                            username: userData.username,
                            email: `${userData.username}@homies.app`,
                            password: 'auto-created',
                            created_at: new Date().toISOString(),
                            last_seen: new Date().toISOString(),
                            verified: true,
                            status: 'online',
                            avatar_url: null
                        });
                        
                    if (createError) {
                        // If username already exists, try to find it and use that ID
                        if (createError.code === '23505') {
                            console.log(`Username ${userData.username} already exists, finding user ID`);
                            const { data: existingByUsername } = await getSupabaseClient(true)
                                .from('users')
                                .select('id')
                                .eq('username', userData.username)
                                .maybeSingle();
                                
                            if (existingByUsername && existingByUsername.id) {
                                userId = existingByUsername.id;
                                console.log(`Found existing user ${userData.username} with ID ${userId}`);
                            } else {
                                // Generate a truly unique username
                                const uniqueUsername = `${userData.username}_${Date.now().toString(36).substring(4)}`;
                                
                                // Try again with unique username
                                const { error: retryError } = await getSupabaseClient(true)
                                    .from('users')
                                    .insert({
                                        id: userId,
                                        username: uniqueUsername,
                                        email: `${uniqueUsername}@homies.app`,
                                        password: 'auto-created',
                                        created_at: new Date().toISOString(),
                                        last_seen: new Date().toISOString(),
                                        verified: true,
                                        status: 'online',
                                        avatar_url: null
                                    });
                                    
                                if (retryError) {
                                    console.error('Failed to create user on second attempt:', retryError);
                                    socket.emit('auth-error', { message: 'Failed to create user record' });
                                    return;
                                }
                            }
                        } else {
                            console.error('Error creating user:', createError);
                            socket.emit('auth-error', { message: 'Failed to create user record' });
                            return;
                        }
                    }
                }
            }
            
            // Update socket session with potentially new ID
            users[socket.id] = {
                socketId: socket.id,
                authenticated: true,
                username: userData.username,
                userId: userId // This might be different from userData.id
            };
            
            // Update user status in Supabase
            await getSupabaseClient(true)
                .from('users')
                .update({ 
                    status: 'online',
                    last_seen: new Date().toISOString()
                })
                .eq('id', userId);
                
            // Update user status in memory
            if (!userStatus[userId]) {
                userStatus[userId] = { status: 'online', socketId: socket.id };
            } else {
                userStatus[userId].status = 'online';
                userStatus[userId].socketId = socket.id;
            }
            
            // Return successful authentication with potentially updated ID
            socket.emit('auth-success', { 
                username: userData.username, 
                id: userId,
                message: 'Session registered successfully' 
            });
            
            // Broadcast to others this user is online
            socket.broadcast.emit('user-status-change', { 
                userId: userId, 
                username: userData.username,
                status: 'online' 
            });
            
            console.log(`Session registered for ${userData.username} with ID ${userId}`);
        } catch (error) {
            console.error('Error during session registration:', error);
            socket.emit('auth-error', { message: 'Registration failed due to server error' });
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
