import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/context/auth-context';
import { useSocket } from '@/lib/context/socket-context';
import { Toaster } from '@/components/ui/toaster';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export function Layout({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { connected: isSocketConnected } = useSocket();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Check if current route is auth route
  const isAuthRoute = ['/login', '/register', '/forgot-password', '/reset-password'].includes(router.pathname);
  
  // Handle responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      const isMobileView = window.innerWidth < 1024; // lg breakpoint
      setIsMobile(isMobileView);
      
      // Close sidebar on mobile by default
      if (isMobileView) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    // Set initial value
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Toggle sidebar
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Show loading state while checking auth status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // For auth pages, just render the children
  if (isAuthRoute) {
    return (
      <>
        <Head>
          <title>The Homies Chat</title>
          <meta name="description" content="Connect with your homies" />
        </Head>
        <main className="min-h-screen">
          {children}
        </main>
        <Toaster />
      </>
    );
  }

  // For authenticated routes, show the full layout
  return (
    <>
      <Head>
        <title>The Homies Chat</title>
        <meta name="description" content="Connect with your homies" />
      </Head>
      
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} 
          fixed lg:static inset-y-0 left-0 z-30 w-64 transform bg-card border-r border-border transition-transform duration-300 ease-in-out lg:translate-x-0`}
        >
          <Sidebar onClose={() => setIsSidebarOpen(false)} />
        </aside>
        
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="bg-card border-b border-border">
            <Header onMenuClick={toggleSidebar} />
          </header>
          
          {/* Main content area */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
          
          {/* Status bar */}
          <footer className="bg-card border-t border-border p-2 text-xs text-muted-foreground flex justify-between items-center">
            <div>
              {isSocketConnected ? (
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  Connected
                </span>
              ) : (
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>
                  Reconnecting...
                </span>
              )}
            </div>
            <div>
              {user?.email}
            </div>
          </footer>
        </div>
      </div>
      
      {/* Toast notifications */}
      <Toaster />
      
      {/* Backdrop for mobile sidebar */}
      {isSidebarOpen && isMobile && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </>
  );
}
