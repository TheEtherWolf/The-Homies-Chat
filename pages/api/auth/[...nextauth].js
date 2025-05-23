import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        confirmPassword: { label: "Confirm Password", type: "password" },
        action: { label: "Action", type: "text" } // 'signin' or 'signup'
      },
      async authorize(credentials, req) {
        if (!credentials) {
          throw new Error('No credentials provided');
        }

        const { username, email, password, confirmPassword, action } = credentials;

        try {
          // Handle Sign Up
          if (action === 'signup') {
            if (!username || !email || !password || !confirmPassword) {
              throw new Error('All fields are required for sign up');
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
              throw new Error('Please enter a valid email address');
            }

            // Validate username (alphanumeric, underscores, 3-20 chars)
            const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
            if (!usernameRegex.test(username)) {
              throw new Error('Username must be 3-20 characters long and can only contain letters, numbers, and underscores');
            }

            // Check if passwords match
            if (password !== confirmPassword) {
              throw new Error('Passwords do not match');
            }

            // Check password length
            if (password.length < 6) {
              throw new Error('Password must be at least 6 characters long');
            }

            // Check if user already exists
            const { data: existingUsers, error: userCheckError } = await supabase
              .from('users')
              .select('username, email')
              .or(`username.eq.${username},email.eq.${email}`);

            if (userCheckError) {
              console.error('Error checking existing user:', userCheckError);
              throw new Error('Error during sign up process');
            }

            if (existingUsers && existingUsers.length > 0) {
              const existingUser = existingUsers[0];
              if (existingUser.email === email) {
                throw new Error('Email already in use');
              }
              if (existingUser.username === username) {
                throw new Error('Username already taken');
              }
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

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
                  friend_code: Math.random().toString(36).substring(2, 10).toUpperCase()
                }
              ])
              .select();

            if (createError) {
              console.error('Error creating user:', createError);
              throw new Error('Failed to create user account');
            }

            if (!newUser || newUser.length === 0) {
              throw new Error('Failed to create user account');
            }

            const user = newUser[0];

            // Return user data
            return {
              id: user.id,
              name: user.username,
              email: user.email,
              username: user.username,
              status: 'online'
            };
          }
          
          // Handle Sign In
          else {
            if (!username || !password) {
              throw new Error('Username and password are required');
            }

            // Find user by username or email
            const { data: users, error: findError } = await supabase
              .from('users')
              .select('*')
              .or(`username.eq.${username},email.eq.${username}`);

            if (findError) {
              console.error('Error finding user:', findError);
              throw new Error('Authentication failed');
            }

            if (!users || users.length === 0) {
              throw new Error('Invalid username or password');
            }

            const user = users[0];

            // Verify password
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
              throw new Error('Invalid username or password');
            }

            // Update user's status and last seen
            const { error: updateError } = await supabase
              .from('users')
              .update({
                status: 'online',
                last_seen: new Date().toISOString()
              })
              .eq('id', user.id);
              
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

            if (updateError) {
              console.error('Error updating user status:', updateError);
              // Continue even if status update fails
            }

            // Return user data without password
            return {
              id: user.id,
              name: user.username,
              email: user.email,
              image: user.avatar_url,
              username: user.username,
              status: 'online'
            };
          }
        } catch (error) {
          console.error('Authentication error:', error);
          throw new Error(error.message || 'Authentication failed');
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      // Add user ID and username to the session
      if (session?.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.status = token.status;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);
