const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getSupabaseClient } = require('../supabase-client');
require('dotenv').config();

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key';

// Signup route
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        const supabase = getSupabaseClient(true);

        // Check if user already exists
        const { data: existingUsers, error: findError } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${username},email.eq.${email}`);

        if (findError) {
            console.error('Error checking for existing user:', findError);
            return res.status(500).json({ message: 'Server error during registration' });
        }

        if (existingUsers && existingUsers.length > 0) {
            const usernameExists = existingUsers.some(user => user.username === username);
            const emailExists = existingUsers.some(user => user.email === email);
            
            if (usernameExists) {
                return res.status(400).json({ message: 'Username already exists' });
            }
            
            if (emailExists) {
                return res.status(400).json({ message: 'Email already exists' });
            }
            
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user in Supabase
        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([
                {
                    username,
                    email,
                    password: hashedPassword,
                    status: 'offline',
                    last_seen: new Date().toISOString()
                }
            ])
            .select();

        if (createError) {
            console.error('Error creating user:', createError);
            return res.status(500).json({ message: 'Server error during registration' });
        }

        if (!newUser || newUser.length === 0) {
            return res.status(500).json({ message: 'Failed to create user' });
        }

        const user = newUser[0];

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id,
                username: user.username,
                email: user.email
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Set cookie
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.status(201).json({ 
            success: true,
            user: { 
                id: user.id, 
                username: user.username, 
                email: user.email 
            } 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// Signin route
router.post('/signin', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const supabase = getSupabaseClient(true);

        // Find user by username or email
        const { data: users, error: findError } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${username},email.eq.${username}`);
            
        console.log('Login attempt for:', username, 'Found users:', users?.length);
        
        // Debug password info (don't log actual passwords in production)
        if (users && users.length > 0) {
            console.log('Password from request:', password);
            console.log('Stored password hash:', users[0].password);
        }

        if (findError) {
            console.error('Error finding user:', findError);
            return res.status(500).json({ message: 'Server error during login' });
        }

        if (!users || users.length === 0) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const user = users[0];

        // Check password
        try {
            // First check if the password is stored as plaintext (for existing accounts)
            const isPlaintextMatch = password === user.password;
            console.log('Plaintext password match:', isPlaintextMatch);
            
            if (isPlaintextMatch) {
                console.log('Matched using plaintext comparison');
                // If it's a plaintext match, we should hash it for future security
                try {
                    // Hash the password for future security
                    const salt = await bcrypt.genSalt(10);
                    const hashedPassword = await bcrypt.hash(password, salt);
                    
                    // Update the user's password in Supabase
                    const { error: updateError } = await supabase
                        .from('users')
                        .update({ password: hashedPassword })
                        .eq('id', user.id);
                    
                    if (updateError) {
                        console.error('Error updating password to hashed version:', updateError);
                    } else {
                        console.log('Successfully updated password to hashed version for user:', user.username);
                    }
                } catch (hashError) {
                    console.error('Error hashing password for update:', hashError);
                }
            } else {
                // Try bcrypt comparison for hashed passwords
                const isMatch = await bcrypt.compare(password, user.password);
                console.log('Bcrypt password comparison result:', isMatch);
                
                if (!isMatch) {
                    return res.status(400).json({ message: 'Invalid credentials' });
                }
            }
        } catch (passwordError) {
            console.error('Error comparing passwords:', passwordError);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Update user status
        const { error: updateError } = await supabase
            .from('users')
            .update({
                status: 'online',
                last_seen: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('Error updating user status:', updateError);
            // Continue anyway, not critical
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id,
                username: user.username,
                email: user.email
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Set cookie
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ 
            success: true,
            user: { 
                id: user.id, 
                username: user.username, 
                email: user.email 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Session route
router.get('/session', (req, res) => {
    const token = req.cookies.auth_token;

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ 
            success: true,
            user: decoded 
        });
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid' });
    }
});

// Signout route
router.post('/signout', (req, res) => {
    res.clearCookie('auth_token');
    res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
