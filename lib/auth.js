import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaClient } from "@prisma/client"
import { compare } from 'bcryptjs';

const prisma = new PrismaClient()

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user) {
          throw new Error('No user found with this email');
        }

        // Check if user has a password (might be using OAuth)
        if (!user.password) {
          throw new Error('Please sign in with the provider you used to create your account');
        }

        // Verify password
        const isValid = await compare(credentials.password, user.password);
        
        if (!isValid) {
          throw new Error('Incorrect password');
        }

        // Update last seen
        await prisma.user.update({
          where: { id: user.id },
          data: { 
            last_seen: new Date(),
            status: 'online'
          }
        });

        // Return user object (without password)
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
    })
  ],
  callbacks: {
    async session({ session, token, user }) {
      if (session?.user) {
        // Add user ID to session
        session.user.id = token.sub || user?.id;
        
        // Add additional user data to session
        if (user) {
          session.user.username = user.username;
          session.user.status = user.status;
          session.user.avatar_url = user.image;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      // Add user data to JWT token
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.status = user.status;
      }
      return token;
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

export default NextAuth(authOptions)
