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
    getSupabaseClient,
    getUserIdByUsername,
    markMessageAsDeleted
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

// API endpoint to initialize channels table
app.get('/api/init-channels-table', async (req, res) => {
  try {
    console.log('API request to initialize channels table');
    
    // Check if we have admin access
    if (!getSupabaseClient(true)) {
      return res.status(500).json({ 
        success: false, 
        message: 'Server does not have admin access to Supabase' 
      });
    }
    
    // First check if the table exists
    try {
      const { data, error: checkError } = await getSupabaseClient(true)
        .from('channels')
        .select('id')
        .limit(1);
      
      if (!checkError) {
        // Table exists
        return res.json({ 
          success: true, 
          message: 'Channels table already exists', 
          status: 'existing' 
        });
      }
    } catch (e) {
      // Table likely doesn't exist, continue
    }
    
    // Attempt to create the columns table manually using schema builder
    const supabase = getSupabaseClient(true);
    
    // Create channels table one column at a time
    // Note: This approach assumes you have proper permissions to create tables
    // Normally this would be done in Supabase SQL editor or through migrations
    const createOperations = [
      // Create the table with id column
      supabase.rpc('create_table_if_not_exists', { 
        table_name: 'channels', 
        primary_key_column: 'id',
        primary_key_type: 'uuid'
      }),
      
      // Add other columns
      supabase.rpc('add_column_if_not_exists', { 
        table_name: 'channels', 
        column_name: 'name',
        column_type: 'text',
        is_unique: true,
        is_nullable: false
      }),
      
      supabase.rpc('add_column_if_not_exists', { 
        table_name: 'channels', 
        column_name: 'created_by',
        column_type: 'uuid',
        references_table: 'users',
        references_column: 'id'
      }),
      
      supabase.rpc('add_column_if_not_exists', { 
        table_name: 'channels', 
        column_name: 'created_at',
        column_type: 'timestamp with time zone',
        default_value: 'now()'
      }),
      
      supabase.rpc('add_column_if_not_exists', { 
        table_name: 'channels', 
        column_name: 'description',
        column_type: 'text'
      }),
      
      supabase.rpc('add_column_if_not_exists', { 
        table_name: 'channels', 
        column_name: 'is_private',
        column_type: 'boolean',
        default_value: 'false'
      })
    ];
    
    // Try each operation, but don't fail on errors
    let successCount = 0;
    let errorCount = 0;
    let errors = [];
    
    for (const operation of createOperations) {
      try {
        const { error } = await operation;
        if (error) {
          errorCount++;
          errors.push(error.message);
        } else {
          successCount++;
        }
      } catch (e) {
        errorCount++;
        errors.push(e.message);
      }
    }
    
    // Create default channels
    const defaultChannels = [
      { name: 'general', description: 'General chat for everyone', is_private: false },
      { name: 'random', description: 'Random discussions', is_private: false }
    ];
    
    let createdChannels = 0;
    for (const channel of defaultChannels) {
      try {
        const { error } = await supabase
          .from('channels')
          .insert(channel);
        
        if (!error) {
          createdChannels++;
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    // Check if message table needs channel column
    try {
      const { error } = await supabase.rpc('add_column_if_not_exists', { 
        table_name: 'messages', 
        column_name: 'channel',
        column_type: 'text',
        default_value: '\'general\''
      });
    } catch (e) {
      // Ignore error
    }
    
    // Return detailed results
    res.json({
      success: true,
      message: `Table creation attempts: ${successCount} succeeded, ${errorCount} failed`,
      created_channels: createdChannels,
      schema_errors: errors,
      next_steps: [
        "If table creation failed, you will need to create it directly in Supabase SQL Editor with:",
        `
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  description TEXT,
  is_private BOOLEAN DEFAULT false
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'general';

-- Insert default channels
INSERT INTO public.channels (name, description, is_private)
VALUES ('general', 'General chat for everyone', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.channels (name, description, is_private)
VALUES ('random', 'Random discussions', false)
ON CONFLICT (name) DO NOTHING;
        `
      ]
    });
    
  } catch (error) {
    console.error('Error in channels init API:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to initialize channels table', 
      error: error.message 
    });
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
    socket.on('get-messages', async (data) => {
        const channel = data.channel || 'general';
        console.log(`Requested messages for channel: ${channel}`);
        
        try {
            let messages = [];
            
            // Check if this is a DM channel request 
            if (data.isDM) {
                console.log(`Handling DM channel request for ${channel} with participants:`, data.participants);
                
                // Load DM messages from Supabase
                const { data: dmMessages, error } = await getSupabaseClient()
                    .from('messages')
                    .select('*')
                    .or(`recipientId.eq.${data.participants[0]},recipientId.eq.${data.participants[1]}`)
                    .or(`senderId.eq.${data.participants[0]},senderId.eq.${data.participants[1]}`)
                    .eq('is_deleted', false) // Only get messages that aren't deleted
                    .order('created_at', { ascending: true });
                    
                if (error) {
                    console.error('Error loading DM messages:', error);
                } else {
                    // Filter messages to only include those between these two users
                    messages = dmMessages.filter(msg => {
                        return (
                            (msg.senderId === data.participants[0] && msg.recipientId === data.participants[1]) ||
                            (msg.senderId === data.participants[1] && msg.recipientId === data.participants[0])
                        );
                    });
                    
                    console.log(`Found ${messages.length} DM messages between users`);
                }
            } else {
                // For regular channels, load from Supabase
                const { data: channelMessages, error } = await getSupabaseClient()
                    .from('messages')
                    .select('*')
                    .eq('channel', channel)
                    .eq('is_deleted', false) // Only get messages that aren't deleted
                    .order('created_at', { ascending: true });
                
                if (error) {
                    console.error('Error loading channel messages:', error);
                } else {
                    messages = channelMessages;
                }
            }
            
            // Send messages to client
            socket.emit('message-history', { 
                channel, 
                messages: messages.map(msg => ({
                    ...msg,
                    timestamp: msg.created_at || msg.timestamp
                }))
            });
        } catch (err) {
            console.error(`Error retrieving messages for channel ${channel}:`, err);
            socket.emit('message-history', { channel, messages: [] });
        }
    });
    
    // Chat message handler
    socket.on("chat-message", async (data) => {
        console.log("Received chat message:", data);
        
        if (!data || typeof data !== 'object') {
            console.error("Invalid message data received");
            socket.emit('message-error', { message: 'Invalid message format' });
            return;
        }
        
        // Extract data, with validation and defaults
        const content = data.content || '';
        const channel = data.channel || 'general';
        const timestamp = data.timestamp || Date.now();
        let senderId = data.senderId || null;
        let username = data.sender || null;
        
        // Validate message content
        if (!content || typeof content !== 'string' || content.trim() === '') {
            console.error("Empty or invalid message content");
            socket.emit('message-error', { message: 'Message content cannot be empty' });
            return;
        }
        
        // Attempt to resolve sender from socket session if not provided
        if (!username || !senderId) {
            if (users[socket.id] && users[socket.id].username) {
                username = users[socket.id].username;
                senderId = users[socket.id].userId;
                console.log(`Using socket session user: ${username} (${senderId})`);
            }
        }
        
        // If we still don't have a username, try to look it up by ID
        if (!username && senderId) {
            try {
                console.log(`Looking up username for sender ID: ${senderId}`);
                const { data: userRecord } = await getSupabaseClient(true)
                    .from('users')
                    .select('username')
                    .eq('id', senderId)
                    .maybeSingle();
                    
                if (userRecord && userRecord.username) {
                    username = userRecord.username;
                    console.log(`Found username ${username} for sender ID ${senderId}`);
                }
            } catch (err) {
                console.error('Error looking up username by ID:', err);
            }
        }
        
        // If we still don't have a username, reject the message
        if (!username) {
            console.error('Cannot identify message sender, rejecting message');
            socket.emit('message-error', { message: 'You must be logged in to send messages' });
            return;
        }
        
        // Resolve user ID using our new utility function
        try {
            // This will either find an existing user or create one
            if (!senderId) {
                senderId = await getUserIdByUsername(username);
            }
            
            if (!senderId) {
                console.error(`Could not resolve valid user ID for ${username}`);
                socket.emit('message-error', { message: 'User validation failed' });
                return;
            }
            
            // Update socket session with verified user info
            if (!users[socket.id] || !users[socket.id].authenticated) {
                users[socket.id] = {
                    socketId: socket.id,
                    authenticated: true,
                    username: username,
                    userId: senderId
                };
                console.log(`Updated socket session with user ${username} (${senderId})`);
            }
        } catch (userError) {
            console.error('Error resolving user:', userError);
            socket.emit('message-error', { message: 'Error processing user account' });
            return;
        }
        
        // Create message object with the validated user info
        const messageObj = {
            id: uuidv4(),
            sender: username,
            senderId: senderId,
            content: content,
            timestamp: timestamp,
            channel: channel
        };
        
        console.log(`Processed message from ${username} (${senderId}) in channel: ${channel}`);
        
        // Add to the appropriate channel
        if (!channelMessages[channel]) {
            channelMessages[channel] = [];
        }
        channelMessages[channel].push(messageObj);
        
        // Broadcast to all connected clients
        io.emit("chat-message", messageObj);
        
        // Store in database
        try {
            console.log(`Saving message to Supabase from user ${username} (${senderId}) in channel ${channel}`);
            
            // Save message to Supabase
            await saveMessageToSupabase({
                sender_id: senderId,
                content: content,
                channel: channel
            });
        } catch (dbError) {
            console.error("Error saving message to database:", dbError);
            // We still emit the message even if DB save fails
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
    
    // Handle message deletion
    socket.on('delete-message', async (messageData, callback) => {
        try {
            if (!messageData || !messageData.messageId) {
                console.error('Cannot delete message: Missing message ID');
                callback({ success: false, message: 'Missing message ID' });
                return;
            }

            const messageId = messageData.messageId;
            console.log(`Attempting to delete message: ${messageId}`);
            
            // Check if user is authenticated
            if (!users[socket.id] || !users[socket.id].userId) {
                console.error('Cannot delete message: User not authenticated');
                callback({ success: false, message: 'You must be logged in to delete messages' });
                return;
            }
            
            // Mark message as deleted in Supabase
            const success = await markMessageAsDeleted(messageId);
            
            if (success) {
                // Find and remove the message from channelMessages
                for (const channel in channelMessages) {
                    const index = channelMessages[channel].findIndex(msg => msg.id === messageId);
                    if (index !== -1) {
                        console.log(`Removing message ${messageId} from channel ${channel}`);
                        channelMessages[channel].splice(index, 1);
                        
                        // Notify all users in the channel about the deletion
                        io.emit('message-deleted', { 
                            messageId,
                            channel
                        });
                        
                        break;
                    }
                }
                
                callback({ success: true, message: 'Message deleted successfully' });
            } else {
                callback({ success: false, message: 'Failed to delete message from database' });
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            callback({ success: false, message: 'An error occurred while deleting the message' });
        }
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
        const targetSocketId = Object.keys(users).find(id => 
            users[id] && users[id].username === target
        );
        
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
        const targetSocketId = Object.keys(users).find(id => 
            users[id] && users[id].username === target
        );
        
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
                                        status: 'online'
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

    // Handle channel operations
    socket.on('create-channel', async (data, callback) => {
        // Check if user is authenticated
        if (!users[socket.id] || !users[socket.id].authenticated) {
            if (callback) callback({ success: false, error: 'You must be logged in to create channels' });
            return;
        }
        
        const { name, description, isPrivate } = data;
        const userId = users[socket.id].userId;
        
        console.log(`User ${users[socket.id].username} is creating channel: ${name}`);
        
        // Create the channel
        const result = await createChannel(name, userId, description, isPrivate);
        
        if (result.success) {
            // Broadcast channel creation to all clients
            io.emit('channel-created', result.channel);
            
            if (callback) callback({ success: true, channel: result.channel });
        } else {
            if (callback) callback(result); // Return the error
        }
    });
    
    // Get all available channels
    socket.on('get-channels', async (callback) => {
        const channels = await getAllChannels();
        
        if (callback) callback({ channels });
        
        // Also emit to this socket specifically
        socket.emit('channels-list', { channels });
    });

    // Add handlers for find-user-by-username and create-user-record
    socket.on('find-user-by-username', async (data, callback) => {
        if (!data || !data.username) {
            callback({ success: false, message: 'Username is required' });
            return;
        }
        
        try {
            // Try to find user in Supabase by username
            const { data: users, error } = await getSupabaseClient(true)
                .from('users')
                .select('*')
                .eq('username', data.username)
                .limit(1);
                
            if (error) {
                console.error('Error finding user by username:', error);
                callback({ success: false, message: 'Database error' });
                return;
            }
            
            if (users && users.length > 0) {
                // Found the user
                callback({
                    success: true,
                    user: {
                        id: users[0].id,
                        username: users[0].username,
                        status: users[0].status || 'offline'
                    }
                });
            } else {
                // User not found
                callback({ success: false, message: 'User not found' });
            }
        } catch (err) {
            console.error('Error in find-user-by-username:', err);
            callback({ success: false, message: 'Server error' });
        }
    });
    
    socket.on('create-user-record', async (data, callback) => {
        if (!data || !data.username) {
            callback({ success: false, message: 'Username is required' });
            return;
        }
        
        try {
            // First check if user already exists
            const { data: existingUsers, error: findError } = await getSupabaseClient(true)
                .from('users')
                .select('id')
                .eq('username', data.username)
                .limit(1);
                
            if (findError) {
                console.error('Error checking for existing user:', findError);
                callback({ success: false, message: 'Database error' });
                return;
            }
            
            if (existingUsers && existingUsers.length > 0) {
                // User already exists, return it
                callback({
                    success: true,
                    user: {
                        id: existingUsers[0].id,
                        username: data.username,
                        status: 'offline'
                    }
                });
                return;
            }
            
            // Create a new user record
            const userId = uuidv4();
            const { error: insertError } = await getSupabaseClient(true)
                .from('users')
                .insert({
                    id: userId,
                    username: data.username,
                    status: 'offline',
                    last_seen: new Date().toISOString()
                });
                
            if (insertError) {
                console.error('Error creating user record:', insertError);
                callback({ success: false, message: 'Failed to create user' });
                return;
            }
            
            // Successfully created user
            callback({
                success: true,
                user: {
                    id: userId,
                    username: data.username,
                    status: 'offline'
                }
            });
        } catch (err) {
            console.error('Error in create-user-record:', err);
            callback({ success: false, message: 'Server error' });
        }
    });

    // Replace chat-message with send-message handler
    socket.on('send-message', async (message) => {
        if (!users[socket.id]) {
            console.error('User not authenticated for message sending');
            return;
        }
        
        try {
            // Validate the message
            if (!message || !message.content) {
                console.error('Invalid message format');
                return;
            }
            
            // Get sender information
            const sender = users[socket.id];
            
            // Add server timestamp and uuid
            const messageId = uuidv4();
            const timestamp = new Date().toISOString();
            
            // Create full message object
            const fullMessage = {
                id: messageId,
                content: message.content,
                sender: sender.username,
                senderId: sender.id,
                timestamp: timestamp,
                channel: message.channel,
                isDM: message.isDM || false,
                recipientId: message.recipientId || null
            };
            
            // Save message to Supabase
            const { error } = await getSupabaseClient(true)
                .from('messages')
                .insert({
                    id: messageId,
                    content: message.content,
                    sender: sender.username,
                    sender_id: sender.id,
                    channel: message.channel,
                    created_at: timestamp,
                    recipient_id: message.recipientId || null,
                    is_dm: message.isDM || false,
                    is_deleted: false
                });
                
            if (error) {
                console.error('Error saving message to Supabase:', error);
            }
            
            // Broadcast to the appropriate recipients
            if (message.isDM && message.recipientId) {
                // Find the recipient's socket
                const recipientSocket = Object.keys(users).find(sid => 
                    users[sid] && users[sid].id === message.recipientId
                );
                
                // Send to sender and recipient
                socket.emit('message', fullMessage);
                
                if (recipientSocket) {
                    io.to(recipientSocket).emit('message', fullMessage);
                }
                
                console.log(`DM sent from ${sender.username} to ${message.recipientId}`);
            } else {
                // Broadcast to all users in the channel
                io.emit('message', fullMessage);
                console.log(`Message broadcast to channel ${message.channel}`);
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    // Friends system handlers
    
    // Generate a friend code for the user if they don't have one
    socket.on('generate-friend-code', async (callback) => {
        if (!users[socket.id] || !users[socket.id].authenticated) {
            callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        try {
            const userId = users[socket.id].id;
            
            // Generate a random 8-character code
            const generateCode = () => {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar-looking characters
                let code = '';
                for (let i = 0; i < 8; i++) {
                    code += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return code;
            };
            
            const friendCode = generateCode();
            
            // Save to database
            const { error } = await getSupabaseClient(true)
                .from('users')
                .update({ friend_code: friendCode })
                .eq('id', userId);
                
            if (error) {
                console.error('Error saving friend code:', error);
                callback({ success: false, message: 'Failed to save friend code' });
                return;
            }
            
            callback({ success: true, friendCode });
        } catch (err) {
            console.error('Error generating friend code:', err);
            callback({ success: false, message: 'Server error' });
        }
    });
    
    // Get current user's friend code
    socket.on('get-friend-code', async (callback) => {
        if (!users[socket.id] || !users[socket.id].authenticated) {
            callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        try {
            const userId = users[socket.id].id;
            
            // Get from database
            const { data, error } = await getSupabaseClient(true)
                .from('users')
                .select('friend_code')
                .eq('id', userId)
                .single();
                
            if (error) {
                console.error('Error getting friend code:', error);
                callback({ success: false, message: 'Failed to retrieve friend code' });
                return;
            }
            
            // If no friend code exists, generate one
            if (!data.friend_code) {
                const friendCode = Math.random().toString(36).substring(2, 10).toUpperCase();
                
                const { error: updateError } = await getSupabaseClient(true)
                    .from('users')
                    .update({ friend_code: friendCode })
                    .eq('id', userId);
                    
                if (updateError) {
                    console.error('Error saving new friend code:', updateError);
                    callback({ success: false, message: 'Failed to save new friend code' });
                    return;
                }
                
                callback({ success: true, friendCode });
            } else {
                callback({ success: true, friendCode: data.friend_code });
            }
        } catch (err) {
            console.error('Error retrieving friend code:', err);
            callback({ success: false, message: 'Server error' });
        }
    });
    
    // Add friend by username and friend code
    socket.on('add-friend', async (data, callback) => {
        if (!users[socket.id] || !users[socket.id].authenticated) {
            callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        if (!data || !data.username || !data.friendCode) {
            callback({ success: false, message: 'Username and friend code required' });
            return;
        }
        
        try {
            const userId = users[socket.id].id;
            const username = users[socket.id].username;
            
            // Prevent adding yourself
            if (data.username === username) {
                callback({ success: false, message: 'You cannot add yourself as a friend' });
                return;
            }
            
            // Find the user by username and friend code
            const { data: foundUsers, error } = await getSupabaseClient(true)
                .from('users')
                .select('id, username')
                .eq('username', data.username)
                .eq('friend_code', data.friendCode)
                .limit(1);
                
            if (error) {
                console.error('Error finding user by friend code:', error);
                callback({ success: false, message: 'Database error' });
                return;
            }
            
            if (!foundUsers || foundUsers.length === 0) {
                callback({ success: false, message: 'User not found or invalid friend code' });
                return;
            }
            
            const friendId = foundUsers[0].id;
            
            // Check if already friends
            const { data: existingFriends, error: checkError } = await getSupabaseClient(true)
                .from('friends')
                .select('id')
                .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
                .limit(1);
                
            if (checkError) {
                console.error('Error checking existing friendship:', checkError);
                callback({ success: false, message: 'Database error' });
                return;
            }
            
            if (existingFriends && existingFriends.length > 0) {
                callback({ success: false, message: 'Already friends with this user' });
                return;
            }
            
            // Add friendship (in both directions for easier querying)
            const { error: addError1 } = await getSupabaseClient(true)
                .from('friends')
                .insert({
                    user_id: userId,
                    friend_id: friendId
                });
                
            const { error: addError2 } = await getSupabaseClient(true)
                .from('friends')
                .insert({
                    user_id: friendId,
                    friend_id: userId
                });
                
            if (addError1 || addError2) {
                console.error('Error adding friend:', addError1 || addError2);
                callback({ success: false, message: 'Failed to add friend' });
                return;
            }
            
            callback({ 
                success: true, 
                friend: { 
                    id: friendId, 
                    username: foundUsers[0].username 
                } 
            });
            
            // Notify the other user if they're online
            const friendSocketId = Object.keys(users).find(id => 
                users[id] && users[id].id === friendId
            );
            
            if (friendSocketId) {
                io.to(friendSocketId).emit('friend-added', {
                    id: userId,
                    username
                });
            }
        } catch (err) {
            console.error('Error in add-friend:', err);
            callback({ success: false, message: 'Server error' });
        }
    });
    
    // Get friends list
    socket.on('get-friends', async (callback) => {
        if (!users[socket.id] || !users[socket.id].authenticated) {
            callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        try {
            const userId = users[socket.id].id;
            
            // Get all friends
            const { data: friends, error } = await getSupabaseClient(true)
                .from('friends')
                .select(`
                    id,
                    friend:friend_id (
                        id,
                        username,
                        status
                    )
                `)
                .eq('user_id', userId);
                
            if (error) {
                console.error('Error getting friends list:', error);
                callback({ success: false, message: 'Failed to retrieve friends' });
                return;
            }
            
            // Format the response
            const formattedFriends = friends.map(f => ({
                id: f.friend.id,
                username: f.friend.username,
                status: f.friend.status || 'offline'
            }));
            
            callback({ success: true, friends: formattedFriends });
        } catch (err) {
            console.error('Error retrieving friends:', err);
            callback({ success: false, message: 'Server error' });
        }
    });
    
    // Remove friend
    socket.on('remove-friend', async (data, callback) => {
        if (!users[socket.id] || !users[socket.id].authenticated) {
            callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        if (!data || !data.friendId) {
            callback({ success: false, message: 'Friend ID required' });
            return;
        }
        
        try {
            const userId = users[socket.id].id;
            
            // Remove friendship in both directions
            const { error: removeError1 } = await getSupabaseClient(true)
                .from('friends')
                .delete()
                .eq('user_id', userId)
                .eq('friend_id', data.friendId);
                
            const { error: removeError2 } = await getSupabaseClient(true)
                .from('friends')
                .delete()
                .eq('user_id', data.friendId)
                .eq('friend_id', userId);
                
            if (removeError1 || removeError2) {
                console.error('Error removing friend:', removeError1 || removeError2);
                callback({ success: false, message: 'Failed to remove friend' });
                return;
            }
            
            callback({ success: true });
            
            // Notify the other user if they're online
            const friendSocketId = Object.keys(users).find(id => 
                users[id] && users[id].id === data.friendId
            );
            
            if (friendSocketId) {
                io.to(friendSocketId).emit('friend-removed', {
                    id: userId
                });
            }
        } catch (err) {
            console.error('Error removing friend:', err);
            callback({ success: false, message: 'Server error' });
        }
    });
});

// Listen on the port provided by Glitch or default to 3000
const PORT = process.env.PORT || 3000;

// Initialize the server
async function initServer() {
  // Initialize storage
  await initializeStorage();
  
  // Add channel column if needed
  await addChannelColumnIfNeeded();
  
  // Set up channels table
  await setupChannelsTable();
  
  // Set up friends table
  await setupFriendsTable();
  
  // Start the server
  server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
  });
}

initServer();

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

// Add channel management functions
async function setupChannelsTable() {
  try {
    console.log('Setting up channels table...');
    
    // Check if channels table exists by trying to query it directly
    const { data, error: checkError } = await getSupabaseClient(true)
      .from('channels')
      .select('count')
      .limit(1);
    
    // If we get an error about the relation not existing, create the table through the Supabase dashboard
    if (checkError && checkError.code === '42P01') {
      console.log('Channels table does not exist. You need to create it in the Supabase dashboard.');
      console.log('To create the table, go to your Supabase dashboard, SQL Editor, and run:');
      console.log(`
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  description TEXT,
  is_private BOOLEAN DEFAULT false
);

-- Insert default channels if they don't exist
INSERT INTO public.channels (name, description, is_private)
VALUES ('general', 'General chat for everyone', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.channels (name, description, is_private)
VALUES ('random', 'Random discussions', false)
ON CONFLICT (name) DO NOTHING;
      `);
      
      // For now, let's create default channels in memory
      if (!channelMessages['general']) {
        channelMessages['general'] = [];
      }
      if (!channelMessages['random']) {
        channelMessages['random'] = [];
      }
      
      return;
    }
    
    // If table exists, make sure default channels are there
    const defaultChannels = [
      { name: 'general', description: 'General chat for everyone', is_private: false },
      { name: 'random', description: 'Random discussions', is_private: false }
    ];
    
    for (const channel of defaultChannels) {
      // Check if channel exists
      const { data: existingChannel, error: lookupError } = await getSupabaseClient(true)
        .from('channels')
        .select('id')
        .eq('name', channel.name)
        .maybeSingle();
      
      // If channel doesn't exist, create it
      if (!existingChannel && !lookupError) {
        const { error: insertError } = await getSupabaseClient(true)
          .from('channels')
          .insert(channel);
        
        if (insertError) {
          console.error(`Error creating default channel ${channel.name}:`, insertError);
        } else {
          console.log(`Created default channel: ${channel.name}`);
        }
      }
      
      // Initialize channel messages array
      if (!channelMessages[channel.name]) {
        channelMessages[channel.name] = [];
      }
    }
    
    console.log('Channels table setup complete');
  } catch (error) {
    console.error('Error setting up channels table:', error);
    
    // Initialize default channels in memory
    if (!channelMessages['general']) {
      channelMessages['general'] = [];
    }
    if (!channelMessages['random']) {
      channelMessages['random'] = [];
    }
  }
}

// Add friends table initialization
async function setupFriendsTable() {
    console.log('Setting up friends table in Supabase');
    
    try {
        const supabase = getSupabaseClient(true);
        
        // Check if friends table exists by trying to query it directly
        const { data, error: checkError } = await supabase
            .from('friends')
            .select('count')
            .limit(1);
            
        // If we get an error about the relation not existing, create the table through the Supabase dashboard
        if (checkError && checkError.code === '42P01') {
            console.log('Friends table does not exist. You need to create it in the Supabase dashboard.');
            console.log('To create the table, go to your Supabase dashboard, SQL Editor, and run:');
            console.log(`
CREATE TABLE IF NOT EXISTS public.friends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  friend_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Prevent duplicate friendships
  CONSTRAINT unique_friendship UNIQUE (user_id, friend_id)
);

-- Add friend_code column to users table if it doesn't exist
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS friend_code TEXT;

-- Create index for faster friend lookups
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON public.friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON public.friends(friend_id);

-- Add is_dm and recipient_id columns to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_dm BOOLEAN DEFAULT false;

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES public.users(id);

-- Add is_deleted column to messages table
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
            `);
            return false;
        }
        
        console.log('Friends table exists');
        return true;
    } catch (err) {
        console.error('Error in setupFriendsTable:', err);
        return false;
    }
}

// Create a new channel
async function createChannel(name, userId, description = '', isPrivate = false) {
  try {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.error('Invalid channel name');
      return { success: false, error: 'Invalid channel name' };
    }
    
    // Sanitize channel name - lowercase, no spaces, only alphanumeric and hyphens
    const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Check if channel already exists
    const { data: existingChannel } = await getSupabaseClient(true)
      .from('channels')
      .select('id')
      .eq('name', sanitizedName)
      .maybeSingle();
      
    if (existingChannel) {
      console.log(`Channel ${sanitizedName} already exists`);
      return { success: false, error: 'Channel already exists', id: existingChannel.id };
    }
    
    // Create the new channel
    const { data: newChannel, error } = await getSupabaseClient(true)
      .from('channels')
      .insert({
        name: sanitizedName,
        created_by: userId,
        description: description,
        is_private: isPrivate
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error creating channel:', error);
      return { success: false, error: error.message };
    }
    
    console.log(`Created new channel: ${sanitizedName}`);
    return { success: true, channel: newChannel };
  } catch (error) {
    console.error('Error in createChannel:', error);
    return { success: false, error: 'Server error' };
  }
}

// Get all channels
async function getAllChannels() {
  try {
    const { data: channels, error } = await getSupabaseClient(true)
      .from('channels')
      .select('*')
      .order('name');
      
    if (error) {
      console.error('Error fetching channels:', error);
      return [];
    }
    
    return channels || [];
  } catch (error) {
    console.error('Error in getAllChannels:', error);
    return [];
  }
}

// Add migration on server start
async function addChannelColumnIfNeeded() {
  try {
    console.log('Ensuring messages are properly associated with channels...');
    
    // Get all messages that don't have a channel set
    const { data: messagesWithoutChannel, error: queryError } = await getSupabaseClient(true)
      .from('messages')
      .select('id')
      .is('channel', null);
    
    if (queryError) {
      console.error('Error checking messages without channel:', queryError);
      return;
    }
    
    // If we found messages without a channel, update them
    if (messagesWithoutChannel && messagesWithoutChannel.length > 0) {
      console.log(`Found ${messagesWithoutChannel.length} messages without a channel, updating to 'general'`);
      
      // Update in batches to avoid timeouts
      const batchSize = 100;
      for (let i = 0; i < messagesWithoutChannel.length; i += batchSize) {
        const batch = messagesWithoutChannel.slice(i, i + batchSize);
        const ids = batch.map(msg => msg.id);
        
        const { error: updateError } = await getSupabaseClient(true)
          .from('messages')
          .update({ channel: 'general' })
          .in('id', ids);
        
        if (updateError) {
          console.error(`Error updating batch ${i} to ${i + batch.length}:`, updateError);
        }
      }
      
      console.log('Finished updating messages without channels');
    } else {
      console.log('All messages have a channel assigned');
    }
  } catch (error) {
    console.error('Database migration error:', error);
  }
}

// Add back the throttledSave function that was accidentally removed
let saveTimeout = null;
function throttledSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(async () => {
        await saveAllMessages();
    }, 5000); // Save every 5 seconds
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
