import React, { useState, useEffect } from 'react'; // Import React hooks
import Sidebar from "../components/Sidebar";
import FileUpload from "../components/FileUpload";

const Dashboard = () => {
  // State for Wasm module and loading status
  const [wasmModule, setWasmModule] = useState(null);
  const [isLoadingModule, setIsLoadingModule] = useState(true);
  const [errorLoadingModule, setErrorLoadingModule] = useState(null);
  const [pairingParamsBuffer, setPairingParamsBuffer] = useState(null); // Store Uint8Array for a.param
  const [publicParamsBuffer, setPublicParamsBuffer] = useState(null); // Store Uint8Array for public_params.dat

  // Effect to load Wasm module and parameters on component mount
  useEffect(() => {
    const loadWasmAndParams = async () => {
      try {
        setIsLoadingModule(true);
        setErrorLoadingModule(null);

        // --- Wait for the factory function ---
        // A slight delay might be needed for the script in index.html to load/execute
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield execution briefly

        if (typeof createCryptoModule !== 'function') {
          throw new Error('Wasm factory function (createCryptoModule) not found. Check script tag in index.html.');
        }

        // --- Instantiate Module ---
        console.log('Instantiating Wasm module...');
        const Module = await createCryptoModule();
        console.log('Wasm module instantiated.');

        // --- Fetch a.param ---
        console.log('Fetching pairing parameters (a.param)...');
        const paramResponse = await fetch('/a.param'); // Fetches from public/a.param
        if (!paramResponse.ok) {
            throw new Error(`Failed to fetch a.param: ${paramResponse.statusText}`);
        }
        const paramsArrayBuffer = await paramResponse.arrayBuffer();
        const paramsUint8Array = new Uint8Array(paramsArrayBuffer);
        setPairingParamsBuffer(paramsUint8Array); // Store if needed elsewhere, but primarily for MEMFS
        console.log('Pairing parameters fetched.');

        // --- Prepare MEMFS ---
        console.log('Creating /a.param in Wasm virtual filesystem...');
        if (Module.FS_createDataFile) {
             Module.FS_createDataFile('/', 'a.param', paramsUint8Array, true, false);
             console.log('/a.param created in MEMFS.');
        } else {
             console.warn('Module.FS_createDataFile not available. Cannot preload a.param.');
        }

        // --- Fetch public_params.dat ---
         console.log('Fetching public parameters (public_params.dat)...');
        const pubParamResponse = await fetch('/public_params.dat'); // Fetches from public/public_params.dat
        if (!pubParamResponse.ok) {
            throw new Error(`Failed to fetch public_params.dat: ${pubParamResponse.statusText}`);
        }
        const pubParamsArrayBuffer = await pubParamResponse.arrayBuffer();
        setPublicParamsBuffer(new Uint8Array(pubParamsArrayBuffer)); // Store for passing to Wasm functions
        console.log('Public parameters fetched.');


        // --- Store Module ---
        setWasmModule(Module);

      } catch (error) {
        console.error('Error loading/initializing Wasm module or parameters:', error);
        setErrorLoadingModule(error.message || 'Failed to load crypto module.');
      } finally {
        setIsLoadingModule(false);
      }
    };

    loadWasmAndParams();

  }, []); // Runs once on mount

  // --- Render Logic ---
  if (isLoadingModule) {
    return <div>Loading Crypto Module...</div>;
  }
  if (errorLoadingModule) {
    return <div>Error loading crypto module: {errorLoadingModule}</div>;
  }
  if (!wasmModule || !publicParamsBuffer) {
     // Added check for publicParamsBuffer as it's needed by FileUpload
     return <div>Crypto module or parameters not available.</div>;
  }

  // --- Pass Module and Params to FileUpload ---
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-3xl font-semibold mb-6">Dashboard</h1>
        {/* Pass down the loaded module and public params */}
        <FileUpload
            wasmModule={wasmModule}
            publicParamsBuffer={publicParamsBuffer}
        />
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Recent Documents</h2>
          {/* TODO: Replace with actual FileList component */}
          <p className="text-gray-600">No documents uploaded yet.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;