import { Component } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to an error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    
    // You can also log the error to an error reporting service here
    // logErrorToMyService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-5 w-5" />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>
                An unexpected error occurred. Our team has been notified.
              </AlertDescription>
            </Alert>
            
            <div className="bg-card p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-bold mb-4">Error Details</h2>
              
              {process.env.NODE_ENV === 'development' && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2">Error:</h3>
                  <pre className="bg-muted p-3 rounded-md text-sm overflow-auto max-h-40">
                    {this.state.error?.toString()}
                  </pre>
                  
                  {this.state.errorInfo?.componentStack && (
                    <div className="mt-4">
                      <h3 className="text-lg font-medium mb-2">Component Stack:</h3>
                      <pre className="bg-muted p-3 rounded-md text-sm overflow-auto max-h-60">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="flex-1 sm:flex-none"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload Page
                </Button>
                
                <Link href="/" passHref>
                  <Button className="flex-1 sm:flex-none">
                    <Home className="mr-2 h-4 w-4" />
                    Go to Home
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="mt-8 text-center text-sm text-muted-foreground">
              <p>If the problem persists, please contact support.</p>
              <p className="mt-2">
                Error ID: {Math.random().toString(36).substring(2, 10).toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      );
    }


    return this.props.children;
  }
}

// Higher-order component to use the error boundary in function components
export const withErrorBoundary = (WrappedComponent) => {
  return function WithErrorBoundary(props) {
    return (
      <ErrorBoundary>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
};

export default ErrorBoundary;
