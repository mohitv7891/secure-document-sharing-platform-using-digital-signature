import React, { createContext, useState, useContext, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode'; // Install: npm install jwt-decode

// Create Context
const AuthContext = createContext(null);

// Create Provider Component
export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token')); // Initialize from localStorage
  const [user, setUser] = useState(null); // Store decoded user info (optional)

  // Effect to decode token when it changes or on initial load
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        const decodedUser = jwtDecode(storedToken); // Decode token
         // Optional: Check token expiration
         const currentTime = Date.now() / 1000;
         if (decodedUser.exp < currentTime) {
             console.log("Token expired, logging out.");
             logout(); // Token is expired
         } else {
             setToken(storedToken);
             setUser(decodedUser.user); // Assuming payload is { user: { id: ... } }
             console.log("AuthContext: User set from stored token", decodedUser.user);
         }
      } else {
          // Ensure state is clear if no token
          setToken(null);
          setUser(null);
      }
    } catch (error) {
      console.error("AuthContext: Error decoding token", error);
      // Invalid token found, clear it
      logout();
    }
  }, []); // Run only on initial mount

  // Login function
  const login = (newToken) => {
    try {
        localStorage.setItem('token', newToken);
        const decodedUser = jwtDecode(newToken);
        setToken(newToken);
        setUser(decodedUser.user); // Set user from decoded token
        console.log("AuthContext: User logged in", decodedUser.user);
    } catch (error) {
        console.error("AuthContext: Error processing token on login", error);
        logout(); // Clear state if token is invalid
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    console.log("AuthContext: User logged out");
    // Optionally redirect to login page using navigate (if used here)
    // navigate('/login'); // Might be better to handle redirect in the component calling logout
  };

  // Value provided to consuming components
  const value = {
    token,
    user, // Provide user info
    isAuthenticated: !!token, // Boolean flag for easy checking
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the AuthContext
export const useAuth = () => {
  return useContext(AuthContext);
};