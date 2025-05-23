// API route for session verification
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// JWT secret
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ valid: false, error: 'Invalid token' });
    }

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, email, status, avatar_url, friend_code, last_seen')
      .eq('id', decoded.userId)
      .single();

    if (userError || !user) {
      console.error('User fetch error:', userError);
      return res.status(401).json({ valid: false, error: 'User not found' });
    }

    // Session is valid
    return res.status(200).json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        avatar_url: user.avatar_url,
        friend_code: user.friend_code,
        last_seen: user.last_seen
      }
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return res.status(500).json({ valid: false, error: 'Server error during session verification' });
  }
}
