import React, { useState, useEffect } from 'react'; // Added useEffect for potential UI updates
import axios from 'axios';
import { useAuth } from '../context/AuthContext'; // Import useAuth

// --- Wasm Memory/Data Helpers (Remain the same) ---
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

// Helper to convert Uint8Array back to String (assuming UTF-8)
const uint8ArrayToString = (buffer) => {
    try {
        return new TextDecoder().decode(buffer); // Default is utf-8
    } catch (e) {
        console.error("Error decoding buffer to string:", e);
        return "Error decoding content.";
    }
};
// --- End Helpers ---


const FileList = ({ files = [], wasmModule, publicParamsBuffer }) => {
  // --- Get values from AuthContext ---
  const {
      token,                   // Still need token for API calls
      user,                    // User info (like email if needed)
      privateKey,              // The Base64 encoded private key
      isLoadingKey,            // Boolean: true if key is being fetched
      keyError,                // String: error message if key fetch failed
      apiClient                // Use the configured axios instance from context
   } = useAuth();
  // --- End AuthContext Access ---

  // --- Remove placeholder key definition ---
  // const recipientPrivateKeyBuffer = user?.privateKeyBuffer || null; // NO LONGER NEEDED

  const [selectedFile, setSelectedFile] = useState(null); // Store details of file being viewed
  const [decryptionStatus, setDecryptionStatus] = useState("");
  const [decryptedContent, setDecryptedContent] = useState("");
  const [verificationResult, setVerificationResult] = useState(""); // "VALID", "INVALID", "ERROR", ""
  const [isProcessing, setIsProcessing] = useState(false); // Tracks if *this specific file* is processing


  // Optionally: Alert user if the key failed to load initially
  useEffect(() => {
      if(keyError) {
          // Avoid alerting repeatedly, maybe only on component mount or if error changes
          console.warn("FileList: AuthContext reported an error loading the private key:", keyError);
          // You could show a persistent error message in the UI instead of an alert
          // alert(`Warning: Could not load your private key. Decryption will fail. Error: ${keyError}`);
      }
  }, [keyError]);


  const handleDecryptAndVerify = async (documentId, senderId, originalFileName) => {
    setIsProcessing(true); // Indicate this specific operation started
    setSelectedFile({ id: documentId, name: originalFileName }); // Show which file is processing
    setDecryptionStatus(`Preparing for ${originalFileName}...`);
    setDecryptedContent("");
    setVerificationResult("");

    // --- 1. Prerequisites Check (including AuthContext state) ---
    if (isLoadingKey) {
        alert("Your private key is still loading. Please wait a moment and try again.");
        setIsProcessing(false); // Reset processing state
        return;
    }
    if (keyError) {
        alert(`Cannot decrypt: There was an error loading your private key: ${keyError}`);
        setIsProcessing(false); // Reset processing state
        return;
    }
     if (!privateKey) {
         // This might happen briefly after login, or if fetch failed silently without error state
        alert("Your private key is not available. Please ensure you are logged in correctly or try refreshing.");
        setIsProcessing(false); // Reset processing state
        return;
    }
    if (!wasmModule || !publicParamsBuffer || !token) {
        alert("Error: Missing required components for decryption (Wasm module, public params, or auth token).");
        console.error("Missing prerequisites:", { wasmModule, publicParamsBuffer, token });
        setIsProcessing(false); // Reset processing state
        return;
    }
    if (!documentId || !senderId) {
        alert("Error: Missing document ID or sender ID.");
        setIsProcessing(false); // Reset processing state
        return;
    }
    // --- End Prerequisites Check ---

    // --- Wasm Memory Pointers (Initialize here) ---
    let wasmPrivKeyPtr = null;
    let wasmUPtr = null;
    let wasmVPtr = null;
    let wasmDecPtr = null;
    let wasmDecLenPtr = null;
    let wasmPubParamsPtr = null;
    let wasmSenderIdPtr = null;
    let wasmMsgDataPtr = null;
    let wasmSigDataPtr = null;
    // --- End Wasm Memory Pointers ---

    try {
        // --- 2. Decode the Base64 Private Key from Context ---
        setDecryptionStatus("Decoding private key...");
        let recipientPrivateKeyBuffer; // Define the variable here
        try {
            recipientPrivateKeyBuffer = base64ToUint8Array(privateKey);
             console.log("Private key decoded for decryption (length):", recipientPrivateKeyBuffer.length);
        } catch (decodeError) {
             throw new Error(`Failed to decode stored private key: ${decodeError.message}`);
        }
        // --- End Key Decoding ---


        // 3. Fetch encrypted data + metadata from backend
        setDecryptionStatus(`Workspaceing ${originalFileName}...`);
        // Use the apiClient from context which includes the token automatically
        const response = await apiClient.get(`/files/download-encrypted/${documentId}`);
        const { encryptedDataB64 } = response.data; // Assuming senderId is already available via props

        if (!encryptedDataB64) throw new Error("Encrypted data not found in server response.");

        setDecryptionStatus("Decoding encrypted data...");
        const encryptedUint8Array = base64ToUint8Array(encryptedDataB64);

        // 4. Determine U length & Split U||V
        // WARNING: Using hardcoded length 65 based on previous tests. Fragile!
        // Consider making this dynamic if possible (e.g., store U length in DB)
        const uLen = 65;
        console.log(`Using assumed U length: ${uLen}`);
        if (uLen <= 0 || uLen >= encryptedUint8Array.length) {
            throw new Error(`Invalid calculated U length: ${uLen}`);
        }
        const vLen = encryptedUint8Array.length - uLen;
        const uData = encryptedUint8Array.slice(0, uLen);
        const vData = encryptedUint8Array.slice(uLen);
        console.log(`Split ciphertext: U len=${uLen}, V len=${vLen}`);

        // 5. Prepare data for Wasm decryption
        setDecryptionStatus("Preparing data for Wasm decryption...");
        wasmDecLenPtr = wasmModule._malloc(4);
        if (!wasmDecLenPtr) throw new Error("Malloc failed for output length pointer");

        wasmPrivKeyPtr = passBufferToWasm(wasmModule, recipientPrivateKeyBuffer); // Use decoded key buffer
        wasmUPtr = passBufferToWasm(wasmModule, uData);
        wasmVPtr = passBufferToWasm(wasmModule, vData);

        // 6. Call Wasm Decrypt
        setDecryptionStatus("Decrypting...");
        console.log("Calling wasm_decrypt_buffer...");
        wasmDecPtr = wasmModule.ccall(
            'wasm_decrypt_buffer', 'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [wasmPrivKeyPtr, recipientPrivateKeyBuffer.length, wasmUPtr, uLen, wasmVPtr, vLen, wasmDecLenPtr]
        );
        if (!wasmDecPtr) throw new Error("Decryption failed: wasm_decrypt_buffer returned null.");
        const decLen = wasmModule.HEAPU32[wasmDecLenPtr / 4];
        console.log(`Decryption successful. Plaintext (Msg||Sig) length: ${decLen}`);
        const decryptedUint8Array = getBufferFromWasm(wasmModule, wasmDecPtr, decLen);

        // 7. Split Plaintext (Message || Signature)
        // WARNING: Using hardcoded length 65 based on previous tests. Fragile!
        const sigLenExpected = 65;
        console.log(`Using assumed signature length: ${sigLenExpected}`);
         if (sigLenExpected <= 0 || sigLenExpected > decLen) {
            throw new Error(`Invalid calculated Signature length: ${sigLenExpected}`);
        }
        const msgLen = decLen - sigLenExpected;
        const messageData = decryptedUint8Array.slice(0, msgLen);
        const signatureData = decryptedUint8Array.slice(msgLen);
        console.log(`Split plaintext: Msg len=${msgLen}, Sig len=${sigLenExpected}`);

        // 8. Prepare data for Wasm verification
        setDecryptionStatus("Preparing data for verification...");
        wasmPubParamsPtr = passBufferToWasm(wasmModule, publicParamsBuffer);
        // Ensure senderId passed to WASM is null-terminated if required by C code
        wasmSenderIdPtr = passBufferToWasm(wasmModule, new TextEncoder().encode(senderId + '\0'));
        wasmMsgDataPtr = passBufferToWasm(wasmModule, messageData);
        wasmSigDataPtr = passBufferToWasm(wasmModule, signatureData);

        // 9. Call Wasm Verify
        setDecryptionStatus("Verifying signature...");
        console.log("Calling wasm_verify_buffer...");
        const verifyResult = wasmModule.ccall(
            'wasm_verify_buffer', 'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [wasmPubParamsPtr, publicParamsBuffer.length, wasmSenderIdPtr, wasmMsgDataPtr, messageData.length, wasmSigDataPtr, signatureData.length]
        );

        // 10. Display results
        if (verifyResult === 0) {
            setVerificationResult("VALID");
            console.log("Verification VALID.");
            setDecryptedContent(uint8ArrayToString(messageData)); // Decode message
            setDecryptionStatus("Decryption and Verification Successful!");
        } else if (verifyResult === 1) {
            setVerificationResult("INVALID");
            console.warn("Verification INVALID.");
            setDecryptionStatus("Decryption successful, but signature verification FAILED!");
            setDecryptedContent("Cannot display content: Invalid Signature");
        } else {
            throw new Error(`Verification failed with error code: ${verifyResult}`);
        }

    } catch (error) {
        console.error("Decryption/Verification failed:", error);
        setDecryptionStatus(`Error: ${error.message || 'Decryption/Verification failed!'}`);
        setVerificationResult("ERROR");
    } finally {
        // 11. Cleanup Wasm Memory
        console.log("Cleaning up Wasm memory...");
        // Check each pointer before freeing
        if (wasmDecPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmDecPtr]);
        if (wasmPrivKeyPtr) wasmModule._free(wasmPrivKeyPtr);
        if (wasmUPtr) wasmModule._free(wasmUPtr);
        if (wasmVPtr) wasmModule._free(wasmVPtr);
        if (wasmDecLenPtr) wasmModule._free(wasmDecLenPtr);
        if (wasmPubParamsPtr) wasmModule._free(wasmPubParamsPtr);
        if (wasmSenderIdPtr) wasmModule._free(wasmSenderIdPtr);
        if (wasmMsgDataPtr) wasmModule._free(wasmMsgDataPtr);
        if (wasmSigDataPtr) wasmModule._free(wasmSigDataPtr);
        setIsProcessing(false); // Reset processing state for this specific file
    }
  };


  // --- Render Logic ---
  if (!files || files.length === 0) {
    return <p className="text-gray-600">You have not received any documents yet.</p>;
  }

  // Determine if the decrypt button should be generally disabled (key loading/error)
  const isDecryptDisabledGlobally = isLoadingKey || !!keyError || !privateKey;

  return (
    <div className="space-y-4">
      {/* Optional: Display global key loading/error status */}
       {isLoadingKey && <p className="text-blue-600">Loading private key...</p>}
       {keyError && <p className="text-red-600 font-semibold">Key Error: {keyError}. Decryption disabled.</p>}
       {!isLoadingKey && !privateKey && !keyError && <p className="text-orange-600">Private key not yet available.</p>}


      {/* File List Table */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filename</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sender</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Received</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {files.map((file) => (
              <tr key={file._id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{file.originalFileName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{file.senderId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(file.createdAt).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleDecryptAndVerify(file._id, file.senderId, file.originalFileName)}
                    // Disable if globally disabled OR if this specific file is processing
                    disabled={isDecryptDisabledGlobally || (isProcessing && selectedFile?.id === file._id)}
                    className={`text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed`}
                    title={isDecryptDisabledGlobally ? (keyError || "Private key not available or loading...") : ""} // Add tooltip explaining why it's disabled
                  >
                    {(isProcessing && selectedFile?.id === file._id) ? 'Processing...' : 'Decrypt & View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Decryption/Verification Results Area */}
      {selectedFile && (
        <div className="mt-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-2">Document Viewer: {selectedFile.name}</h3>
          <p className="text-sm mb-2">Status: <span className="font-medium">{decryptionStatus}</span></p>
          {verificationResult && (
             <p className={`text-sm mb-2 font-medium ${
                verificationResult === 'VALID' ? 'text-green-600' : 'text-red-600'
             }`}>
                Signature Verification: {verificationResult}
            </p>
          )}
          {decryptedContent && verificationResult === 'VALID' && (
            <div className="mt-2 p-2 border bg-white rounded">
              <h4 className="text-sm font-medium mb-1">Decrypted Content:</h4>
              {/* Display as preformatted text, handle potential non-text content appropriately later */}
              <pre className="text-xs whitespace-pre-wrap break-words">{decryptedContent}</pre>
            </div>
          )}
           {decryptedContent && verificationResult !== 'VALID' && verificationResult !== 'ERROR' && (
               <p className="text-sm text-red-600">{decryptedContent}</p> // Show error message if verification failed
           )}
        </div>
      )}
    </div>
  );
};

export default FileList;