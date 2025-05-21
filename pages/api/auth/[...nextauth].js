import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials.email || !credentials.password) {
          throw new Error('Email and password are required');
        }

        try {
          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: { user_status: true }
          });

          if (!user) {
            throw new Error('No user found with this email');
          }

          // Verify password
          const isValid = await bcrypt.compare(credentials.password, user.password);
          if (!isValid) {
            throw new Error('Invalid password');
          }

          // Update user's last seen timestamp
          await prisma.userStatus.update({
            where: { user_id: user.id },
            data: { 
              status: 'online',
              last_updated: new Date()
            }
          });

          // Return user data without password
          return {
            id: user.id,
            name: user.name || user.username,
            email: user.email,
            image: user.image,
            username: user.username,
            status: 'online'
          };
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
