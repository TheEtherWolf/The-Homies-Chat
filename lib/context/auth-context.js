import { createContext, useContext, useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import { api } from '@/lib/api';

// Create the auth context
export const AuthContext = createContext({
  user: null,
  status: 'loading',
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  updateUser: () => {},
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,
});

// Auth provider component
export function AuthProvider({ children }) {
  const { data: session, status } = useSession();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Update user when session changes
  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (status === 'authenticated' && session?.user) {
          // You can fetch additional user data here if needed
          setUser({
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            username: session.user.username,
            image: session.user.image,
            role: session.user.role || 'user',
            status: session.user.status || 'offline',
          });
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [session, status]);

  // Handle user sign in
  const handleSignIn = async (credentials, options = {}) => {
    try {
      setIsLoading(true);
      const result = await signIn('credentials', {
        ...credentials,
        redirect: false,
        callbackUrl: options.redirectTo || '/',
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      if (result?.url) {
        router.push(result.url);
      }

      return { success: true };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Handle user sign up
  const handleSignUp = async (userData) => {
    try {
      setIsLoading(true);
      const response = await api.register(userData);
      
      // Automatically sign in after successful registration
      if (response.user) {
        await handleSignIn({
          email: userData.email,
          password: userData.password,
        });
      }

      return response;
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Handle user sign out
  const handleSignOut = async (options = {}) => {
    try {
      setIsLoading(true);
      await signOut({ redirect: false });
      setUser(null);
      
      if (options.redirectTo) {
        router.push(options.redirectTo);
      }
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Update user data
  const updateUser = (updates) => {
    setUser(prev => ({
      ...prev,
      ...updates,
    }));
  };

  // Context value
  const value = {
    user,
    status,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    updateUser,
    isAuthenticated: status === 'authenticated',
    isAdmin: user?.role === 'admin',
    isLoading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

// Higher-order component for protecting routes
export const withAuth = (Component) => {
  const WrappedComponent = (props) => {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return <div>Loading...</div>; // Or a loading spinner
    }

    if (!isAuthenticated) {
      return null; // Or a redirect component
    }

    return <Component {...props} />;
  };

  // Set a display name for the wrapped component
  WrappedComponent.displayName = `withAuth(${Component.displayName || Component.name || 'Component'})`;
  
  return WrappedComponent;
};

// Higher-order component for role-based access control
export const withRole = (roles = []) => (Component) => {
  const WithRole = (props) => {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && (!user || !roles.includes(user.role))) {
        router.push('/unauthorized');
      }
    }, [user, isLoading, router]);

    if (isLoading || !user || !roles.includes(user.role)) {
      return <div>Loading...</div>; // Or a loading/unauthorized message
    }

    return <Component {...props} />;
  };

  // Set a display name for the wrapped component
  WithRole.displayName = `withRole(${Component.displayName || Component.name || 'Component'})`;
  
  return WithRole;
};
