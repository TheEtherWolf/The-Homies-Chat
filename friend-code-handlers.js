// Friend code socket handlers to be added to server.js

// Generate a new friend code for the user
socket.on('generate-friend-code', async (data, callback) => {
    // Validate authentication
    if (!users[socket.id] || !users[socket.id].authenticated || !users[socket.id].id) {
        return callback({ success: false, message: 'Not authenticated' });
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
        console.error(`Error in send-friend-request-by-code handler:`, err);
        callback({ success: false, message: 'Server error sending request' });
    }
});
