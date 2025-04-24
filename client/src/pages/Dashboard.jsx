import React, { useState, useEffect } from 'react';
import axios from 'axios'; // Import axios
import Sidebar from "../components/Sidebar";
import FileUpload from "../components/FileUpload";
import FileList from '../components/FileList'; // Assuming you have this component
import { useAuth } from '../context/AuthContext'; // Import useAuth

const API_BASE_URL = "https://secure-docs-api.onrender.com"

const Dashboard = () => {
  // Existing Wasm state
  const [wasmModule, setWasmModule] = useState(null);
  const [isLoadingModule, setIsLoadingModule] = useState(true);
  const [errorLoadingModule, setErrorLoadingModule] = useState(null);
  const [pairingParamsBuffer, setPairingParamsBuffer] = useState(null);
  const [publicParamsBuffer, setPublicParamsBuffer] = useState(null);

  // New state for received files
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState(null);

  // Get auth state
  const { isAuthenticated, token } = useAuth();

  // Effect for Wasm Module loading (runs once)
  useEffect(() => {
    const loadWasmAndParams = async () => {
      // Reset state on re-run attempt (though deps array is empty)
      setIsLoadingModule(true);
      setErrorLoadingModule(null);
      setWasmModule(null);
      setPairingParamsBuffer(null);
      setPublicParamsBuffer(null);

      try {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (typeof createCryptoModule !== 'function') {
          throw new Error('Wasm factory function (createCryptoModule) not found.');
        }
        console.log('Instantiating Wasm module...');
        const Module = await createCryptoModule();
        console.log('Wasm module instantiated.');

        console.log('Fetching pairing parameters (a.param)...');
        const paramResponse = await fetch('/a.param');
        if (!paramResponse.ok) throw new Error(`Failed to fetch a.param: ${paramResponse.statusText}`);
        const paramsArrayBuffer = await paramResponse.arrayBuffer();
        const paramsUint8Array = new Uint8Array(paramsArrayBuffer);
        setPairingParamsBuffer(paramsUint8Array);
        console.log('Pairing parameters fetched.');

        console.log('Creating /a.param in Wasm virtual filesystem...');
        if (Module.FS_createDataFile) {
             Module.FS_createDataFile('/', 'a.param', paramsUint8Array, true, false);
             console.log('/a.param created in MEMFS.');
        } else {
             console.warn('Module.FS_createDataFile not available.');
        }

        console.log('Fetching public parameters (public_params.dat)...');
        const pubParamResponse = await fetch('/public_params.dat');
        if (!pubParamResponse.ok) throw new Error(`Failed to fetch public_params.dat: ${pubParamResponse.statusText}`);
        const pubParamsArrayBuffer = await pubParamResponse.arrayBuffer();
        setPublicParamsBuffer(new Uint8Array(pubParamsArrayBuffer));
        console.log('Public parameters fetched.');

        setWasmModule(Module); // Set module only after all params are ready

      } catch (error) {
        console.error('Error loading/initializing Wasm module or parameters:', error);
        setErrorLoadingModule(error.message || 'Failed to load crypto module.');
      } finally {
        setIsLoadingModule(false);
      }
    };
    loadWasmAndParams();
  }, []); // Empty dependency array: runs only once on mount

  // Effect for fetching received files (runs when authenticated status changes)
  useEffect(() => {
    const fetchReceivedFiles = async () => {
      if (!isAuthenticated || !token) {
        setReceivedFiles([]); // Clear files if not authenticated
        return; // Don't fetch if not logged in
      }

      setIsLoadingFiles(true);
      setFilesError(null);
      console.log("Fetching received files...");

      try {
        const config = {
          headers: {
            'Authorization': `Bearer ${token}` // Send token
          }
        };
        // Adjust endpoint URL if needed
        const response = await axios.get(`${API_BASE_URL}/api/files/received`, config);
        setReceivedFiles(response.data || []); // Ensure it's an array
        console.log("Received files fetched:", response.data);
      } catch (error) {
        console.error("Error fetching received files:", error.response ? error.response.data : error.message);
        setFilesError(error.response?.data?.message || "Failed to fetch received files.");
        setReceivedFiles([]); // Clear files on error
      } finally {
        setIsLoadingFiles(false);
      }
    };

    fetchReceivedFiles(); // Call fetch function

  }, [isAuthenticated, token]); // Re-run effect if auth status or token changes


  // --- Render Logic ---
  // Handle module loading/error first
  if (isLoadingModule) {
    return <div>Loading Crypto Module...</div>;
  }
  if (errorLoadingModule) {
    return <div>Error loading crypto module: {errorLoadingModule}</div>;
  }
  if (!wasmModule || !publicParamsBuffer) {
     return <div>Crypto module or parameters not available.</div>;
  }

  // Main dashboard layout
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-3xl font-semibold mb-6">Dashboard</h1>

        {/* File Upload Component */}
        <FileUpload
            wasmModule={wasmModule}
            publicParamsBuffer={publicParamsBuffer}
        />

        {/* Received Documents Section */}
        <div className="mt-8"> {/* Increased margin */}
          <h2 className="text-xl font-semibold mb-4">Received Documents</h2>
          {isLoadingFiles ? (
            <p className="text-gray-600">Loading received documents...</p>
          ) : filesError ? (
            <p className="text-red-600">Error: {filesError}</p>
          ) : (
            // Pass files to FileList component
            // FileList needs to be implemented to display the files
            // and potentially handle decryption triggering
            <FileList
                files={receivedFiles}
                wasmModule={wasmModule} // Pass module for decryption actions
                publicParamsBuffer={publicParamsBuffer} // Pass params for verification
                // You'll also need to pass the recipient's private key here securely
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
