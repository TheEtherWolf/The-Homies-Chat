import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

/**
 * Custom SessionProvider that handles session state and authentication flows
 */
export default function SessionProvider({ children, session }) {
  const router = useRouter();

  // Handle session state changes
  useEffect(() => {
    const { data: subscription } = require('next-auth/client').useSession();
    
    // If the session becomes invalid, redirect to sign-in
    if (subscription?.error === 'RefreshAccessTokenError') {
      // Force sign out and redirect to sign-in page
      signOut({ callbackUrl: '/auth/signin?error=SessionExpired' });
    }
  }, [router]);

  return (
    <NextAuthSessionProvider 
      session={session}
      // Refresh session periodically
      refetchInterval={5 * 60} // 5 minutes
      refetchOnWindowFocus={true}
    >
      {children}
    </NextAuthSessionProvider>
  );
}

// Helper function to sign out the user
export async function signOut(options = {}) {
  const { callbackUrl = '/' } = options;
  
  try {
    // Clear the session on the server
    await fetch('/api/auth/signout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Redirect to the callback URL
    if (typeof window !== 'undefined') {
      window.location.href = callbackUrl;
    }
  } catch (error) {
    console.error('Error during sign out:', error);
    
    // If there's an error, still try to redirect
    if (typeof window !== 'undefined') {
      window.location.href = callbackUrl;
    }
  }
}

// Custom hook to use the session
export function useSession(required = false) {
  const { data: session, status } = require('next-auth/react').useSession();
  const router = useRouter();

  useEffect(() => {
    if (required && status === 'unauthenticated' && typeof window !== 'undefined') {
      const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
      router.push(`/auth/signin?callbackUrl=${callbackUrl}`);
    }
  }, [status, required, router]);

  return { session, status };
}
