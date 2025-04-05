// Main server file for Homies Chat App - Glitch optimized
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const emailService = require('./email-service');

// Initialize Express app and Socket.io
const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // In production, replace with your actual domain
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_KEY';

// Initialize Supabase client
let supabase;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    }
  });
  console.log('Supabase client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  // Fallback with mock data for testing if Supabase is not available
  const mockUsers = [];
  supabase = {
    from: (table) => ({
      select: () => ({
        or: (query) => ({
          data: mockUsers.filter(u => u.username === username || u.email === email),
          error: null
        }),
        eq: (field, value) => ({
          single: () => ({
            data: mockUsers.find(u => u[field] === value),
            error: null
          }),
          maybeSingle: () => ({
            data: mockUsers.find(u => u[field] === value),
            error: null
          })
        })
      }),
      insert: (records) => {
        const newUser = records[0];
        mockUsers.push(newUser);
        return { data: newUser, error: null };
      }
    })
  };
}

// Message storage
let messages = [];
const MESSAGE_FILE = "messages.json";

// User tracking
const onlineUsers = new Map(); // username -> socket.id
const userSessions = new Map(); // socket.id -> username

// Load messages from storage
function loadMessages() {
  try {
    if (fs.existsSync(MESSAGE_FILE)) {
      const data = fs.readFileSync(MESSAGE_FILE, 'utf8');
      messages = JSON.parse(data);
      console.log(`Loaded ${messages.length} messages from storage`);
    }
  } catch (error) {
    console.error('Error loading messages:', error);
    messages = [];
  }
}

// Save messages to storage
function saveMessages() {
  try {
    fs.writeFileSync(MESSAGE_FILE, JSON.stringify(messages), 'utf8');
    console.log('Messages saved to file');
    
    // Backup for safety
    fs.writeFileSync(`${MESSAGE_FILE}.backup-${Date.now()}`, JSON.stringify(messages), 'utf8');
  } catch (error) {
    console.error('Error saving messages:', error);
  }
}

// MEGA integration placeholder
// In a real implementation, you would use the megajs library
const megaStorage = {
  uploadFile: async (file, content) => {
    try {
      console.log(`[MEGA] Would upload file: ${file}`);
      return true;
    } catch (error) {
      console.error('[MEGA] Upload error:', error);
      return false;
    }
  },
  downloadFile: async (file) => {
    try {
      console.log(`[MEGA] Would download file: ${file}`);
      return null;
    } catch (error) {
      console.error('[MEGA] Download error:', error);
      return null;
    }
  }
};

// User status update function
function updateUserList() {
  const userStatusList = Array.from(onlineUsers.keys()).map(username => ({
    username,
    status: 'online',
    lastSeen: Date.now()
  }));
  
  io.emit('user-status-update', userStatusList);
}

// Initialize services
loadMessages();

// Check if email service is configured
if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.log('Warning: Email credentials not configured. Email features will be disabled.');
  process.env.EMAIL_HOST = 'smtp.protonmail.ch';
  process.env.EMAIL_PORT = '587';
  process.env.EMAIL_USER = 'TheHomiesChatBot@proton.me';
  process.env.EMAIL_PASS = 'your_app_specific_password';
  process.env.EMAIL_FROM = 'TheHomiesChatBot@proton.me';
  process.env.EMAIL_SECURE = 'true';
}

emailService.initializeEmailService();

// Socket.io connections
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Register/signup handler
  socket.on('register', async (userData, callback) => {
    try {
      const { username, email, password } = userData;
      
      // Validate inputs
      if (!username || !email || !password) {
        return callback({ 
          success: false, 
          message: 'Please provide username, email, and password' 
        });
      }
      
      // Check if username or email already exists
      const { data, error } = await supabase
        .from('users')
        .select()
        .or(`username.eq."${username}",email.eq."${email}"`);
      
      if (data && data.length > 0) {
        return callback({ 
          success: false, 
          message: 'Username or email already exists' 
        });
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      // Generate verification token
      const verificationToken = uuidv4();
      const tokenExpires = new Date();
      tokenExpires.setDate(tokenExpires.getDate() + 1); // 24 hours from now
      
      // Create user in Supabase
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ 
          id: uuidv4(), // Explicitly provide id
          username, 
          email: email.toLowerCase(),
          password: hashedPassword, // Changed back to password for compatibility
          created_at: new Date().toISOString(),
          verified: false,
          verification_token: verificationToken,
          token_expires: tokenExpires.toISOString()
        }]);
      
      if (createError) {
        console.error('Error creating user:', createError);
        return callback({ 
          success: false, 
          message: 'Error creating account' 
        });
      }

      // Only send verification email if email service is configured
      if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        try {
          await emailService.sendVerificationEmail(
            email.toLowerCase(),
            username,
            verificationToken
          );
          
          callback({ 
            success: true, 
            message: 'Account created successfully! Please check your email to verify your account.'
          });
        } catch (emailError) {
          console.error('Error sending verification email:', emailError);
          
          // Return success even if email fails, but log the error
          callback({ 
            success: true, 
            message: 'Account created successfully! Email verification could not be sent.'
          });
        }
      } else {
        callback({ 
          success: true, 
          message: 'Account created successfully! (Email verification disabled)'
        });
      }
      
    } catch (error) {
      console.error('Registration error:', error);
      callback({ 
        success: false, 
        message: 'Server error during registration' 
      });
    }
  });
  
  // Login handler
  socket.on('login', async (userData, callback) => {
    try {
      const { username, password } = userData;
      
      // Allow login with either username or email
      let isEmail = username.includes('@');
      const { data, error } = await supabase
        .from('users')
        .select()
        .or(isEmail ? `email.eq."${username.toLowerCase()}"` : `username.eq."${username}"`)
        .maybeSingle();
      
      if (error || !data) {
        return callback({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Verify password
      const isMatch = await bcrypt.compare(password, data.password_hash);
      
      if (!isMatch) {
        return callback({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
      
      // Store user session
      userSessions.set(socket.id, username);
      onlineUsers.set(username, socket.id);
      
      // Broadcast user joined
      socket.broadcast.emit('user-joined', username);
      updateUserList();
      
      callback({ 
        success: true, 
        user: {
          username: data.username,
          email: data.email,
          userId: data.id // Changed from user_id to id to match Supabase schema
        }
      });
      
    } catch (error) {
      console.error('Login error:', error);
      callback({ 
        success: false, 
        message: 'Server error during login' 
      });
    }
  });
  
  // Message history request
  socket.on('get-messages', () => {
    socket.emit('message-history', messages);
  });
  
  // New message
  socket.on('send-message', (messageData) => {
    const username = userSessions.get(socket.id);
    
    if (!username) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    
    const newMessage = {
      id: uuidv4(),
      sender: username,
      content: messageData.content,
      timestamp: Date.now(),
      encrypted: messageData.encrypted || false
    };
    
    messages.push(newMessage);
    saveMessages();
    
    io.emit('new-message', newMessage);
  });
  
  // Typing indicator
  socket.on('typing', (data) => {
    const username = userSessions.get(socket.id);
    if (username) {
      socket.broadcast.emit('user-typing', { username });
    }
  });
  
  // Stop typing indicator
  socket.on('stop-typing', () => {
    const username = userSessions.get(socket.id);
    if (username) {
      socket.broadcast.emit('user-stopped-typing', { username });
    }
  });
  
  // Status update
  socket.on('status-update', (status) => {
    const username = userSessions.get(socket.id);
    if (username) {
      socket.broadcast.emit('user-status-change', { username, status });
    }
  });

  // Video call signaling
  socket.on('call-offer', (data) => {
    const { target, offer } = data;
    const caller = userSessions.get(socket.id);
    
    if (!caller) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    
    const targetSocketId = onlineUsers.get(target);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-offer', {
        offer,
        caller
      });
    } else {
      socket.emit('call-error', { message: 'User is offline' });
    }
  });
  
  socket.on('call-answer', (data) => {
    const { target, answer } = data;
    const answerer = userSessions.get(socket.id);
    
    if (!answerer) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    
    const targetSocketId = onlineUsers.get(target);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-answer', {
        answer,
        answerer
      });
    }
  });
  
  socket.on('ice-candidate', (data) => {
    const { target, candidate } = data;
    const sender = userSessions.get(socket.id);
    
    if (!sender) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    
    const targetSocketId = onlineUsers.get(target);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        candidate,
        sender
      });
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    const username = userSessions.get(socket.id);
    
    if (username) {
      console.log(`User disconnected: ${username}`);
      userSessions.delete(socket.id);
      onlineUsers.delete(username);
      
      io.emit('user-left', username);
      updateUserList();
    }
  });
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Email verification endpoint
app.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).send('Verification token is required');
    }
    
    // Find user with this token
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('verification_token', token)
      .single();
    
    if (error || !data) {
      return res.status(400).send('Invalid verification token');
    }
    
    // Check if token is expired
    const tokenExpires = new Date(data.token_expires);
    if (tokenExpires < new Date()) {
      return res.status(400).send('Verification token has expired');
    }
    
    // Mark user as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        verified: true,
        verification_token: null,
        token_expires: null
      })
      .eq('id', data.id); // Changed from user_id to id to match Supabase schema
    
    if (updateError) {
      console.error('Error updating user verification status:', updateError);
      return res.status(500).send('Error verifying email');
    }
    
    // Redirect to success page
    res.send(`
      <html>
      <head>
        <title>Email Verified - The Homies App</title>
        <style>
          body {
            font-family: 'Whitney', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #202225;
            color: #FFFFFF;
            text-align: center;
            padding-top: 50px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #2F3136;
            padding: 30px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
          }
          h1 {
            color: #5865F2;
          }
          .success-icon {
            font-size: 64px;
            color: #3BA55C;
            margin-bottom: 20px;
          }
          .btn {
            display: inline-block;
            background-color: #5865F2;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 20px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✓</div>
          <h1>Email Verified Successfully!</h1>
          <p>Your email has been verified. You can now log in to The Homies App.</p>
          <a href="/" class="btn">Go to Login</a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).send('Server error during verification');
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Save data periodically
setInterval(saveMessages, 5 * 60 * 1000); // Every 5 minutes
