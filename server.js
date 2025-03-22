const fs = require("fs");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const MESSAGE_FILE = "messages.json";
const USERS_FILE = "users.json";
let messages = [];

// Store active users and their socket IDs
const activeUsers = new Map();
const users = {};

// Simple user database with passwords
let userDatabase = {};

// Load user database
if (fs.existsSync(USERS_FILE)) {
    userDatabase = JSON.parse(fs.readFileSync(USERS_FILE));
} else {
    // Create default admin user if no users file exists
    userDatabase = {
        "admin": "homies123"
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(userDatabase));
}

// Load messages when server starts
if (fs.existsSync(MESSAGE_FILE)) {
    messages = JSON.parse(fs.readFileSync(MESSAGE_FILE));
}

// Serve static files (like index.html)
app.use(express.static(__dirname));

function updateUserList() {
    // Use a consistent event name that matches the client
    const userList = Array.from(activeUsers.keys());
    io.emit("users-updated", userList);
}

// When a user connects, send stored messages
io.on("connection", (socket) => {
    console.log('User connected:', socket.id);
    
    // Verify user credentials
    socket.on('verify-user', (data, callback) => {
        const { username, password } = data;
        
        // Check if user exists
        if (userDatabase[username]) {
            // Verify password
            if (userDatabase[username] === password) {
                callback({ success: true });
            } else {
                callback({ success: false, message: "Incorrect password" });
            }
        } else {
            // If this is a new user, create their account
            userDatabase[username] = password;
            // Save to file
            fs.writeFileSync(USERS_FILE, JSON.stringify(userDatabase));
            callback({ success: true });
        }
    });
    
    // Handle password change requests
    socket.on('change-password', (data, callback) => {
        const { username, currentPassword, newPassword } = data;
        
        // Verify user exists
        if (!userDatabase[username]) {
            return callback({ success: false, message: "User not found" });
        }
        
        // Verify current password
        if (userDatabase[username] !== currentPassword) {
            return callback({ success: false, message: "Current password is incorrect" });
        }
        
        // Update password
        userDatabase[username] = newPassword;
        
        // Save changes to file
        fs.writeFileSync(USERS_FILE, JSON.stringify(userDatabase));
        
        console.log(`Password changed for user: ${username}`);
        callback({ success: true });
    });
    
    // Store username
    socket.on('join', (username) => {
        console.log(`User joined: ${username} with socket: ${socket.id}`);
        users[socket.id] = username;
        activeUsers.set(username, socket.id);
        
        // Notify other users
        socket.broadcast.emit('user-joined', username);
        
        // Send active users list to the new user
        socket.emit('active-users', Array.from(activeUsers.keys()));
        
        // Send chat history
        socket.emit('chat history', messages);
    });
    
    // For backward compatibility
    socket.on('set-username', (username) => {
        console.log(`Setting username: ${username} for socket: ${socket.id}`);
        users[socket.id] = username;
        activeUsers.set(username, socket.id);
        updateUserList();
    });
    
    // Listen for chat messages from the client
    socket.on("message", (data) => {
        // Validate message format
        if (data && data.message && data.username) {
            // Save the message to the chat history
            const msg = {
                text: data.message,
                username: data.username,
                timestamp: new Date().toISOString()
            };
            
            messages.push(msg);

            // Keep only the last 100 messages
            if (messages.length > 100) {
                messages.shift();
            }

            // Save the updated messages to the file
            fs.writeFileSync(MESSAGE_FILE, JSON.stringify(messages));

            // Broadcast the message to all connected clients
            io.emit("chat-message", data);
        }
    });

    // Call signaling
    socket.on('call-offer', ({offer, caller, target}) => {
        console.log(`Call offer from ${caller} to ${target}`);
        
        // Find the target socket
        const targetSocketId = activeUsers.get(target);
        
        if (targetSocketId) {
            console.log(`Found target socket: ${targetSocketId}`);
            io.to(targetSocketId).emit('call-offer', {offer, caller});
        } else {
            console.log(`Target user ${target} not found`);
            socket.emit('call-error', {
                message: `User ${target} is not available.`,
                code: 'USER_NOT_FOUND'
            });
        }
    });
    
    socket.on('call-answer', ({answer, caller}) => {
        console.log(`Call answer to ${caller}`);
        
        // Find the caller socket
        const callerSocketId = activeUsers.get(caller);
        
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-answer', {answer});
        } else {
            socket.emit('call-error', {
                message: `User ${caller} is not available anymore.`,
                code: 'USER_DISCONNECTED'
            });
        }
    });
    
    socket.on('ice-candidate', ({candidate, target}) => {
        console.log(`ICE candidate to ${target}`);
        
        // Find the target socket
        const targetSocketId = activeUsers.get(target);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {candidate});
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
    
    // Handle disconnection
    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            console.log(`User disconnected: ${username}`);
            // Remove from active users
            activeUsers.delete(username);
            delete users[socket.id];
            
            // Notify other users
            socket.broadcast.emit('user-left', username);
        }
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
