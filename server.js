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
    try {
        const fileData = fs.readFileSync(MESSAGE_FILE);
        if (fileData.length > 0) {
            messages = JSON.parse(fileData);
            
            // Filter out any invalid messages
            messages = messages.filter(msg => {
                return msg && (msg.text || msg.message) && 
                       ((msg.text && msg.text.trim() !== '') || 
                        (msg.message && msg.message.trim() !== ''));
            });
            
            console.log(`Loaded ${messages.length} valid messages from storage`);
            
            // Backup the cleaned messages
            const backupFile = `${MESSAGE_FILE}.backup-${Date.now()}`;
            fs.writeFileSync(backupFile, JSON.stringify(messages));
            console.log(`Created backup of messages at ${backupFile}`);
            
            // Save the cleaned messages back to the original file
            fs.writeFileSync(MESSAGE_FILE, JSON.stringify(messages));
        } else {
            console.log("Message file exists but is empty");
            messages = [];
        }
    } catch (error) {
        console.error("Error loading messages:", error);
        messages = [];
        // Create a backup of the corrupted file
        const errorBackup = `${MESSAGE_FILE}.error-${Date.now()}`;
        try {
            fs.copyFileSync(MESSAGE_FILE, errorBackup);
            console.log(`Created backup of corrupted messages at ${errorBackup}`);
        } catch (backupError) {
            console.error("Error creating backup:", backupError);
        }
    }
}

// Serve static files (like index.html)
app.use(express.static(__dirname));

function updateUserList() {
    // Send the consistent active users list to all clients
    const userList = Array.from(activeUsers.keys());
    io.emit("active-users", userList);
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
        
        // Send active users list to everyone (not just the new user)
        updateUserList();
        
        // Send chat history to the new user
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
        // Enhanced validation for message data
        const hasValidMessage = data && 
                               data.message && 
                               typeof data.message === 'string' && 
                               data.message.trim() !== '' && 
                               data.username && 
                               typeof data.username === 'string';
        
        if (hasValidMessage) {
            // Save the message to the chat history with normalized structure
            const msg = {
                text: data.message.trim(), // Ensure text is trimmed
                username: data.username,
                timestamp: new Date().toISOString()
            };
            
            messages.push(msg);

            // Keep only the last 1000 messages
            if (messages.length > 1000) {
                messages.shift();
            }

            // Save the updated messages to the file safely
            try {
                // Write to temp file first
                const tempFile = `${MESSAGE_FILE}.temp`;
                fs.writeFileSync(tempFile, JSON.stringify(messages));
                
                // Then rename to overwrite the original
                fs.renameSync(tempFile, MESSAGE_FILE);
            } catch (error) {
                console.error("Error saving messages:", error);
            }

            // Broadcast the message to all connected clients with consistent format
            io.emit("chat-message", msg);
        } else {
            console.log("Rejected invalid message format or empty message:", data);
        }
    });

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
    console.log(`Server running on port ${PORT}`);
});
