// client/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode'; // Ensure installed: npm install jwt-decode
import axios from 'axios'; // Ensure installed: npm install axios

// Create a base axios instance (optional but recommended)
// Configure with your API base URL
const apiClient = axios.create({
    // baseURL: 'http://192.168.146.77:5006/api', // Adjust if your backend runs elsewhere
    baseURL: 'http://192.168.69.77:5006/api', // Adjust if your backend runs elsewhere
});

// Interceptor to add JWT token to requests
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token && !config.headers['Authorization']) { // Add header only if not already present
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Create Context
const AuthContext = createContext(null);

// Create Provider Component
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem('token')); // Initialize token from localStorage lazily
    const [user, setUser] = useState(null);
    const [privateKey, setPrivateKey] = useState(null); // State for the private key (Base64)
    const [isLoadingKey, setIsLoadingKey] = useState(false); // State to track key loading
    const [keyError, setKeyError] = useState(null); // State for key fetching errors

    // --- Define logout function FIRST ---
    const logout = useCallback(() => { // Wrap logout in useCallback
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setPrivateKey(null); // <-- Clear private key on logout
        setIsLoadingKey(false); // Reset loading state
        setKeyError(null); // Reset errors
        console.log("AuthContext: User logged out");
    // No dependencies needed if it only modifies state setters from useState
    }, []);

    // --- Define fetchPrivateKey function SECOND (depends on logout) ---
    const fetchPrivateKey = useCallback(async (currentToken) => {
        if (!currentToken) {
            console.log("fetchPrivateKey: No token available.");
            return; // No token, cannot fetch key
        }
        console.log("AuthContext: Attempting to fetch private key...");
        setIsLoadingKey(true);
        setKeyError(null); // Reset previous errors
        setPrivateKey(null); // Clear previous key before fetching new one

        try {
            // Use the pre-configured apiClient which includes the token via interceptor
            // *** Path confirmed correct ***
            const response = await apiClient.get('/users/my-private-key', {
                 // Optionally pass the token explicitly if interceptor issues suspected
                 // headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            if (response.status === 200) {
                const base64PrivateKey = response.data;
                setPrivateKey(base64PrivateKey);
                console.log('AuthContext: Private key fetched successfully.');
            } else {
                 // Should be caught by catch block, but good practice
                console.warn('AuthContext: Received non-200 status fetching key:', response.status);
                setKeyError('Failed to retrieve key. Unexpected status.');
            }
        } catch (error) {
            console.error('AuthContext: Failed to fetch private key:', error.response ? `${error.response.status} ${JSON.stringify(error.response.data)}` : error.message);
            let message = 'An error occurred while fetching your key.';
            if (error.response) {
                switch (error.response.status) {
                    case 401: // Unauthorized (bad token)
                    case 403: // Forbidden
                        message = 'Authentication failed fetching key. Please log in again.';
                        logout(); // Call logout now that it's defined above
                        break;
                    case 404: // User or Key not found OR Incorrect Path
                        message = `Key retrieval failed (${error.response.status}). Resource not found or path incorrect.`;
                        break;
                    default:
                        message = error.response.data?.message || message;
                }
            }
            setKeyError(message);
            setPrivateKey(null); // Ensure key is null on error
        } finally {
            setIsLoadingKey(false);
        }
    // Pass logout as dependency because it's used in catch block
    }, [logout]); // Dependency array includes logout


    // --- Effect to handle initial load from localStorage (uses fetchPrivateKey) ---
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            try {
                const decodedUser = jwtDecode(storedToken);
                const currentTime = Date.now() / 1000;

                if (decodedUser.exp < currentTime) {
                    console.log("AuthContext InitialLoad: Token expired.");
                    // Use logout function for cleanup
                    logout();
                } else {
                    console.log("AuthContext InitialLoad: Valid token found. Setting user.");
                    setToken(storedToken);
                    setUser(decodedUser.user);
                    // Fetch the key since we have a valid token and user
                    fetchPrivateKey(storedToken); // Call fetchPrivateKey on initial load
                }
            } catch (error) {
                console.error("AuthContext InitialLoad: Error decoding token", error);
                // Use logout function for cleanup
                logout();
            }
        }
        // No else needed, initial state is null
    // fetchPrivateKey and logout are memoized, safe to include
    }, [fetchPrivateKey, logout]); // Rerun if fetchPrivateKey/logout references change

    // --- Login function - now also triggers key fetching (uses fetchPrivateKey, logout) ---
    const login = useCallback(async (newToken) => { // Make login async
        try {
            localStorage.setItem('token', newToken);
            const decodedUser = jwtDecode(newToken);
            setToken(newToken);
            setUser(decodedUser.user);
            console.log("AuthContext: User logged in", decodedUser.user);
            // --- Fetch private key immediately after login ---
            await fetchPrivateKey(newToken);
            // --- Key fetching initiated ---
        } catch (error) {
            console.error("AuthContext: Error processing token on login", error);
            // Use the logout function to clear everything consistently
            logout();
        }
    // Include fetchPrivateKey and logout dependencies for useCallback
    }, [fetchPrivateKey, logout]);


    // Value provided to consuming components
    const value = {
        token,
        user,
        isAuthenticated: !!token,
        privateKey,        // <-- Provide the key
        isLoadingKey,      // <-- Provide loading status for the key
        keyError,          // <-- Provide key fetching error status
        login,             // Now async due to key fetching
        logout,
        fetchPrivateKey,   // Expose refetch function if needed manually
        apiClient          // <-- Expose the configured axios instance
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the AuthContext
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === null) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};