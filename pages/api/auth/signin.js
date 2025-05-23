// API route for user login
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// JWT secret
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user by username or email
    const { data: users, error: findError } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${username},email.eq.${username}`);

    if (findError) {
      console.error('Error finding user:', findError);
      return res.status(500).json({ error: 'Authentication failed' });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = users[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update user's status and last seen
    const { error: updateError } = await supabase
      .from('users')
      .update({
        status: 'online',
        last_seen: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating user status:', updateError);
      // Continue even if status update fails
    }

    // Also update user_status table
    const { error: statusError } = await supabase
      .from('user_status')
      .upsert({
        user_id: user.id,
        status: 'online',
        last_updated: new Date().toISOString()
      });

    if (statusError) {
      console.error('Error updating user_status:', statusError);
      // Continue even if status update fails
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username,
        email: user.email
      }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    // Return user data without password
    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: 'online',
        avatar_url: user.avatar_url || null,
        friend_code: user.friend_code || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login' });
  }
}
