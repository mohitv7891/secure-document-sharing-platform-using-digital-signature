/* === File: client/src/components/FileUpload.jsx === */
// *** UPDATED TO USE BROWSER APIs INSTEAD OF NODE BUFFER ***
import React, { useState, useEffect } from 'react';
import axios from "axios";

// Helper function to read file as ArrayBuffer
const readFileAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target.result); // event.target.result is the ArrayBuffer
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsArrayBuffer(file);
  });
};

// Helper function to manage Wasm memory (Browser version)
const passBufferToWasm = (Module, jsBuffer) => {
    // Ensure input is Uint8Array (ArrayBuffer needs conversion)
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

// Helper to convert Uint8Array to Hex String (Browser)
const uint8ArrayToHex = (buffer) => {
    return Array.prototype.map.call(buffer, x => ('00' + x.toString(16)).slice(-2)).join('');
};


// Receive wasmModule and publicParamsBuffer as props
const FileUpload = ({ wasmModule, publicParamsBuffer }) => {
  const [file, setFile] = useState(null);
  const [recipientId, setRecipientId] = useState(""); // State for recipient ID
  const [statusMessage, setStatusMessage] = useState(""); // For user feedback
  const [isProcessing, setIsProcessing] = useState(false); // Loading state

  // --- State for TEST private key ---
  const [privateKeyBuffer, setPrivateKeyBuffer] = useState(null);
  const [isLoadingKey, setIsLoadingKey] = useState(true);

  // --- !!! INSECURE KEY LOADING FOR TESTING ONLY !!! ---
  useEffect(() => {
      const loadTestKey = async () => {
          setIsLoadingKey(true);
          console.warn("FileUpload: Loading private key insecurely for testing!");
          try {
              const keyResponse = await fetch('/mohit@iiita_private_key.dat');
              if (!keyResponse.ok) {
                  throw new Error(`Failed to fetch test private key: ${keyResponse.statusText}`);
              }
              const keyArrayBuffer = await keyResponse.arrayBuffer();
              setPrivateKeyBuffer(new Uint8Array(keyArrayBuffer));
              console.log("FileUpload: Test private key loaded.");
          } catch (error) {
              console.error("FileUpload: Failed to load test private key:", error);
              setStatusMessage("Error: Could not load test private key.");
          } finally {
              setIsLoadingKey(false);
          }
      };
      loadTestKey();
  }, []);
  // --- !!! END INSECURE KEY LOADING !!! ---


  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setStatusMessage("");
  };

  const handleRecipientChange = (e) => {
    setRecipientId(e.target.value);
  };

  const handleUploadAndEncrypt = async () => {
    if (!file) { setStatusMessage("Please select a file."); return; }
    if (!recipientId.trim()) { setStatusMessage("Please enter a recipient ID."); return; }
    if (!wasmModule) { setStatusMessage("Wasm module is not loaded yet."); return; }
    if (isLoadingKey || !privateKeyBuffer) { setStatusMessage("Test private key is not loaded yet."); return; }
    if (!publicParamsBuffer) { setStatusMessage("Public parameters are not loaded yet."); return; }

    setIsProcessing(true);
    setStatusMessage("Processing file...");

    let wasmPrivKeyPtr = null;
    let wasmMsgPtr = null;
    let wasmSigPtr = null;
    let wasmSigLenPtr = null;
    let wasmPubParamsPtr = null;
    let wasmRecipientIdPtr = null;
    let wasmEncPtr = null;
    let wasmEncULenPtr = null;
    let wasmEncTotalLenPtr = null;

    try {
        setStatusMessage("Reading file...");
        const messageArrayBuffer = await readFileAsArrayBuffer(file);
        const messageUint8Array = new Uint8Array(messageArrayBuffer);
        console.log(`Read file: ${file.name}, size: ${messageUint8Array.length} bytes`);

        setStatusMessage("Preparing data for Wasm...");
        wasmSigLenPtr = wasmModule._malloc(4);
        wasmEncULenPtr = wasmModule._malloc(4);
        wasmEncTotalLenPtr = wasmModule._malloc(4);
        if (!wasmSigLenPtr || !wasmEncULenPtr || !wasmEncTotalLenPtr) throw new Error("Malloc failed for output length pointers");

        wasmPrivKeyPtr = passBufferToWasm(wasmModule, privateKeyBuffer);
        wasmMsgPtr = passBufferToWasm(wasmModule, messageUint8Array);
        wasmPubParamsPtr = passBufferToWasm(wasmModule, publicParamsBuffer);

        // *** Use TextEncoder instead of Buffer for recipient ID ***
        const recipientIdBytes = new TextEncoder().encode(recipientId + '\0'); // Add null terminator
        wasmRecipientIdPtr = passBufferToWasm(wasmModule, recipientIdBytes);
        // *********************************************************

        setStatusMessage("Signing document...");
        console.log("Calling wasm_sign_buffer...");
        wasmSigPtr = wasmModule.ccall(
            'wasm_sign_buffer', 'number',
            ['number', 'number', 'number', 'number', 'number'],
            [wasmPrivKeyPtr, privateKeyBuffer.length, wasmMsgPtr, messageUint8Array.length, wasmSigLenPtr]
        );
        if (!wasmSigPtr) throw new Error("Signing failed: wasm_sign_buffer returned null.");
        const sigLen = wasmModule.HEAPU32[wasmSigLenPtr / 4];
        console.log(`Signing successful. Signature length: ${sigLen}`);
        const signatureUint8Array = getBufferFromWasm(wasmModule, wasmSigPtr, sigLen);
        // *** Use new hex helper for logging ***
        console.log("Signature generated (first few bytes):", uint8ArrayToHex(signatureUint8Array.slice(0, 10)));
        // **************************************

        setStatusMessage("Encrypting document...");
        console.log("Calling wasm_encrypt_buffer...");
        wasmEncPtr = wasmModule.ccall(
            'wasm_encrypt_buffer', 'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [wasmPubParamsPtr, publicParamsBuffer.length, wasmRecipientIdPtr, wasmMsgPtr, messageUint8Array.length, wasmSigPtr, sigLen, wasmEncULenPtr, wasmEncTotalLenPtr]
        );
         if (!wasmEncPtr) throw new Error("Encryption failed: wasm_encrypt_buffer returned null.");
        const encULen = wasmModule.HEAPU32[wasmEncULenPtr / 4];
        const encTotalLen = wasmModule.HEAPU32[wasmEncTotalLenPtr / 4];
        console.log(`Encryption successful. U Len: ${encULen}, Total Len: ${encTotalLen}`);
        const encryptedUint8Array = getBufferFromWasm(wasmModule, wasmEncPtr, encTotalLen);
        // *** Use new hex helper for logging ***
        console.log("Encryption successful (first few bytes):", uint8ArrayToHex(encryptedUint8Array.slice(0, 10)));
        // **************************************

        setStatusMessage("Preparing upload...");
        const encryptedBlob = new Blob([encryptedUint8Array], { type: 'application/octet-stream' });
        const uploadFormData = new FormData();
        uploadFormData.append("encryptedFile", encryptedBlob, `${file.name}.${recipientId}.enc`);
        uploadFormData.append("recipientId", recipientId);
        // uploadFormData.append("senderId", "mohit@iiita"); // Get from auth context

        setStatusMessage("Uploading encrypted document...");
        console.log("Sending encrypted data to backend...");
        const response = await axios.post(
            "http://localhost:5006/api/files/upload-encrypted", // Use the new endpoint
            uploadFormData,
            { headers: { "Content-Type": "multipart/form-data" } }
        );

        setStatusMessage(`Upload successful: ${response.data.message}`);
        console.log("Upload response:", response.data);
        setFile(null);
        setRecipientId("");

    } catch (error) {
      console.error("Processing failed:", error);
      setStatusMessage(`Error: ${error.message || 'Processing failed!'}`);
    } finally {
      console.log("Cleaning up Wasm memory...");
      if (wasmSigPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmSigPtr]);
      if (wasmEncPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmEncPtr]);
      if (wasmSigLenPtr) wasmModule._free(wasmSigLenPtr);
      if (wasmEncULenPtr) wasmModule._free(wasmEncULenPtr);
      if (wasmEncTotalLenPtr) wasmModule._free(wasmEncTotalLenPtr);
      if (wasmPrivKeyPtr) wasmModule._free(wasmPrivKeyPtr);
      if (wasmMsgPtr) wasmModule._free(wasmMsgPtr);
      if (wasmPubParamsPtr) wasmModule._free(wasmPubParamsPtr);
      if (wasmRecipientIdPtr) wasmModule._free(wasmRecipientIdPtr);
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
          <label htmlFor="recipient-id" className="block text-sm font-medium text-gray-700 mb-1">Recipient ID (e.g., user@example.com):</label>
          <input
            id="recipient-id"
            type="text"
            value={recipientId}
            onChange={handleRecipientChange}
            placeholder="Recipient's registered ID"
            className="border border-gray-300 p-2 rounded w-full"
            disabled={isProcessing}
           />
      </div>

      {/* Upload Button */}
      <button
        onClick={handleUploadAndEncrypt}
        disabled={isProcessing || isLoadingKey || !wasmModule}
        className={`w-full text-white px-4 py-2 rounded ${isProcessing || isLoadingKey || !wasmModule ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}
      >
        {isProcessing ? 'Processing...' : (isLoadingKey ? 'Loading Key...' : 'Sign, Encrypt & Upload')}
      </button>

      {/* Status Message */}
      {statusMessage && (
          <p className={`mt-4 text-sm ${statusMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {statusMessage}
          </p>
      )}
       {/* Security Warning */}
       {!isLoadingKey && privateKeyBuffer && (
           <p className="mt-2 text-xs text-orange-600">Warning: Using test private key loaded insecurely.</p>
       )}
    </div>
  );
};

export default FileUpload;

