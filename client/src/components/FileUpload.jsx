import React, { useState } from 'react'; 
import { useAuth } from '../context/AuthContext'; 

// Helper function to read file as ArrayBuffer
const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// Helper function to manage Wasm memory (Browser version)
const passBufferToWasm = (Module, jsBuffer) => {
    const data = (jsBuffer instanceof Uint8Array) ? jsBuffer : new Uint8Array(jsBuffer);
    const bufferPtr = Module._malloc(data.length);
    if (!bufferPtr) throw new Error(`Wasm malloc failed for size ${data.length}`);
    Module.HEAPU8.set(data, bufferPtr);
    return bufferPtr;
};

const getBufferFromWasm = (Module, bufferPtr, bufferLen) => {
    if (!bufferPtr || bufferLen <= 0) return new Uint8Array(0);
    return Module.HEAPU8.slice(bufferPtr, bufferPtr + bufferLen);
};

// Helper to convert Base64 string to Uint8Array (Browser)
const base64ToUint8Array = (base64) => {
    try {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("Error decoding base64:", e);
        throw new Error("Failed to decode base64 data.");
    }
};

const uint8ArrayToHex = (buffer) => {
  return Array.prototype.map.call(buffer, x => ('00' + x.toString(16)).slice(-2)).join('');
};

// Receive wasmModule and publicParamsBuffer as props
const FileUpload = ({ wasmModule, publicParamsBuffer, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [recipientId, setRecipientId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Get Auth State from Context ---
  const {
      user,
      privateKey, // Base64 encoded private key of logged-in user
      isLoadingKey,
      keyError,
      apiClient // Use the configured axios instance
  } = useAuth();
  // --- End Auth State ---



  const handleFileChange = (e) => { setFile(e.target.files[0]); setStatusMessage(""); };
  const handleRecipientChange = (e) => { setRecipientId(e.target.value); };

  const handleUploadAndEncrypt = async () => {
    //Debug 
    console.log('Signing user:', user.email);
    // --- Input Checks ---
    if (!file) { setStatusMessage("Please select a file."); return; }
    if (!recipientId.trim()) { setStatusMessage("Please enter a recipient ID."); return; }
    if (!wasmModule) { setStatusMessage("Wasm module is not loaded yet."); return; }
    if (!publicParamsBuffer) { setStatusMessage("Public parameters are not loaded yet."); return; }
    // Check Key from Context
    if (isLoadingKey) { setStatusMessage("Your private key is loading, please wait."); return; }
    if (keyError) { setStatusMessage(`Error loading your private key: ${keyError}. Cannot sign/upload.`); return; }
    if (!privateKey) { setStatusMessage("Your private key is not available. Cannot sign/upload."); return; }
    // --- End Input Checks ---

    setIsProcessing(true);
    setStatusMessage("Processing file...");

    // Define WASM pointers
    let wasmPrivKeyPtr = null;
    let wasmMsgPtr = null;
    let wasmSigPtr = null;
    let wasmSigLenPtr = null;
    let wasmPubParamsPtr = null;
    let wasmRecipientIdPtr = null;
    let wasmEncPtr = null;
    let wasmEncULenPtr = null; // Still needed to *get* U length from encrypt
    let wasmEncTotalLenPtr = null;
    let privateKeyBuffer = null; // To hold the decoded key

    try {
        // --- Decode Private Key from Context ---
        setStatusMessage("Preparing signing key...");
        try {
            privateKeyBuffer = base64ToUint8Array(privateKey); // Decode Base64 key from context
             console.log("Using private key from context for signing (length):", privateKeyBuffer.length);
        } catch (decodeError) {
             throw new Error(`Failed to decode your private key: ${decodeError.message}`);
        }
        // --- End Key Decoding ---

        setStatusMessage("Reading file...");
        const messageArrayBuffer = await readFileAsArrayBuffer(file);
        const messageUint8Array = new Uint8Array(messageArrayBuffer);
        console.log(`Read file: ${file.name}, size: ${messageUint8Array.length} bytes`);

        setStatusMessage("Preparing data for Wasm...");
        // Allocate memory for pointers to store output lengths from WASM
        wasmSigLenPtr = wasmModule._malloc(4);
        wasmEncULenPtr = wasmModule._malloc(4); // Still need to get U length from encrypt...
        wasmEncTotalLenPtr = wasmModule._malloc(4); // ...and total length
        if (!wasmSigLenPtr || !wasmEncULenPtr || !wasmEncTotalLenPtr) throw new Error("Malloc failed for output length pointers");

        // Allocate memory and copy data to WASM heap
        wasmPrivKeyPtr = passBufferToWasm(wasmModule, privateKeyBuffer); // Use decoded context key
        wasmMsgPtr = passBufferToWasm(wasmModule, messageUint8Array);
        wasmPubParamsPtr = passBufferToWasm(wasmModule, publicParamsBuffer);
        const recipientIdBytes = new TextEncoder().encode(recipientId.trim() + '\0'); // Ensure null-terminated
        wasmRecipientIdPtr = passBufferToWasm(wasmModule, recipientIdBytes);

        // --- Signing ---
        setStatusMessage("Signing document...");
        console.log("Calling wasm_sign_buffer...");
        wasmSigPtr = wasmModule.ccall( 'wasm_sign_buffer', 'number', ['number', 'number', 'number', 'number', 'number'], [wasmPrivKeyPtr, privateKeyBuffer.length, wasmMsgPtr, messageUint8Array.length, wasmSigLenPtr] );
        if (!wasmSigPtr) throw new Error("Signing failed: wasm_sign_buffer returned null.");
        const sigLen = wasmModule.HEAPU32[wasmSigLenPtr / 4]; // Get signature length output
        console.log(`Signing successful. Signature length: ${sigLen}`);
        if(sigLen <= 0) throw new Error("WASM signing returned invalid length.");
        const signatureUint8Array = getBufferFromWasm(wasmModule, wasmSigPtr, sigLen);
        // console.log("Signature generated (first few bytes):", uint8ArrayToHex(signatureUint8Array.slice(0, 10))); // Optional log

        // --- Encryption ---
        setStatusMessage("Encrypting document...");
        console.log("Calling wasm_encrypt_buffer...");
        wasmEncPtr = wasmModule.ccall( 'wasm_encrypt_buffer', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'], [wasmPubParamsPtr, publicParamsBuffer.length, wasmRecipientIdPtr, wasmMsgPtr, messageUint8Array.length, wasmSigPtr, sigLen, wasmEncULenPtr, wasmEncTotalLenPtr] );
        if (!wasmEncPtr) throw new Error("Encryption failed: wasm_encrypt_buffer returned null.");
        const encULen = wasmModule.HEAPU32[wasmEncULenPtr / 4]; // Get U length output
        const encTotalLen = wasmModule.HEAPU32[wasmEncTotalLenPtr / 4]; // Get total ciphertext length output
        console.log(`Encryption successful. U Len: ${encULen}, Total Len: ${encTotalLen}`);
        if(encULen <= 0 || encTotalLen <= encULen) throw new Error("WASM encryption returned invalid lengths.");
        const encryptedUint8Array = getBufferFromWasm(wasmModule, wasmEncPtr, encTotalLen);
        // console.log("Encryption successful (first few bytes):", uint8ArrayToHex(encryptedUint8Array.slice(0, 10))); // Optional log
        // --- ADD LOGGING OF ORIGINAL CIPHERTEXT ---
    
    try {
     
      const originalCipherTextBase64 = Buffer.from(encryptedUint8Array).toString('base64');
      console.log("DEBUG FileUpload: ORIGINAL Ciphertext Base64 (Before Upload):", originalCipherTextBase64);
  } catch (bufError) {
      // Fallback or just log hex if Buffer API isn't readily available
       console.log("DEBUG FileUpload: ORIGINAL Ciphertext Hex (Start):", uint8ArrayToHex(encryptedUint8Array.slice(0, 20)));
       console.log("DEBUG FileUpload: ORIGINAL Ciphertext Hex (End):", uint8ArrayToHex(encryptedUint8Array.slice(-20)));
       console.error("Buffer API might not be available in browser for Base64 conversion", bufError);
  }
  // --- END LOGGING ---

        // --- Prepare Upload Data ---
        setStatusMessage("Preparing upload...");
        const encryptedBlob = new Blob([encryptedUint8Array], { type: 'application/octet-stream' });
        const uploadFormData = new FormData();
        uploadFormData.append("encryptedFile", encryptedBlob, `${file.name}.${recipientId.trim()}.enc`);
        uploadFormData.append("recipientId", recipientId.trim());
       // --- End Remove ---

        setStatusMessage("Uploading encrypted document...");
        console.log("Sending encrypted data to backend..."); // Removed lengths from log

        // Use the apiClient from AuthContext (already includes Authorization header via interceptor)
        const response = await apiClient.post(
            "/files/upload-encrypted", // Use relative path
            uploadFormData,
            { headers: { "Content-Type": "multipart/form-data" } } // Need to explicitly set Content-Type for FormData with axios
        );

        setStatusMessage(`Upload successful: ${response.data.message}`);
        console.log("Upload response:", response.data);

        // Clear form and notify parent on success
        setFile(null);
        const fileInput = document.getElementById('file-upload');
        if (fileInput) fileInput.value = '';
        setRecipientId("");
        if (onUploadSuccess) onUploadSuccess();

    } catch (error) {
      console.error("Processing failed:", error);
      const backendErrorMessage = error.response?.data?.message;
      setStatusMessage(`Error: ${backendErrorMessage || error.message || 'Processing failed!'}`);
    } finally {
      console.log("Cleaning up Wasm memory...");
      // --- Cleanup Wasm Memory --- (No changes needed here)
      if (wasmSigPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmSigPtr]);
      if (wasmEncPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmEncPtr]);
      if (wasmSigLenPtr) wasmModule._free(wasmSigLenPtr);
      if (wasmEncULenPtr) wasmModule._free(wasmEncULenPtr);
      if (wasmEncTotalLenPtr) wasmModule._free(wasmEncTotalLenPtr);
      if (wasmPrivKeyPtr) wasmModule._free(wasmPrivKeyPtr);
      if (wasmMsgPtr) wasmModule._free(wasmMsgPtr);
      if (wasmPubParamsPtr) wasmModule._free(wasmPubParamsPtr);
      if (wasmRecipientIdPtr) wasmModule._free(wasmRecipientIdPtr);
      // --- End Cleanup ---
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-lg font-semibold mb-4">Upload & Encrypt Document</h2>
      {/* File Input */}
      <div className="mb-4">
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-1">Select File:</label>
          <input id="file-upload" type="file" onChange={handleFileChange} className="border border-gray-300 p-2 rounded w-full" />
      </div>

      {/* Recipient Input */}
       <div className="mb-4">
          <label htmlFor="recipient-id" className="block text-sm font-medium text-gray-700 mb-1">Recipient ID (e.g., user@iiita.ac.in):</label>
          <input
            id="recipient-id"
            type="text"
            value={recipientId}
            onChange={handleRecipientChange}
            placeholder="Recipient's registered email ID"
            className="border border-gray-300 p-2 rounded w-full"
            disabled={isProcessing}
           />
      </div>

      <button
        onClick={handleUploadAndEncrypt}
        // Updated disabled logic
        disabled={isProcessing || isLoadingKey || !!keyError || !privateKey || !wasmModule || !file || !recipientId.trim()}
        className={`w-full text-white px-4 py-2 rounded ${isProcessing || isLoadingKey || !!keyError || !privateKey || !wasmModule || !file || !recipientId.trim() ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}
      >
        {isProcessing ? 'Processing...' : (isLoadingKey ? 'Loading Key...' : (!privateKey ? 'Key Unavailable' : 'Sign, Encrypt & Upload'))}
      </button>

      {statusMessage && (
          <p className={`mt-4 text-sm ${statusMessage.startsWith('Error:') ? 'text-red-600' : 'text-green-600'}`}>
              {statusMessage}
          </p>
      )}
      {keyError && !isProcessing && (
           <p className="mt-2 text-xs text-red-600">Key Loading Error: {keyError}</p>
      )}
    </div>
  );
};

export default FileUpload;