// Friend code methods to be added to the ChatManager class

// Load the current user's friend code
loadFriendCode() {
    const friendCodeInput = document.getElementById('your-friend-code');
    if (!friendCodeInput) return;
    
    // Check if we have the friend code in the current user object
    if (this.currentUser && this.currentUser.friend_code) {
        friendCodeInput.value = this.currentUser.friend_code;
    } else {
        // If not, fetch it from the server
        this.socket.emit('get-current-user', {}, (response) => {
            if (response.success && response.user && response.user.friend_code) {
                friendCodeInput.value = response.user.friend_code;
                
                // Update the current user object
                if (this.currentUser) {
                    this.currentUser.friend_code = response.user.friend_code;
                }
            } else {
                console.error('[CHAT_DEBUG] Failed to get friend code:', response.message);
                friendCodeInput.value = 'Not available';
            }
        });
    }
}

// Generate a new friend code
generateFriendCode() {
    this.socket.emit('generate-friend-code', {}, (response) => {
        if (response.success) {
            console.log('[CHAT_DEBUG] Generated new friend code:', response.friendCode);
            
            // Update the input field
            const friendCodeInput = document.getElementById('your-friend-code');
            if (friendCodeInput) {
                friendCodeInput.value = response.friendCode;
            }
            
            // Update the current user object
            if (this.currentUser) {
                this.currentUser.friend_code = response.friendCode;
            }
            
            this.displaySystemMessage('Your friend code has been updated');
        } else {
            console.error('[CHAT_DEBUG] Failed to generate friend code:', response.message);
            this.displaySystemMessage(`Failed to generate friend code: ${response.message}`);
        }
    });
}

// Copy friend code to clipboard
copyFriendCode() {
    const friendCodeInput = document.getElementById('your-friend-code');
    if (!friendCodeInput || !friendCodeInput.value) {
        this.displaySystemMessage('No friend code available to copy');
        return;
    }
    
    // Copy to clipboard
    friendCodeInput.select();
    document.execCommand('copy');
    
    // Show feedback
    this.displaySystemMessage('Friend code copied to clipboard');
}

// Send a friend request using a friend code
sendFriendRequestByCode() {
    const codeInput = document.getElementById('friend-code-input');
    if (!codeInput || !codeInput.value.trim()) {
        this.displaySystemMessage('Please enter a friend code');
        return;
    }
    
    const friendCode = codeInput.value.trim();
    
    console.log('[CHAT_DEBUG] Sending friend request using code:', friendCode);
    
    // Emit event to send friend request by code
    this.socket.emit('send-friend-request-by-code', { friendCode }, (response) => {
        if (response.success) {
            console.log('[CHAT_DEBUG] Friend request sent successfully');
            this.displaySystemMessage(`Friend request sent to ${response.recipientUsername}`);
            
            // Clear the input field
            codeInput.value = '';
            
            // Close the modal
            const addFriendModal = document.getElementById('add-friend-modal');
            if (addFriendModal) {
                const modal = bootstrap.Modal.getInstance(addFriendModal);
                if (modal) {
                    modal.hide();
                }
            }
        } else {
            console.error('[CHAT_DEBUG] Failed to send friend request:', response.message);
            this.displaySystemMessage(`Failed to send friend request: ${response.message}`);
        }
    });
}
