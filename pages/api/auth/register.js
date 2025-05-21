import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Register a new user with email and password
 * This endpoint works with NextAuth's credentials provider
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validate input
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate username (alphanumeric with underscores, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ 
        error: 'Username must be 3-20 characters long and can only contain letters, numbers, and underscores' 
      });
    }

    // Check if user already exists (case-insensitive check)
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          { username: { equals: username, mode: 'insensitive' } }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email.toLowerCase() === email.toLowerCase() 
          ? 'Email already in use' 
          : 'Username already taken' 
      });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date();

    // Start a transaction to ensure data consistency
    const [user] = await prisma.$transaction([
      // Create user
      prisma.user.create({
        data: {
          username,
          email: email.toLowerCase(), // Store email in lowercase for consistency
          password: hashedPassword,
          name: username,
          emailVerified: now, // Mark email as verified
          status: 'offline',
          last_seen: now,
          created_at: now,
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          image: true,
          status: true,
          last_seen: true,
        }
      }),
      // Create user status
      prisma.userStatus.create({
        data: {
          user: {
            connect: { email: email.toLowerCase() }
          },
          status: 'offline',
          last_updated: now,
        }
      })
    ]);

    // Don't include sensitive data in the response
    const { password: _, ...userWithoutPassword } = user;

    return res.status(201).json({ 
      success: true,
      message: 'Registration successful! You can now sign in.',
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ 
      error: 'An error occurred during registration',
      ...(process.env.NODE_ENV === 'development' && { 
        details: error.message,
        stack: error.stack 
      })
    });
  } finally {
    await prisma.$disconnect();
  }
}
