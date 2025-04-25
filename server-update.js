// Add this handler after the register-session handler (around line 1407)

    // Get user by username
    socket.on('get-user-by-username', async (data, callback) => {
        if (!data || !data.username) {
            return callback({ success: false, message: 'Username is required' });
        }
        
        try {
            const { data: user, error } = await getSupabaseClient(true)
                .from('users')
                .select('id, username')
                .eq('username', data.username)
                .single();
                
            if (error) {
                console.error('Error getting user by username:', error);
                return callback({ success: false, message: 'Database error' });
            }
            
            if (!user) {
                return callback({ success: false, message: 'User not found' });
            }
            
            return callback({ success: true, user });
        } catch (err) {
            console.error('Exception in get-user-by-username:', err);
            return callback({ success: false, message: 'Server error' });
        }
    });
