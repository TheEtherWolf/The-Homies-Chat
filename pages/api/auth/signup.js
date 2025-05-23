// API route for user registration
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validate input
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Validate username (alphanumeric, underscores, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ 
        error: 'Username must be 3-20 characters long and can only contain letters, numbers, and underscores' 
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const { data: existingUsers, error: userCheckError } = await supabase
      .from('users')
      .select('username, email')
      .or(`username.eq.${username},email.eq.${email}`);

    if (userCheckError) {
      console.error('Error checking existing user:', userCheckError);
      return res.status(500).json({ error: 'Error during sign up process' });
    }

    if (existingUsers && existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate a unique friend code
    const friendCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Create user in Supabase
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([
        {
          username,
          email,
          password: hashedPassword,
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          verified: false,
          status: 'online',
          friend_code: friendCode
        }
      ])
      .select();

    if (createError) {
      console.error('Error creating user:', createError);
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    if (!newUser || newUser.length === 0) {
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    const user = newUser[0];

    // Create user status entry
    const { error: statusError } = await supabase
      .from('user_status')
      .insert([
        {
          user_id: user.id,
          status: 'online',
          last_updated: new Date().toISOString()
        }
      ]);

    if (statusError) {
      console.error('Error creating user status:', statusError);
      // Continue even if status creation fails
    }

    // Return user data without password
    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: 'online'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Server error during registration' });
  }
}
