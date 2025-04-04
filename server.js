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

// Initialize Express app and Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment variables
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_KEY';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// Initialize
loadMessages();

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
        .or(`username.eq.${username},email.eq.${email}`);
      
      if (data && data.length > 0) {
        return callback({ 
          success: false, 
          message: 'Username or email already exists' 
        });
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      // Create user in Supabase
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ 
          username, 
          email, 
          password: hashedPassword,
          created_at: new Date(),
          user_id: uuidv4()
        }]);
      
      if (createError) {
        console.error('Error creating user:', createError);
        return callback({ 
          success: false, 
          message: 'Error creating account' 
        });
      }
      
      callback({ 
        success: true, 
        message: 'Account created successfully'
      });
      
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
      
      // Find user
      const { data, error } = await supabase
        .from('users')
        .select()
        .eq('username', username)
        .single();
      
      if (error || !data) {
        return callback({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Verify password
      const isMatch = await bcrypt.compare(password, data.password);
      
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
          userId: data.user_id
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

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Save data periodically
setInterval(saveMessages, 5 * 60 * 1000); // Every 5 minutes
