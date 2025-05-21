import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { io } from 'socket.io-client';

// Create the socket context
const SocketContext = createContext(null);

// Socket provider component
export function SocketProvider({ children }) {
  const { data: session, status } = useSession();
  const socketRef = useRef(null);

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    // Only initialize if we have a session and socket isn't already connected
    if (status === 'authenticated' && session?.user?.id && !socketRef.current?.connected) {
      // Disconnect existing socket if any
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      // Create new socket connection with auth token
      socketRef.current = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
        auth: {
          token: session.accessToken,
          userId: session.user.id,
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        transports: ['websocket', 'polling'],
      });

      // Connection established
      socketRef.current.on('connect', () => {
        console.log('Socket connected:', socketRef.current.id);
        
        // Join user's personal room for private messages
        socketRef.current.emit('join', `user:${session.user.id}`);
        
        // Join any other necessary rooms (e.g., groups, channels)
        // This would be expanded based on your app's requirements
      });

      // Handle connection errors
      socketRef.current.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });

      // Handle disconnection
      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        
        // Attempt to reconnect if the disconnection wasn't initiated by the client
        if (reason !== 'io client disconnect') {
          console.log('Attempting to reconnect...');
        }
      });

      // Handle reconnection attempts
      socketRef.current.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Reconnection attempt ${attemptNumber}`);
      });

      // Handle successful reconnection
      socketRef.current.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        
        // Re-join rooms after reconnection
        if (session?.user?.id) {
          socketRef.current.emit('join', `user:${session.user.id}`);
        }
      });
    }

    // Cleanup function to disconnect socket when component unmounts
    return () => {
      if (socketRef.current) {
        console.log('Cleaning up socket connection');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [status, session]);

  // Initialize socket when session is available
  useEffect(() => {
    initializeSocket();
    
    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [initializeSocket]);

  // Function to emit events
  const emit = useCallback((event, data, callback) => {
    if (socketRef.current?.connected) {
      return new Promise((resolve, reject) => {
        socketRef.current.emit(event, data, (response) => {
          if (response?.error) {
            reject(response.error);
          } else {
            resolve(response);
          }
        });
      });
    } else {
      console.warn('Socket not connected');
      return Promise.reject(new Error('Socket not connected'));
    }
  }, []);

  // Function to listen to events
  const on = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      
      // Return cleanup function
      return () => {
        if (socketRef.current) {
          socketRef.current.off(event, callback);
        }
      };
    }
  }, []);

  // Function to join a room
  const joinRoom = useCallback((roomId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join', roomId);
      return true;
    }
    return false;
  }, []);

  // Function to leave a room
  const leaveRoom = useCallback((roomId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave', roomId);
      return true;
    }
    return false;
  }, []);

  // Context value
  const value = {
    socket: socketRef.current,
    connected: socketRef.current?.connected || false,
    emit,
    on,
    joinRoom,
    leaveRoom,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

// Custom hook to use the socket context
export const useSocket = () => {
  const context = useContext(SocketContext);
  
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  
  return context;
};
