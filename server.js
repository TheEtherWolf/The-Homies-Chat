const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4, validate: isValidUUID } = require('uuid');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Import authentication routes
const { router: authRouter, auth } = require('./auth-routes');
const newAuthRoutes = require('./routes/auth');

// Import storage and email verification modules
const storage = require('./mega-storage');
const { 
  sendVerificationEmail, 
  verifyEmail, 
  resendVerificationEmail 
} = require('./email-verification');

// Import extension download module
const extensionDownload = require('./extension-download');

const {
    getSupabaseClient,
    registerUser,
    signInUser,
    signOutUser,
    getCurrentUser,
    getAllUsers,
    saveMessageToSupabase,
    loadMessagesFromSupabase,
    getUserIdByUsername,
    markMessageAsDeleted,
    sendFriendRequest,
    acceptFriendRequest,
    rejectOrRemoveFriend,
    getFriendships
} = require("./supabase-client");

// Environment settings - DO NOT force development mode
// Keep the existing NODE_ENV or default to 'production' for security
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production'; // Default to production for security
}

// IMPORTANT: Disable development authentication bypasses
process.env.ALLOW_DEV_AUTH = 'false';

console.log(`Running in ${process.env.NODE_ENV} mode with dev auth DISABLED`);

// Initialize Express app with JSON and URL-encoded body parsing
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(cookieParser());

// Use authentication routes
app.use('/api/auth', authRouter);

// Use new NextAuth-compatible auth routes
app.use('/api/auth', newAuthRoutes);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

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

// Add extension download routes
app.use(extensionDownload.router);

// Session verification middleware for protected routes
app.use((req, res, next) => {
  // Skip session check for public routes
  const publicRoutes = [
    '/',
    '/index.html',
    '/assets/favicon.ico',
    '/pattern.png',
    '/js/main.js',
    '/login',
    '/api/auth/signin',
    '/api/auth/signup',
    '/api/auth/verify-session',
    '/api/auth/csrf',
    '/api/auth/callback/credentials',
    '/api/auth/session',
    '/api/auth/providers',
    '/api/auth/_log',
    '/favicon.ico'
  ];

  // Check if the current path is a public route
  const isPublicRoute = publicRoutes.some(route => {
    // Handle exact matches
    if (req.path === route) return true;
    // Handle wildcard routes (e.g., /public/*)
    if (route.endsWith('*') && req.path.startsWith(route.slice(0, -1))) return true;
    return false;
  });

  // Skip session check for public routes
  if (isPublicRoute) {
    return next();
  }

  // For API routes, check the Authorization header
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  } else if (req.cookies && req.cookies.next_auth_session_token) {
    token = req.cookies.next_auth_session_token;
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  // If no token is found, return 401
  if (!token) {
    return res.status(401).json({ 
      ok: false, 
      error: 'No authentication token provided',
      message: 'Please sign in to continue'
    });
  }

  // Verify the token
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ 
      ok: false, 
      error: 'Invalid or expired session',
      message: 'Your session has expired. Please sign in again.'
    });
  }

  // Attach user to request object
  req.user = session.user;
  req.session = session;

  // Continue to the next middleware/route handler
  next();
});

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

// Add a route for profile picture uploads
app.post('/api/upload-profile-picture', async (req, res) => {
    try {
        console.log('Received profile picture upload request');
        
        // Check if we have the necessary data
        if (!req.body || !req.body.userId || !req.body.username) {
            console.error('Missing required user data in profile picture upload request');
            return res.status(400).json({ success: false, message: 'Missing required user data' });
        }
        
        // Extract user info from request
        const { userId, username } = req.body;
        console.log(`Processing profile picture upload for user ${username} (${userId})`);
        
        // Check if we have an image file
        if (!req.body.imageData) {
            console.error('No image data provided in profile picture upload request');
            return res.status(400).json({ success: false, message: 'No image data provided' });
        }
        
        // Extract the base64 image data
        const imageData = req.body.imageData;
        const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');
        
        // Upload to Supabase storage
        const fileName = `profile-pictures/${userId}_${Date.now()}.png`;
        console.log(`Uploading profile picture to Supabase storage as ${fileName}`);
        
        const uploadResult = await uploadFileToSupabase(fileName, imageBuffer, 'image/png');
        
        if (!uploadResult || !uploadResult.publicUrl) {
            console.error('Failed to upload profile picture to Supabase storage');
            return res.status(500).json({ success: false, message: 'Failed to upload profile picture' });
        }
        
        console.log(`Profile picture uploaded successfully to ${uploadResult.publicUrl}`);
        
        // Update the user's avatar URL in the database
        const { error: updateError } = await getSupabaseClient(true)
            .from('users')
            .update({ 
                avatar_url: uploadResult.publicUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
            
        if (updateError) {
            console.error('Error updating user avatar URL in database:', updateError);
            return res.status(500).json({ success: false, message: 'Failed to update avatar URL in database' });
        }
        
        console.log(`Updated avatar_url for user ${username} in database`);
        
        // Return success with the new avatar URL
        return res.json({ 
            success: true, 
            avatarUrl: uploadResult.publicUrl,
            avatar_url: uploadResult.publicUrl // Include both formats for compatibility
        });
    } catch (error) {
        console.error('Error processing profile picture upload:', error);
        return res.status(500).json({ success: false, message: 'Server error processing profile picture upload' });
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
    // Get user ID from the authenticated socket
    const userId = socket.userId;
    
    // Store the user's socket ID
    if (userId) {
        if (!users[userId]) {
            users[userId] = { sockets: new Set() };
        }
        users[userId].sockets.add(socket.id);
        
        // Update user status to online
        updateUserStatus(userId, 'online');
    }
    
    // Handle disconnection
    socket.on('disconnect', () => {
        if (userId && users[userId]) {
            users[userId].sockets.delete(socket.id);
            
            // If no more sockets for this user, update status to offline
            if (users[userId].sockets.size === 0) {
                updateUserStatus(userId, 'offline');
                delete users[userId];
            }
        }
    });
    console.log('User connected:', socket.id);
    
    // Add login-user event handler for backward compatibility with client-side code
    socket.on('login-user', async (data, callback) => {
        console.log('[AUTH_DEBUG] Received login-user event via socket.io for username:', data.username);
        
        try {
            if (!data || !data.username || !data.password) {
                console.warn('[AUTH_DEBUG] Login rejected: missing username or password');
                return callback({
                    success: false,
                    message: 'Username and password are required'
                });
            }
            
            // Attempt to sign in the user
            console.log('[AUTH_DEBUG] Attempting to sign in user with signInUser function');
            const user = await signInUser(data.username, data.password);
            
            if (!user) {
                console.warn('[AUTH_DEBUG] Login failed: invalid credentials for user', data.username);
                return callback({
                    success: false,
                    message: 'Invalid username or password'
                });
            }
            
            console.log('[AUTH_DEBUG] Login successful for user:', data.username);
            
            // Create a session token
            const token = uuidv4();
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
            
            // Update user's socket association
            users[socket.id] = {
                socketId: socket.id,
                authenticated: true,
                username: user.username,
                id: user.id
            };
            
            console.log('[AUTH_DEBUG] User authenticated and added to users object:', users[socket.id]);
            
            // Return success response
            return callback({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.user_metadata?.avatar_url
                },
                session: {
                    token,
                    expires: expires.toISOString()
                },
                message: 'Login successful'
            });
        } catch (error) {
            console.error('[AUTH_DEBUG] Login error:', error);
            return callback({
                success: false,
                message: 'An error occurred during login: ' + (error.message || 'Unknown error')
            });
        }
    });
    
    // Ensure the user's state is properly tracked in our users object
    if (!users[socket.id]) {
        users[socket.id] = {
            socketId: socket.id,
            authenticated: false,
            username: null,
            id: null // Changed from userId to id for consistency
        };
    }
    
    // Get active users list on request
    socket.on('get-active-users', () => {
        // Send the current active users list to the requesting client
        socket.emit("active-users", Array.from(activeUsers));
        console.log('Sent active users list to client on request:', Array.from(activeUsers));
    });
    
    // Handle registration requests
    // Handle login requests
    socket.on('login-user', async (data, callback) => {
        try {
            const { username, password } = data;
            
            if (!username || !password) {
                return callback({ success: false, message: 'Username and password are required' });
            }
            
            // Attempt to sign in the user
            const user = await signInUser(username, password);
            
            if (!user) {
                return callback({ success: false, message: 'Invalid username or password' });
            }
            
            // Update user status to online
            try {
                const { error: statusError } = await getSupabaseClient(true)
                    .from('user_status')
                    .upsert({
                        user_id: user.id,
                        status: 'online',
                        last_updated: new Date().toISOString()
                    }, { onConflict: 'user_id' });
                
                if (statusError) {
                    console.error('Error updating user status:', statusError);
                }
            } catch (statusErr) {
                console.error('Exception updating user status:', statusErr);
            }
            
            // Create NextAuth-like session
            const { createSession } = require('./next-auth-adapter');
            const session = createSession(user);
            
            // Associate the socket with the user
            socket.userId = user.id;
            socket.username = user.username;
            socket.sessionToken = session.token;
            
            // Join a room specific to this user for private messages
            socket.join(`user:${user.id}`);
            
            // Mark user as active
            activeUsers.add(username);
            updateUserList();
            
            // Broadcast user's online status
            socket.broadcast.emit('user-status-change', {
                userId: user.id,
                status: 'online',
                username: user.username
            });
            
            // Return success with user data and session
            return callback({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    avatar_url: user.avatar_url,
                    status: 'online'
                },
                session: {
                    token: session.token,
                    expires: session.expires
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            return callback({ success: false, message: 'An error occurred during login' });
        }
    });
    
    socket.on('register-user', async (data, callback) => {
        try {
            const { username, password, email } = data;
            
            if (!username || !password) {
                return callback({ success: false, message: 'Username and password are required' });
            }
            
            // Check if username already exists
            const { data: existingUser } = await getSupabaseClient(true)
                .from('users')
                .select('id')
                .eq('username', username)
                .maybeSingle();
                
            if (existingUser) {
                return callback({ success: false, message: 'Username already exists' });
            }
            
            // Register the user
            const user = await registerUser(username, password, email);
            
            if (!user) {
                return callback({ success: false, message: 'Registration failed' });
            }
            
            // Create NextAuth-like session
            const { createSession } = require('./next-auth-adapter');
            const session = createSession(user);
            
            // Associate the socket with the user
            socket.userId = user.id;
            socket.username = user.username;
            socket.sessionToken = session.token;
            
            // Join a room specific to this user for private messages
            socket.join(`user:${user.id}`);
            
            // Mark user as active
            activeUsers.add(username);
            updateUserList();
            
            // Return success with user data and session
            return callback({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email || `${username}@homies.app`,
                    avatar_url: null,
                    status: 'online'
                },
                session: {
                    token: session.token,
                    expires: session.expires
                }
            });
        } catch (error) {
            console.error('Registration error:', error);
            return callback({ success: false, message: 'An error occurred during registration' });
        }
    });
    
    // Handle loading messages for a user
    socket.on('load-user-messages', async (data, callback) => {
        try {
            const username = data.username || (users[socket.id] ? users[socket.id].username : null);
            
            if (!username) {
                return callback({ success: false, message: 'Username is required' });
            }
            
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
            
            // Return success with message data
            callback({
                success: true,
                messages: channelMessages['general'],
                channel: 'general'
            });
            
        } catch (error) {
            console.error(`Error loading messages for user ${username || 'unknown'}:`, error);
            callback({
                success: false,
                message: 'An error occurred while loading messages'
            });
        }
    });
    
    // Join handler
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
        users[socket.id] = { username, id: null }; // Initialize with null id
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
        users[socket.id] = { username, id: null }; // Initialize with null id
        activeUsers.add(username);
        updateUserList();
    });
    
    // Handle channel-specific message requests
    socket.on('get-channel-messages', async (data) => {
        const channel = data.channel || 'general';
        const limit = data.limit || 25; // Default to 25 messages per page
        const offset = data.offset || 0; // Default to first page
        const isOlderMessages = data.isOlderMessages === true; // Whether this is a lazy load request
        const isInitialLoad = data.isInitialLoad === true; // Whether this is the initial load
        
        console.log(`Requested messages for channel: ${channel} (limit: ${limit}, offset: ${offset}, isOlderMessages: ${isOlderMessages})`);
        
        try {
            let messages = [];
            let error = null;
            
            // Check if this is a DM channel request 
            if (data.isDM) {
                console.log(`Handling DM channel request for ${channel} with participants:`, data.participants);
                
                try {
                    // Load DM messages from Supabase with pagination
                    const query = getSupabaseClient(true)
                        .from('messages')
                        .select('*')
                        .or(`recipient_id.eq.${data.participants[0]},recipient_id.eq.${data.participants[1]}`)
                        .or(`sender_id.eq.${data.participants[0]},sender_id.eq.${data.participants[1]}`);
                    
                    // For older messages, we want to get messages before the current ones
                    // For initial load or newer messages, we want the most recent ones
                    if (isOlderMessages) {
                        // For older messages, order by created_at descending to get older ones first
                        // and then reverse the array later
                        query.order('created_at', { ascending: false })
                            .limit(limit)
                            .range(offset, offset + limit - 1);
                    } else {
                        // For initial load, get the most recent messages
                        query.order('created_at', { ascending: false })
                            .limit(limit);
                    }
                        
                    const result = await query;
                        
                    if (result.error) {
                        console.error('Error loading DM messages:', result.error);
                        error = result.error;
                    } else {
                        // Try to filter by is_deleted if column exists
                        messages = result.data.filter(msg => {
                            // First check if between these two users
                            const isCorrectUsers = (
                                (msg.sender_id === data.participants[0] && msg.recipient_id === data.participants[1]) ||
                                (msg.sender_id === data.participants[1] && msg.recipient_id === data.participants[0])
                            );
                            
                            // Then check if not deleted (if is_deleted field exists)
                            const isNotDeleted = (msg.is_deleted === undefined || msg.is_deleted === null || msg.is_deleted === false) &&
                                  (msg.deleted === undefined || msg.deleted === null || msg.deleted === false);
                            
                            return isCorrectUsers && isNotDeleted;
                        });
                        
                        // Reverse the array to get chronological order if we're getting older messages
                        if (isOlderMessages) {
                            messages.reverse();
                        }
                        
                        console.log(`Found ${messages.length} DM messages between users`);
                    }
                } catch (err) {
                    console.error('Exception in DM message loading:', err);
                    error = err;
                }
            } else {
                // For regular channels, load from Supabase with pagination
                try {
                    console.log(`Querying Supabase for messages in channel: ${channel} with pagination`);
                    
                    // Build the query with pagination
                    const query = getSupabaseClient(true)
                        .from('messages')
                        .select('*')
                        .eq('channel', channel);
                    
                    // For older messages, we want to get messages before the current ones
                    // For initial load or newer messages, we want the most recent ones
                    if (isOlderMessages) {
                        // For older messages, order by created_at descending to get older ones first
                        // and then reverse the array later
                        query.order('created_at', { ascending: false })
                            .limit(limit)
                            .range(offset, offset + limit - 1);
                    } else {
                        // For initial load, get the most recent messages
                        query.order('created_at', { ascending: false })
                            .limit(limit);
                    }
                    
                    const result = await query;
                    
                    if (result.error) {
                        console.error('Error loading channel messages:', result.error);
                        error = result.error;
                    } else {
                        // Try to filter by is_deleted if column exists
                        messages = result.data.filter(msg => {
                            return (msg.is_deleted === undefined || msg.is_deleted === null || msg.is_deleted === false) &&
                                  (msg.deleted === undefined || msg.deleted === null || msg.deleted === false);
                        });
                        
                        // Reverse the array to get chronological order if we're getting older messages
                        if (isOlderMessages) {
                            messages.reverse();
                        }
                        
                        console.log(`Found ${messages.length} messages for channel ${channel}`);
                        
                        // Add debug info about the messages
                        if (messages.length > 0) {
                            console.log('Sample message data:', JSON.stringify(messages[0], null, 2));
                        } else {
                            console.log('No messages found for channel:', channel);
                        }
                    }
                } catch (err) {
                    console.error('Exception in channel message loading:', err);
                    error = err;
                }
            }
            
            // Transform the messages for client consumption
            const clientMessages = await Promise.all(messages.map(async (msg) => {
                let senderUsername = 'Unknown User';
                if (msg.sender_id) {
                    senderUsername = await resolveUsernameById(msg.sender_id);
                }
                return {
                    id: msg.id,
                    content: msg.content,
                    sender: senderUsername,
                    username: senderUsername, // Add username field for client compatibility
                    senderId: msg.sender_id,
                    timestamp: msg.created_at || msg.timestamp,
                    channel: msg.channel || channel,
                    recipientId: msg.recipient_id,
                    isDM: msg.is_dm || data.isDM || false,
                    type: msg.type,
                    fileUrl: msg.file_url,
                    fileType: msg.file_type,
                    fileSize: msg.file_size,
                    is_deleted: msg.is_deleted
                };
            }));
            
            // Send messages to client
            console.log(`Sending ${clientMessages.length} messages to client for channel ${channel}`);
            socket.emit('message-history', { 
                channel, 
                messages: clientMessages,
                error: error ? error.message : null,
                isOlderMessages: isOlderMessages,
                hasMore: clientMessages.length >= limit
            });
            
        } catch (err) {
            console.error(`Error retrieving messages for channel ${channel}:`, err);
            socket.emit('message-history', { 
                channel, 
                messages: [],
                error: err.message,
                isOlderMessages: isOlderMessages,
                hasMore: false
            });
        }
    });
    
    // Legacy handler for backward compatibility
    socket.on('get-messages', async (data) => {
        // Forward to the new handler
        socket.emit('get-channel-messages', data);
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
        const content = data.message || data.content || '';
        const channel = data.channel || 'general';
        const timestamp = data.timestamp || Date.now();
        const tempId = data.tempId; // Capture tempId from client
        let senderId = data.senderId || null;
        let username = data.username || data.sender || null;
        
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
                senderId = users[socket.id].id; // Corrected key from userId to id
                console.log(`Using socket session user: ${username} (${senderId})`);
            }
        }
        
        // If we still don't have a username, try to look it up by ID
        if (!username && senderId) {
            try {
                console.log(`Looking up username for sender ID: ${senderId}`);
                const { data: userRecord, error } = await getSupabaseClient(true)
                    .from('users')
                    .select('username')
                    .eq('id', senderId)
                    .maybeSingle();
                    
                if (error) {
                    console.error('Error looking up username by ID:', error);
                }
                
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
                    id: senderId // Corrected key from userId to id
                };
                console.log(`Updated socket session with user ${username} (${senderId})`);
            }
        } catch (userError) {
            console.error('Error resolving user:', userError);
            socket.emit('message-error', { message: 'Error processing user account' });
            return;
        }
        
        // Create preliminary message object (will be updated after save)
        const messageObj = {
            // id: uuidv4(), // ID will come from database
            sender: username,
            senderId: senderId,
            content: content,
            timestamp: timestamp,
            channel: channel,
            tempId: tempId // Include tempId if provided
        };

        // Try saving to database FIRST
        let savedMessageData;
        try {
            console.log(`Attempting to save message to Supabase from user ${username} (${senderId}) in channel ${channel}`);
            
            // Save message to Supabase and get the returned data (including the permanent ID)
            savedMessageData = await saveMessageToSupabase({
                sender_id: senderId,
                content: content,
                channel: channel
                // Add any other relevant fields like type, file_url etc. if needed
            });

            if (!savedMessageData || !savedMessageData.id) {
                throw new Error('Failed to save message or retrieve ID from database.');
            }

            // Update message object with permanent ID from database
            messageObj.id = savedMessageData.id;
            messageObj.created_at = savedMessageData.created_at; // Use DB timestamp if available

            console.log(`Message saved successfully with ID: ${messageObj.id}`);

            // Add to the appropriate channel cache AFTER successful save
            if (!channelMessages[channel]) {
                channelMessages[channel] = [];
            }
            // Store the object with the permanent ID
            channelMessages[channel].push(messageObj);

            // Broadcast the confirmed message (with permanent ID and tempId) to all clients
            io.emit("chat-message", messageObj);
            
            // Send a specific confirmation to the sender with tempId->id mapping
            // This helps the client update its UI and cache properly
            socket.emit("message-sent", {
                tempId: tempId, 
                id: messageObj.id,
                created_at: messageObj.created_at || savedMessageData.created_at,
                channel: channel
            });
            
            console.log(`Sent message confirmation for ID ${messageObj.id} (temp: ${tempId}) back to sender`);
            
        } catch (dbError) {
            console.error("Error saving message to database:", dbError);
            // Optionally notify the sender about the failure
            socket.emit('message-error', { 
                message: 'Failed to save message to database.', 
                tempId: tempId // Include tempId so client can potentially retry or indicate failure
            });
            // Do NOT broadcast the message if save failed
            return; // Stop further processing for this message
        }
    });
    
    // Direct message handler
    socket.on("direct-message", async (data) => {
        if (!users[socket.id] || !users[socket.id].authenticated) { // Added authentication check
            console.error('User not authenticated but trying to send DM');
            if (data.callback) { 
                data.callback({ success: false, message: 'Authentication required.' });
            }
            return;
        }
        let senderUsername = users[socket.id].username;
        const senderId = users[socket.id].id;
        const recipientId = data.recipientId;
        const messageContent = data.message;
        const tempId = data.tempId; // Capture tempId from client

        if (!recipientId || !messageContent || typeof messageContent !== 'string' || messageContent.trim() === '') {
            console.error('Invalid DM data received:', data);
            if (data.callback) { 
                data.callback({ success: false, message: 'Invalid DM data.' });
            }
            return;
        }
        
        // Always resolve senderUsername from DB if missing
        if (!senderUsername) {
            senderUsername = await resolveUsernameById(senderId);
        }
        
        console.log(`DM from ${senderUsername} (${senderId}) to ${recipientId}: ${messageContent.substring(0, 20)}...`);

        // Ensure recipient exists (optional but good practice)
        try {
            const { data: recipientExists, error } = await getSupabaseClient(true)
                .from('users')
                .select('id')
                .eq('id', recipientId)
                .limit(1);
            if (error || !recipientExists) {
                console.warn(`Recipient user ${recipientId} not found.`);
                if (data.callback) { 
                    data.callback({ success: false, message: 'Recipient user not found.' });
                }
                // Decide if you want to proceed or stop here
                // return; 
            }
        } catch(err) {
             console.error('Error checking recipient existence:', err);
             // Handle error appropriately
        }

        // Construct preliminary message object
        const messageObj = {
            // id: uuidv4(), // ID will come from database
            senderId: senderId,
            recipientId: recipientId,
            content: messageContent,
            timestamp: Date.now(),
            type: 'dm',
            tempId: tempId, // Include tempId if provided
            sender: senderUsername, // Always include username
            username: senderUsername // For client compatibility
        };

        // Try saving DM to database FIRST
        let savedMessageData;
        try {
            console.log(`Attempting to save DM to Supabase from ${senderId} to ${recipientId}`);
            savedMessageData = await saveMessageToSupabase({
                sender_id: senderId,
                recipient_id: recipientId, // Make sure your DB schema/function handles this
                content: messageContent,
                type: 'dm' // Ensure type is saved
                // channel: null or specific DM identifier if needed
            });

            if (!savedMessageData || !savedMessageData.id) {
                throw new Error('Failed to save DM or retrieve ID from database.');
            }

            // Update message object with permanent ID
            messageObj.id = savedMessageData.id;
            messageObj.created_at = savedMessageData.created_at;
            messageObj.sender = senderUsername; // Add sender username for convenience

            console.log(`DM saved successfully with ID: ${messageObj.id}`);

            // Find recipient socket(s)
            const recipientSocketIds = Object.keys(users).filter(id => 
                users[id] && users[id].id === recipientId
            );
            
            // Send to recipient(s)
            recipientSocketIds.forEach(socketId => {
                io.to(socketId).emit('direct-message', messageObj);
                console.log(`Sent DM ${messageObj.id} to recipient socket ${socketId}`);
            });
            
            // Send confirmation back to sender (including the final message object with IDs)
            // Use a different event like 'dm-sent-confirmation' or similar
            socket.emit('dm-sent-confirmation', messageObj); 
            console.log(`Sent DM confirmation ${messageObj.id} back to sender socket ${socket.id}`);

            // Optionally cache DMs server-side if needed
            // Cache under a combined key like `${senderId}-${recipientId}` or `${recipientId}-${senderId}` sorted

        } catch (dbError) {
            console.error('Error saving DM to database:', dbError);
            // Notify the sender about the failure
            socket.emit('message-error', { 
                message: 'Failed to send direct message.', 
                tempId: tempId // Include tempId for client-side handling
            });
        }
    });
    
    // Handle message deletion
    socket.on('delete-message', async (data, callback) => {
        try {
            const { messageId } = data;
            const userId = users[socket.id]?.id;
            
            // Validate input
            if (!messageId) {
                console.error('Missing required fields for message deletion');
                return callback({ 
                    success: false, 
                    error: 'Missing required fields' 
                });
            }
            
            // Verify the user is authenticated
            if (!users[socket.id] || !users[socket.id].authenticated) {
                console.error('Unauthenticated user attempting to delete message');
                return callback({ 
                    success: false, 
                    error: 'Authentication required' 
                });
            }
            
            console.log(`Attempting to delete message ${messageId} by user ${userId}`);
            if (!users[socket.id] || !users[socket.id].authenticated) {
                console.error('Unauthenticated user tried to delete a message');
                return callback({ 
                    success: false, 
                    error: 'Authentication required' 
                });
            }
            
            // Verify the user ID matches the socket's user ID
            if (users[socket.id].id !== userId) {
                console.error(`User ID mismatch: socket has ${users[socket.id].id} but request has ${userId}`);
                return callback({ 
                    success: false, 
                    error: 'User ID mismatch' 
                });
            }
            
            // Call the Supabase function to mark the message as deleted
            const success = await markMessageAsDeleted(messageId, userId);
            
            if (success) {
                console.log(`Message ${messageId} successfully marked as deleted`);
                
                // Broadcast to all clients that the message has been deleted
                io.emit('message-deleted', {
                    messageId,
                    deletedBy: userId
                });
                
                return callback({ success: true });
            } else {
                console.error(`Failed to delete message ${messageId}`);
                return callback({ 
                    success: false, 
                    error: 'Failed to delete message' 
                });
            }
        } catch (error) {
            console.error('Error handling message deletion:', error);
            return callback({ 
                success: false, 
                error: 'Server error processing deletion request' 
            });
        }
    });
    
    // Call signaling
    socket.on('call-offer', ({offer, caller, target, sender}) => {
        console.log(`Call offer from ${caller} to ${target}`);
        
        // Find the target socket by username in the users map
        const targetSocketId = Object.keys(users).find(id => users[id] && users[id].username === target);
        
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
                        id: userId // Corrected key from userId to id
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
                socket.emit('verify-fail', { message: 'Invalid verification code. Please try again.' });
                return;
            }
            
            // Create user in Supabase
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            const userId = await registerUser(userData.username, hashedPassword, userData.email);
            
            socket.emit('register-success', {
                message: 'Registration successful!',
                username: userData.username,
                id: userId // Corrected key from userId to id
            });
        } catch (error) {
            console.error('Error during verification:', error);
            socket.emit('verify-fail', { message: 'Verification failed. Please try again.' });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        
        // Get user info before removing from users object
        const userInfo = users[socket.id];
        
        if (userInfo && userInfo.username) {
            console.log(`User disconnected: ${userInfo.username}`);
            
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
});

// Handle user registration request
socket.on('register', async (data) => {
    try {
        console.log(`Registering user with ${data.email && data.email.includes('@proton') ? 'ProtonMail' : 'email'}: ${data.username} (${data.email})`);
        
        // Only use simplified registration in strict development mode
        if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true') {
            console.log(`Development mode: Simplified registration for ${data.username}`);
            
            // Look up user by username
            const { data: existingUser, error: lookupError } = await getSupabaseClient(true)
                .from('users')
                .select('id, username')
                .eq('username', data.username)
                .limit(1);
                
            if (lookupError) {
                console.error('Error looking up user by username:', lookupError);
            }
            
            // Generate a UUID for the user if not provided
            let userId = data.id || uuidv4();
            
            // If user exists with this username but different ID, use the existing record
            if (existingUser && existingUser.id) {
                console.log(`User ${data.username} already exists with ID ${existingUser.id}, using existing ID`);
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
                    console.log(`Creating new user record for ${data.username} with ID ${userId}`);
                    // Create user record
                    const { error: createError } = await getSupabaseClient(true)
                        .from('users')
                        .insert({
                            id: userId,
                            username: data.username,
                            email: data.email || `${data.username}@homies.app`,
                            password: 'auto-created',
                            created_at: new Date().toISOString(),
                            last_seen: new Date().toISOString(),
                            verified: true,
                            status: 'online'
                        });
                        
                    if (createError) {
                        // If username already exists, try to find it and use that ID
                        if (createError.code === '23505') {
                            console.log(`Username ${data.username} already exists, finding user ID`);
                            const { data: existingByUsername } = await getSupabaseClient(true)
                                .from('users')
                                .select('id')
                                .eq('username', data.username)
                                .maybeSingle();
                                
                            if (existingByUsername && existingByUsername.id) {
                                userId = existingByUsername.id;
                                console.log(`Found existing user ${data.username} with ID ${userId}`);
                            } else {
                                // Generate a truly unique username
                                const uniqueUsername = `${data.username}_${Date.now().toString(36).substring(4)}`;
                                
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
                username: data.username,
                id: userId // Corrected key from userId to id
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
            
            // Fetch and emit friendships
            try {
                const friendships = await getFriendships(userId);
                if (friendships) {
                    console.log(`Emitting friend list to ${data.username} (Found: ${friendships.length})`);
                    socket.emit('friend-list', friendships);
                } else {
                     console.log(`No friendships found or error fetching for ${data.username}`);
                     socket.emit('friend-list', []); // Send empty list on error or none found
                }
            } catch (friendError) {
                console.error(`Error fetching friendships for ${userId}:`, friendError);
                socket.emit('friend-list', []); // Send empty list on error
            }
            
            // Return successful authentication with potentially updated ID
            socket.emit('auth-success', { 
                username: data.username, 
                id: userId,
                message: 'Session registered successfully' 
            });
            
            // Broadcast to others this user is online
            socket.broadcast.emit('user-status-change', { 
                userId: userId, 
                username: data.username,
                status: 'online' 
            });
            
            console.log(`Session registered for ${data.username} with ID ${userId}`);
        } else {
            // Standard registration flow for production
            console.log('Production mode: Standard registration flow');
            // Implement standard registration flow here
            socket.emit('auth-error', { message: 'Standard registration not implemented yet' });
            return;
        }
    } catch (error) {
        console.error('Error during session registration:', error);
        socket.emit('auth-error', { message: 'Registration failed due to server error' });
    }
    });

    // Get user by username
    socket.on('get-user-by-username', async (data, callback) => {
        if (!data || !data.username) {
            return callback({ success: false, message: 'Username is required' });
        }
        
        try {
            // Try to find user in Supabase by username
            const { data: users, error } = await getSupabaseClient(true)
                .from('users')
                .select('id, username')
                .eq('username', data.username)
                .limit(1);
                
            if (error) {
                console.error('Error getting user by username:', error);
                return callback({ success: false, message: 'Database error' });
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
            console.error('Error in get-user-by-username:', err);
            return callback({ success: false, message: 'Server error' });
        }
    });

    // Get current user information
    socket.on('get-current-user', async (data, callback) => {
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        
        const userId = users[socket.id].id;
        
        try {
            const { data: user, error } = await getSupabaseClient(true)
                .from('users')
                .select('id, username, friend_code, avatar_url')
                .eq('id', userId)
                .single();
                
            if (error) {
                console.error('Error getting current user:', error);
                return callback({ success: false, message: 'Database error' });
            }
            
            return callback({ success: true, user });
        } catch (err) {
            console.error('Exception in get-current-user:', err);
            return callback({ success: false, message: 'Server error' });
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
        const userId = users[socket.id].id; // Corrected key from userId to id
        
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
                .select('id, username')
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
    socket.on('send-message', async (message, callback) => {
        if (!users[socket.id]) {
            console.error('User not authenticated for message sending');
            if (callback) callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        try {
            // Validate the message
            if (!message || !message.content) {
                console.error('Invalid message format');
                if (callback) callback({ success: false, message: 'Invalid message format' });
                return;
            }
            
            // Get sender information
            const sender = users[socket.id];
            
            // Validate sender has an ID before proceeding
            if (!sender || !sender.id) { // Corrected key from userId to id
                console.error('Cannot send message: Invalid or missing sender ID');
                socket.emit('error', { message: 'User session invalid. Please refresh the page.' });
                if (callback) callback({ success: false, message: 'User session invalid' });
                return;
            }
            
            // Add server timestamp and uuid
            const messageId = uuidv4();
            const timestamp = new Date().toISOString();
            
            // Create full message object
            const fullMessage = {
                id: messageId,
                content: message.content,
                sender: sender.username,
                senderId: sender.id, // Corrected key from userId to id
                timestamp: timestamp,
                channel: message.channel,
                isDM: message.isDM || false,
                recipientId: message.recipientId || null
            };
            
            console.log(`Preparing to save message with sender_id: ${sender.id}`);
            
            // Save message to local storage regardless of Supabase availability
            try {
                // Add message to channel messages
                const channel = message.channel || 'general';
                if (!channelMessages[channel]) {
                    channelMessages[channel] = [];
                }
                
                // Add message to channel
                channelMessages[channel].push({
                    id: messageId,
                    content: message.content,
                    sender: sender.username,
                    sender_id: sender.id,
                    timestamp: timestamp,
                    created_at: timestamp,
                    channel: channel
                });
                
                // Save messages to storage
                await storage.saveMessages({ channels: channelMessages });
                console.log(`Message saved to local storage for channel ${channel}`);
            } catch (storageError) {
                console.error('Error saving message to local storage:', storageError);
                // Continue anyway, as we'll still send the message to clients
            }
            
            // Try to save to Supabase if available
            try {
                const { getSupabaseClient } = require('./supabase-client');
                const supabase = getSupabaseClient(true);
                
                if (supabase) {
                    // Save message to Supabase using upsert instead of insert to handle duplicates
                    const { error } = await supabase
                        .from('messages')
                        .upsert({
                            id: messageId,
                            content: message.content,
                            sender_id: sender.id, // Corrected key from userId to id
                            channel: message.channel,
                            created_at: timestamp,
                            recipient_id: message.recipientId || null,
                            is_dm: message.isDM || false,
                            is_deleted: false,
                            type: message.type || 'text',
                            file_url: message.fileUrl || null,
                            file_type: message.fileType || null,
                            file_size: message.fileSize || null
                        }, { onConflict: 'id' });
                        
                    if (error) {
                        console.error('Error saving message to Supabase:', error);
                        // Continue anyway, as we've already saved to local storage
                    } else {
                        console.log('Message successfully saved to Supabase');
                    }
                } else {
                    console.log('Supabase client not available, message saved to local storage only');
                }
            } catch (dbError) {
                console.error('Database error saving message to Supabase:', dbError);
                // Continue anyway, as we've already saved to local storage
            }
            
            // If we get here, the message was saved successfully to at least local storage
            if (callback) callback({ success: true, messageId });
            
            // Broadcast to the appropriate recipients
            if (message.isDM && message.recipientId) {
                // Find the recipient's socket
                const recipientSocket = Object.keys(users).find(id => 
                    users[id] && users[id].id === message.recipientId
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
            if (callback) callback({ success: false, message: 'Server error' });
        }
    });
    
    // Friends system handlers
    
    // Update friend code in Supabase
    socket.on('update-friend-code', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        
        const userId = users[socket.id].id;
        const { friendCode } = data;
        
        if (!friendCode) {
            return callback({ success: false, message: 'Friend code is required' });
        }
        
        try {
            console.log(`Updating friend code for user ${userId} to ${friendCode}`);
            
            // Update the user record in Supabase
            const { data: updateData, error } = await getSupabaseClient(true)
                .from('users')
                .update({ friend_code: friendCode })
                .eq('id', userId);
                
            if (error) {
                console.error('Error updating friend code in Supabase:', error);
                return callback({ success: false, message: 'Failed to update friend code', error: error.message });
            }
            
            // Update the user object in memory
            if (users[socket.id]) {
                users[socket.id].friendCode = friendCode;
            }
            
            console.log(`Friend code updated successfully for user ${userId}`);
            return callback({ success: true, message: 'Friend code updated successfully' });
        } catch (err) {
            console.error('Error in update-friend-code handler:', err);
            return callback({ success: false, message: 'Server error', error: err.message });
        }
    });
    
    // Helper function to generate a random friend code
    function generateCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return code;
    }
    
    // Generate a friend code for the user if they don't have one
    socket.on('generate-friend-code', async (data, callback) => {
        // Validate user authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        // Validate input data
        if (!data || !data.username) {
            return callback({ success: false, message: 'Username is required' });
        }

        const userId = users[socket.id].id;
        console.log(`Generating new friend code for user ${users[socket.id].username} (${userId})`);
        
        try {
            // Generate a random 8-character code
            const friendCode = generateCode();
            
            // Update the user's friend code in the database
            const { data: updatedUser, error } = await getSupabaseClient(true)
                .from('users')
                .update({ friend_code: friendCode })
                .eq('id', userId)
                .select('friend_code')
                .single();
                
            if (error) {
                console.error('Error updating friend code:', error);
                return callback({ success: false, message: 'Database error' });
            }
            
            console.log(`Generated new friend code for user ${userId}: ${friendCode}`);
            return callback({ success: true, friendCode });
        } catch (err) {
            console.error('Exception in generate-friend-code:', err);
            return callback({ success: false, message: 'Server error' });
        }
    });
    
    // Get current user's friend code
    socket.on('get-friend-code', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            console.log('User not authenticated for get-friend-code');
            callback({ success: false, message: 'Not authenticated' });
            return;
        }

        const userId = users[socket.id].id;
        console.log(`Getting friend code for user ${userId}`);

        try {
            // Query the users table to get the friend code
            const { data: userData, error } = await getSupabaseClient(true)
                .from('users')
                .select('friend_code')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error getting friend code:', error);
                callback({ success: false, message: 'Database error' });
                return;
            }

            if (!userData || !userData.friend_code) {
                console.log('No friend code found, generating new one');
                // Generate a new friend code and save it
                const friendCode = generateCode();
                
                const { error: updateError } = await getSupabaseClient(true)
                    .from('users')
                    .update({ friend_code: friendCode })
                    .eq('id', userId);
                
                if (updateError) {
                    console.error('Error saving new friend code:', updateError);
                    callback({ success: false, message: 'Failed to generate friend code' });
                    return;
                }
                
                callback({ success: true, friendCode });
            } else {
                console.log(`Found friend code for user ${userId}: ${userData.friend_code}`);
                callback({ success: true, friendCode: userData.friend_code });
            }
        } catch (err) {
            console.error('Error in get-friend-code:', err);
            callback({ success: false, message: 'Server error' });
        }
    });
    
    // Add friend by username and friend code
    socket.on('add-friend-by-username-code', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        
        // Validate input data
        if (!data || !data.username || !data.friendCode) {
            return callback({ success: false, message: 'Both username and friend code are required' });
        }
        
        const senderId = users[socket.id].id;
        const targetUsername = data.username;
        const targetFriendCode = data.friendCode;
        
        try {
            // Find the user with the given username and friend code
            const { data: recipient, error } = await getSupabaseClient(true)
                .from('users')
                .select('id, username')
                .eq('username', targetUsername)
                .eq('friend_code', targetFriendCode)
                .single();
                
            if (error || !recipient) {
                console.error('Error finding user by username and friend code:', error || 'No matching user found');
                return callback({ success: false, message: 'Invalid username or friend code' });
            }
            
            const recipientId = recipient.id;
            
            // Prevent adding self
            if (senderId === recipientId) {
                return callback({ success: false, message: 'Cannot add yourself as a friend' });
            }
            
            // Check existing friendship status first to avoid unnecessary inserts/errors
            const existingStatus = await getFriendshipStatus(senderId, recipientId);
            if (existingStatus) {
                if (existingStatus.status === 'accepted') {
                    return callback({ success: false, message: 'Already friends' });
                } else if (existingStatus.status === 'pending') {
                    return callback({ success: false, message: 'Friend request already pending' });
                }
            }
            
            // Proceed to send the request
            const result = await sendFriendRequest(senderId, recipientId);
            
            if (result) {
                // Request sent successfully
                callback({ success: true, friendship: result, recipientUsername: recipient.username });
                
                // Notify the recipient if they are currently online
                const recipientSocketId = Object.keys(users).find(id => users[id] && users[id].id === recipientId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('friend-request-received', { 
                        senderId: senderId, 
                        senderUsername: users[socket.id].username, 
                        friendshipId: result.id 
                    }); 
                    console.log(`Notified ${recipientId} about incoming friend request from ${senderId}`);
                }
            } else {
                console.error(`sendFriendRequest returned null/false between ${senderId} and ${recipientId} unexpectedly.`);
                callback({ success: false, message: 'Failed to send friend request (database error)' });
            }
        } catch (err) {
            console.error('Error in add-friend-by-username-code handler:', err);
            callback({ success: false, message: 'Server error sending request' });
        }
    });

    // Get friends list
    socket.on('get-friends', async (callback) => {
        // Check authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, friends: [], message: 'Not authenticated' });
        }

        const userId = users[socket.id].id;

        try {
            // Use the new getFriendships function
            const friendships = await getFriendships(userId);
            
            if (friendships) {
                // Friendships is already in the desired format (array of objects)
                 console.log(`Retrieved ${friendships.length} friendships for user ${userId} via get-friends handler.`);
                callback({ success: true, friends: friendships });
            } else {
                 // Handle case where getFriendships might return null or undefined on error
                 console.error(`getFriendships returned null/undefined for user ${userId} in get-friends handler.`);
                callback({ success: false, friends: [], message: 'Failed to retrieve friends list.' });
            }
        } catch (error) {
            console.error(`Error in get-friends handler for user ${userId}:`, error);
            callback({ success: false, friends: [], message: 'Server error fetching friends list' });
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
            const userId = users[socket.id].id; // Corrected key from userId to id
            
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
    
    // --- Friend Management Handlers ---

    socket.on('send-friend-request', async (data, callback) => {
        // Validate user authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        // Validate input data
        if (!data || !data.recipientId || !isValidUUID(data.recipientId)) {
             return callback({ success: false, message: 'Invalid recipient ID provided' });
        }

        const senderId = users[socket.id].id;
        const recipientId = data.recipientId;

        // Prevent adding self
        if (senderId === recipientId) {
            return callback({ success: false, message: 'Cannot add yourself as a friend' });
        }

        try {
            // Check existing friendship status first to avoid unnecessary inserts/errors
            const existingStatus = await getFriendshipStatus(senderId, recipientId);
            if (existingStatus) {
                if (existingStatus.status === 'accepted') {
                    return callback({ success: false, message: 'Already friends' });
                } else if (existingStatus.status === 'pending') {
                     // Decide if re-sending should be allowed or considered an error
                     return callback({ success: false, message: 'Friend request already pending' });
                } 
                // Handle 'blocked' case if implemented
            }
            
            // Proceed to send the request via supabase-client function
            const result = await sendFriendRequest(senderId, recipientId);
            
            if (result) {
                 // Request sent successfully
                callback({ success: true, friendship: result });
                
                // Notify the recipient if they are currently online
                const recipientSocketId = Object.keys(users).find(id => users[id] && users[id].id === recipientId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('friend-request-received', { 
                        senderId: senderId, 
                        senderUsername: users[socket.id].username, 
                        friendshipId: result.id 
                    }); 
                    console.log(`Notified ${recipientId} about incoming friend request from ${senderId}`);
                }
            } else {
                 // This might occur due to race conditions or unexpected DB errors not caught by getFriendshipStatus
                 console.error(`sendFriendRequest returned null/false between ${senderId} and ${recipientId} unexpectedly.`);
                callback({ success: false, message: 'Failed to send friend request (database error)' });
            }
        } catch (error) {
            console.error(`Error in send-friend-request handler for ${senderId} -> ${recipientId}:`, error);
            callback({ success: false, message: 'Server error sending request' });
        }
    });

    socket.on('accept-friend-request', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        // Validate input
         if (!data || !data.requesterId || !isValidUUID(data.requesterId)) {
             return callback({ success: false, message: 'Invalid requester ID provided' });
        }

        const acceptorId = users[socket.id].id;
        const requesterId = data.requesterId;
        const acceptorUser = users[socket.id]; // Get acceptor's details

        try {
            // Call Supabase client function to update the friendship status
            const result = await acceptFriendRequest(acceptorId, requesterId);
            
            if (result) {
                // Acceptance successful
                callback({ success: true, friendship: result });
                
                // Find the requester's socket to notify them
                const requesterSocketId = Object.keys(users).find(id => users[id] && users[id].id === requesterId);
                let requesterUser = null;
                if (requesterSocketId) {
                    requesterUser = users[requesterSocketId];
                } else {
                    // Optional: Fetch requester details if not online (might be slow)
                    // requesterUser = await getUserByUsername(null, requesterId); 
                    console.log(`Requester ${requesterId} is not online to notify about accepted request.`);
                }
                                
                // Prepare notification data for both users (consistent with getFriendships)
                 const friendDataForRequester = {
                    friendship_id: result.id,
                    friend_id: acceptorUser.id,
                    friend_username: acceptorUser.username,
                    friend_avatar_url: acceptorUser.avatarUrl, 
                    friend_status: acceptorUser.status, 
                    friendship_status: 'accepted',
                    since: result.updated_at || new Date().toISOString() // Use updated_at if available
                };
                const friendDataForAcceptor = {
                    friendship_id: result.id,
                    friend_id: requesterId,
                    friend_username: requesterUser?.username || 'Unknown', // Handle offline case
                    friend_avatar_url: requesterUser?.avatarUrl,
                    friend_status: requesterUser?.status,
                    friendship_status: 'accepted',
                    since: result.updated_at || new Date().toISOString()
                };

                // Notify requester if online
                if (requesterSocketId) {
                    io.to(requesterSocketId).emit('friend-update', friendDataForRequester);
                    console.log(`Notified ${requesterId} that their friend request was accepted by ${acceptorId}`);
                }
                // Notify self (acceptor)
                 socket.emit('friend-update', friendDataForAcceptor);

            } else {
                 // Acceptance failed (e.g., request didn't exist or was already accepted/removed)
                 console.warn(`acceptFriendRequest returned null/false for acceptor ${acceptorId}, requester ${requesterId}.`);
                callback({ success: false, message: 'Failed to accept friend request (maybe already accepted or removed)' });
            }
        } catch (error) {
            console.error(`Error in accept-friend-request handler for acceptor ${acceptorId}, requester ${requesterId}:`, error);
            callback({ success: false, message: 'Server error accepting request' });
        }
    });

    socket.on('reject-remove-friend', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        // Validate input
         if (!data || !data.friendId || !isValidUUID(data.friendId)) {
             return callback({ success: false, message: 'Invalid friend ID provided' });
        }

        const userId = users[socket.id].id;
        const friendId = data.friendId;

        try {
            // Call Supabase client function to delete the friendship record
            const success = await rejectOrRemoveFriend(userId, friendId);
            
            if (success) {
                // Rejection/Removal successful
                callback({ success: true });
                
                // Notify the other user involved, if they are online
                 const friendSocketId = Object.keys(users).find(id => users[id] && users[id].id === friendId);
                 if (friendSocketId) {
                    // Notify the other user that the friendship/request was removed by 'userId'
                    io.to(friendSocketId).emit('friend-removed', { friendId: userId });
                    console.log(`Notified ${friendId} that they were removed/rejected by ${userId}`);
                 }
                 
                 // Also notify the user who performed the action
                 socket.emit('friend-removed', { friendId: friendId });
                 
            } else {
                // Failure likely means the friendship didn't exist or couldn't be deleted
                 console.warn(`rejectOrRemoveFriend returned false for user ${userId}, friend ${friendId}. Friendship might not exist.`);
                callback({ success: false, message: 'Failed to reject/remove friend (already removed?)' });
            }
        } catch (error) {
            console.error(`Error in reject-remove-friend handler for user ${userId}, friend ${friendId}:`, error);
            callback({ success: false, message: 'Server error rejecting/removing friend' });
        }
    });

    // TODO: Refactor existing 'get-friends' and 'add-friend' to use new system // <-- This TODO is now resolved by the changes above

    // --- End Friend Management Handlers ---
    
    // Handle channel operations
    socket.on('create-channel', async (data, callback) => {
        // Check if user is authenticated
        if (!users[socket.id] || !users[socket.id].authenticated) {
            if (callback) callback({ success: false, error: 'You must be logged in to create channels' });
            return;
        }
        
        const { name, description, isPrivate } = data;
        const userId = users[socket.id].id; // Corrected key from userId to id
        
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

    // Add migration on server start
    // Original function removed from here

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

    // Handle friend request related events
    socket.on('get-pending-requests', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        
        const userId = users[socket.id].id;
        console.log(`Getting pending friend requests for user ${users[socket.id].username} (${userId})`);
        
        try {
            // Query the friends table for pending requests where this user is the recipient
            const { data: requests, error } = await getSupabaseClient(true)
                .from('friends')
                .select(`
                    id, 
                    user_id_1,
                    status,
                    users:user_id_1(id, username)
                `)
                .eq('user_id_2', userId)
                .eq('status', 'pending');
            
            if (error) {
                console.error('Error getting pending friend requests:', error);
                return callback({ success: false, message: 'Database error' });
            }
            
            // Format the requests for the client
            const formattedRequests = requests.map(request => ({
                id: request.id,
                user_id: request.user_id_1,
                username: request.users ? request.users.username : 'Unknown User'
            }));
            
            console.log(`Found ${formattedRequests.length} pending friend requests`);
            return callback({ success: true, requests: formattedRequests });
        } catch (err) {
            console.error('Exception in get-pending-requests:', err);
            return callback({ success: false, message: 'Server error' });
        }
    });

    // Send a friend request using a friend code
    socket.on('send-friend-request-by-code', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            return callback({ success: false, message: 'Not authenticated' });
        }
        
        // Validate input data
        if (!data || !data.friendCode) {
            return callback({ success: false, message: 'Friend code is required' });
        }
        
        const senderId = users[socket.id].id;
        const friendCode = data.friendCode;
        
        try {
            // Find the user with the given friend code
            const { data: recipient, error } = await getSupabaseClient(true)
                .from('users')
                .select('id, username')
                .eq('friend_code', friendCode)
                .single();
                
            if (error || !recipient) {
                console.error('Error finding user by friend code:', error);
                return callback({ success: false, message: 'Invalid friend code' });
            }
            
            const recipientId = recipient.id;
            
            // Prevent adding self
            if (senderId === recipientId) {
                return callback({ success: false, message: 'Cannot add yourself as a friend' });
            }
            
            // Check existing friendship status first to avoid unnecessary inserts/errors
            const existingStatus = await getFriendshipStatus(senderId, recipientId);
            if (existingStatus) {
                if (existingStatus.status === 'accepted') {
                    return callback({ success: false, message: 'Already friends' });
                } else if (existingStatus.status === 'pending') {
                    return callback({ success: false, message: 'Friend request already pending' });
                }
            }
            
            // Proceed to send the request
            const result = await sendFriendRequest(senderId, recipientId);
            
            if (result) {
                // Request sent successfully
                callback({ success: true, friendship: result, recipientUsername: recipient.username });
                
                // Notify the recipient if they are currently online
                const recipientSocketId = Object.keys(users).find(id => users[id] && users[id].id === recipientId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('friend-request-received', { 
                        senderId: senderId, 
                        senderUsername: users[socket.id].username, 
                        friendshipId: result.id 
                    }); 
                    console.log(`Notified ${recipientId} about incoming friend request from ${senderId}`);
                }
            } else {
                console.error(`sendFriendRequest returned null/false between ${senderId} and ${recipientId} unexpectedly.`);
                callback({ success: false, message: 'Failed to send friend request (database error)' });
            }
        } catch (err) {
            console.error('Error in send-friend-request-by-code handler:', err);
            callback({ success: false, message: 'Server error sending request' });
        }
    });
    
    // Handle avatar updates
    socket.on('avatar-updated', (data) => {
        console.log(`User ${data.userId} updated their avatar to ${data.avatarUrl}`);
        
        // Update the user's avatar URL in memory
        for (const socketId in users) {
            if (users[socketId] && users[socketId].id === data.userId) {
                users[socketId].avatarUrl = data.avatarUrl;
            }
        }
        
        // Broadcast the avatar update to all other clients
        socket.broadcast.emit('user-avatar-updated', {
            userId: data.userId,
            avatarUrl: data.avatarUrl
        });
    });
    
    // Handle profile picture upload
    socket.on('upload-profile-picture', async (data, callback) => {
        try {
            // Check if user is authenticated
            if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
                console.error('[PROFILE_PIC] Authentication error - user not authenticated');
                return callback({ success: false, error: 'Not authenticated' });
            }
            
            // Check if files were uploaded
            if (!data.file) {
                console.error('[PROFILE_PIC] No file data received');
                return callback({ success: false, error: 'No file was uploaded.' });
            }

            // Get the uploaded file
            const uploadedFile = data.file;
            const userId = users[socket.id].id;
            const username = users[socket.id]?.username || 'unknown';

            console.log(`[PROFILE_PIC] Processing profile picture upload for user ${username} (${userId})`);
            console.log(`[PROFILE_PIC] File info - size: ${uploadedFile.size} bytes, type: ${uploadedFile.type}`);
            
            // Check file type
            const fileType = uploadedFile.type;
            if (!fileType.startsWith('image/')) {
                console.error(`[PROFILE_PIC] Invalid file type: ${fileType}`);
                return callback({ success: false, error: 'Only image files are allowed.' });
            }

            // Generate a unique filename
            const fileExtension = '.' + fileType.split('/')[1];
            const fileName = `profile-${userId}-${Date.now()}${fileExtension}`;

            // Convert base64 to buffer
            let fileBuffer;
            try {
                fileBuffer = Buffer.from(uploadedFile.data, 'base64');
                console.log(`[PROFILE_PIC] Successfully converted base64 to buffer, size: ${fileBuffer.length} bytes`);
            } catch (bufferError) {
                console.error(`[PROFILE_PIC] Error converting base64 to buffer: ${bufferError.message}`);
                return callback({ 
                    success: false, 
                    error: 'Invalid image data format.',
                    fallbackUrl: 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911'
                });
            }
            
            // Use a separate async function for the upload to avoid blocking the socket
            const handleUpload = async () => {
                try {
                    // Upload to MEGA
                    console.log(`[PROFILE_PIC] Uploading profile picture to MEGA: ${fileName}`);
                    const megaUploadResult = await storage.uploadFile(fileBuffer, fileName, 'profile-pictures');
                    
                    console.log(`[PROFILE_PIC] MEGA upload result:`, megaUploadResult);
                    
                    // Use the URL from the result, even if the upload "failed" but provided a fallback URL
                    const avatarUrl = megaUploadResult?.url || 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911';
                    
                    if (!avatarUrl) {
                        console.error('[PROFILE_PIC] No URL returned from MEGA upload');
                        return { 
                            success: false, 
                            error: 'Failed to get avatar URL from storage.',
                            fallbackUrl: 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911'
                        };
                    }
                    
                    // Update user profile in Supabase
                    console.log(`[PROFILE_PIC] Updating user profile in Supabase with avatar URL: ${avatarUrl}`);
                    try {
                        const { data: userData, error } = await getSupabaseClient(true)
                            .from('users')
                            .update({ avatar_url: avatarUrl })
                            .eq('id', userId);
                        
                        if (error) {
                            console.error('[PROFILE_PIC] Error updating user profile in Supabase:', error);
                            return { 
                                success: true, 
                                fileUrl: avatarUrl,
                                message: 'Profile picture uploaded but database update failed. Changes may not persist after logout.'
                            };
                        }
                    } catch (dbError) {
                        console.error('[PROFILE_PIC] Database error:', dbError);
                        return { 
                            success: true, 
                            fileUrl: avatarUrl,
                            message: 'Profile picture uploaded but database update failed. Changes may not persist after logout.'
                        };
                    }
                    
                    // Update user in memory
                    if (users[socket.id]) {
                        users[socket.id].avatarUrl = avatarUrl;
                        console.log(`[PROFILE_PIC] Updated user ${userId} avatar in memory: ${avatarUrl}`);
                    }
                    
                    // Return success response
                    console.log(`[PROFILE_PIC] Profile picture upload complete for user ${username}`);
                    return {
                        success: true,
                        fileUrl: avatarUrl,
                        message: 'Profile picture uploaded successfully.'
                    };
                } catch (uploadError) {
                    console.error('[PROFILE_PIC] Upload error:', uploadError);
                    return { 
                        success: false, 
                        error: 'Server error uploading profile picture: ' + uploadError.message,
                        fallbackUrl: 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911'
                    };
                }
            };
            
            // Start the upload process and immediately return to prevent timeout
            handleUpload().then(result => {
                // Only call the callback if the socket is still connected
                if (users[socket.id]) {
                    callback(result);
                } else {
                    console.log(`[PROFILE_PIC] User disconnected before upload completed, but upload was processed`);
                }
            }).catch(err => {
                console.error('[PROFILE_PIC] Unhandled error in upload process:', err);
                // Only call the callback if the socket is still connected
                if (users[socket.id]) {
                    callback({ 
                        success: false, 
                        error: 'Server error processing upload: ' + err.message,
                        fallbackUrl: 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911'
                    });
                }
            });
            
            // Immediately return a preliminary response to keep the connection alive
            callback({ 
                success: true, 
                message: 'Upload in progress, please wait...',
                inProgress: true
            });
        } catch (error) {
            console.error('[PROFILE_PIC] Unhandled error in upload handler:', error);
            callback({ 
                success: false, 
                error: 'Server error handling upload: ' + error.message,
                fallbackUrl: 'https://cdn.glitch.global/2ac452ce-4fe9-49bc-bef8-47241df17d07/default%20pic.png?v=1746110048911'
            });
        }
    });
    
    // Handle user typing events
    socket.on('user-typing', (data) => {
        // Broadcast to all clients that this user is typing
        io.emit('user-typing', {
            username: users[socket.id].username,
            typing: data.typing
        });
    });
    
    // Handle keep-alive signals from clients
    socket.on('keep-alive', (data) => {
        // Just log the keep-alive signal, no need to do anything else
        // Check if data exists and has userId property
        const username = data && data.userId ? 
            (users[socket.id]?.username || 'Unknown User') : 
            (users[socket.id]?.username || 'Unauthenticated User');
        
        console.log(`Received keep-alive signal from ${username} (${socket.id})`);
    });
    
    // Handle user status updates
    socket.on('update-status', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            if (callback) callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        // Validate status value
        const validStatuses = ['online', 'idle', 'dnd', 'invisible', 'offline'];
        if (!data.status || !validStatuses.includes(data.status)) {
            if (callback) callback({ success: false, message: 'Invalid status value' });
            return;
        }
        
        try {
            const userId = users[socket.id].id;
            const username = users[socket.id].username;
            const newStatus = data.status;
            
            console.log(`Updating status for user ${username} (${userId}) to ${newStatus}`);
            
            // Update status in database
            const { error } = await getSupabaseClient(true)
                .from('users')
                .update({ status: newStatus })
                .eq('id', userId);
                
            if (error) {
                console.error('Error updating user status in database:', error);
                if (callback) callback({ success: false, message: 'Database error' });
                return;
            }
            
            // Update status in memory
            if (!userStatus[userId]) {
                userStatus[userId] = { status: newStatus, socketId: socket.id };
            } else {
                userStatus[userId].status = newStatus;
            }
            
            // Update user object in memory
            if (users[socket.id]) {
                users[socket.id].status = newStatus;
            }
            
            // Broadcast status change to all clients
            socket.broadcast.emit('user-status-change', {
                userId: userId,
                username: username,
                status: newStatus
            });
            
            // Return success
            if (callback) callback({ success: true, message: 'Status updated successfully' });
        } catch (error) {
            console.error('Error updating user status:', error);
            if (callback) callback({ success: false, message: 'Server error' });
        }
    });
    
    // Handle avatar URL updates
    socket.on('update-avatar', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            if (callback) callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        const userId = users[socket.id].id;
        const username = users[socket.id].username;
        
        try {
            // Update the avatar URL in Supabase
            const { updateUserAvatar } = require('./supabase-client');
            const result = await updateUserAvatar(userId, data.avatarUrl);
            
            if (result.success) {
                // Update the user's avatar in memory
                if (users[socket.id]) {
                    users[socket.id].avatarUrl = data.avatarUrl;
                }
                
                // Broadcast the avatar change to all clients
                socket.broadcast.emit('user-avatar-updated', {
                    userId: userId,
                    username: username,
                    avatarUrl: data.avatarUrl
                });
                
                if (callback) callback({ success: true });
            } else {
                if (callback) callback({ success: false, error: result.error });
            }
        } catch (error) {
            console.error('Error updating avatar:', error);
            if (callback) callback({ success: false, error: 'Server error' });
        }
    });
    
    // Handle message editing
    socket.on('edit-message', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            if (callback) callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        const userId = users[socket.id].id;
        const { messageId, newContent } = data;
        
        if (!messageId || !newContent) {
            if (callback) callback({ success: false, message: 'Missing required parameters' });
            return;
        }
        
        try {
            // Edit the message in Supabase
            const { editMessage } = require('./supabase-client');
            const result = await editMessage(messageId, newContent, userId);
            
            if (result.success) {
                // Broadcast the message edit to all clients
                io.emit('message-edited', { 
                    messageId, 
                    newContent, 
                    userId,
                    username: users[socket.id].username
                });
                
                if (callback) callback({ success: true });
            } else {
                if (callback) callback({ 
                    success: false, 
                    error: result.error,
                    originalContent: result.originalContent
                });
            }
        } catch (error) {
            console.error('Error editing message:', error);
            if (callback) callback({ success: false, error: 'Server error' });
        }
    });
    
    // Handle message deletion
    socket.on('delete-message', async (data, callback) => {
        // Validate authentication
        if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
            if (callback) callback({ success: false, message: 'Not authenticated' });
            return;
        }
        
        const userId = users[socket.id].id;
        const { messageId } = data;
        
        if (!messageId) {
            if (callback) callback({ success: false, message: 'Missing message ID' });
            return;
        }
        
        try {
            // Mark the message as deleted in Supabase
            const { markMessageAsDeleted } = require('./supabase-client');
            const result = await markMessageAsDeleted(messageId, userId);
            
            if (result.success) {
                // Broadcast the message deletion to all clients
                io.emit('message-deleted', { 
                    messageId, 
                    userId,
                    username: users[socket.id].username
                });
                
                if (callback) callback({ success: true });
            } else {
                if (callback) callback({ success: false, error: result.error });
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            if (callback) callback({ success: false, error: 'Server error' });
        }
    });
});

// Profile picture upload endpoint
app.post('/api/upload-profile-picture', async (req, res) => {
    try {
        const { userId, username, imageData } = req.body;
        
        if (!userId || !username || !imageData) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        // Extract base64 data from the data URL
        const base64Data = imageData.split(',')[1];
        
        // Generate a unique filename
        const timestamp = Date.now();
        const filename = `avatar_${userId}_${timestamp}.jpg`;
        
        // Upload to Supabase storage
        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(`public/${filename}`, Buffer.from(base64Data, 'base64'), {
                contentType: 'image/jpeg',
                upsert: true
            });
            
        if (error) {
            console.error('Error uploading to Supabase:', error);
            return res.status(500).json({ success: false, message: 'Failed to upload image to storage' });
        }
        
        // Get the public URL
        const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/public/${filename}`;
        
        // Update user record in database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .update({ avatar_url: avatarUrl })
            .eq('id', userId);
            
        if (userError) {
            console.error('Error updating user record:', userError);
            return res.status(500).json({ success: false, message: 'Failed to update user record' });
        }
        
        // Broadcast avatar update to all connected users
        io.emit('user-avatar-updated', {
            userId: userId,
            avatarUrl: avatarUrl
        });
        
        return res.json({ success: true, avatarUrl: avatarUrl });
    } catch (error) {
        console.error('Error in profile picture upload:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start the server after initializing storage
initializeStorage()
    .then(() => {
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Failed to initialize storage:', err);
        process.exit(1);
    });

// Utility function to resolve username by user ID (with DB fallback)
async function resolveUsernameById(userId) {
    try {
        // First check in-memory cache
        for (const socketId in users) {
            if (users[socketId] && users[socketId].id === userId) {
                return users[socketId].username;
            }
        }
        
        // If not found in memory, query the database
        console.log(`[USERNAME_RESOLVE] User ${userId} not found in memory, querying database`);
        const { data, error } = await getSupabaseClient(true)
            .from('users')
            .select('username')
            .eq('id', userId)
            .single();
            
        if (error) {
            console.error(`[USERNAME_RESOLVE] Database error resolving username for ${userId}:`, error);
            return 'Unknown User';
        }
        
        if (data && data.username) {
            console.log(`[USERNAME_RESOLVE] Resolved username for ${userId} from database: ${data.username}`);
            return data.username;
        }
        
        return 'Unknown User';
    } catch (err) {
        console.error(`[USERNAME_RESOLVE] Error resolving username for ${userId}:`, err);
        return 'Unknown User';
    }
}
