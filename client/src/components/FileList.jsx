// client/components/FileList.jsx
import React, { useState, useEffect } from 'react';
// import axios from 'axios'; // No longer needed directly if using apiClient from context
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

// Helper to convert Uint8Array to Hex string (for debugging/logging)
const uint8ArrayToHex = (buffer) => {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};


const FileList = ({ files = [], wasmModule, publicParamsBuffer }) => {
  // --- Get values from AuthContext ---
  const {
    // token, // No longer needed directly
    user,
    privateKey, // Base64 encoded private key
    isLoadingKey,
    keyError,
    apiClient // Use the configured axios instance
  } = useAuth();
  // --- End AuthContext Access ---

  const [selectedFile, setSelectedFile] = useState(null);
  const [decryptionStatus, setDecryptionStatus] = useState("");
  const [decryptedContent, setDecryptedContent] = useState("");
  const [verificationResult, setVerificationResult] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);


  useEffect(() => { /* ... (optional keyError warning) ... */ }, [keyError]);


  const handleDecryptAndVerify = async (documentId, senderId, originalFileName) => {
    setIsProcessing(true);
    setSelectedFile({ id: documentId, name: originalFileName });
    setDecryptionStatus(`Preparing for ${originalFileName}...`);
    setDecryptedContent("");
    setVerificationResult("");

    // --- 1. Prerequisites Check ---
    if (isLoadingKey) { /* ... alert ... */ setIsProcessing(false); return; }
    if (keyError) { /* ... alert ... */ setIsProcessing(false); return; }
    if (!privateKey) { /* ... alert ... */ setIsProcessing(false); return; }
    if (!wasmModule || !publicParamsBuffer) { /* ... alert ... */ setIsProcessing(false); return; }
    if (!documentId || !senderId) { /* ... alert ... */ setIsProcessing(false); return; }
    // --- End Prerequisites Check ---

    // --- Wasm Memory Pointers ---
    let wasmPrivKeyPtr = null;
    let wasmCiphertextPtr = null; // Pointer for combined ciphertext
    let wasmDecPtr = null;
    let wasmDecLenPtr = null;
    let wasmSigLenPtr = null; // Pointer for output sig len
    let wasmPubParamsPtr = null;
    let wasmSenderIdPtr = null;
    let wasmMsgDataPtr = null;
    let wasmSigDataPtr = null;
    // --- End Wasm Pointers ---

    try {

      // --- 2. Decode Private Key ---
      setDecryptionStatus("Decoding private key...");
      let recipientPrivateKeyBuffer;
      try {
        recipientPrivateKeyBuffer = base64ToUint8Array(privateKey);
        console.log("Private key decoded for decryption (length):", recipientPrivateKeyBuffer.length);
      } catch (decodeError) { throw new Error(`Failed to decode stored private key: ${decodeError.message}`); }
      // --- End Key Decoding ---

      // 3. Fetch encrypted data from backend (NO uLength expected anymore)
      setDecryptionStatus(`Workspaceing ${originalFileName}...`);
      const response = await apiClient.get(`/files/download-encrypted/${documentId}`);
      // --- Get only Base64 data ---
      const { encryptedDataB64 } = response.data;
      console.log(encryptedDataB64);
      if (!encryptedDataB64) {
        throw new Error("Encrypted data not found in server response.");
      }
      // --- End Get Base64 data ---

      setDecryptionStatus("Decoding encrypted data...");
      const encryptedUint8Array = base64ToUint8Array(encryptedDataB64);
      const ciphertext_len = encryptedUint8Array.length; // Total length

      // ... inside handleDecryptAndVerify, after getting encryptedDataB64 ...
    // --- ADD LOGGING OF DECODED CIPHERTEXT ---
    try {
        // Re-encode to Base64 to compare with original, OR log hex
        const receivedCipherTextBase64 = Buffer.from(encryptedUint8Array).toString('base64');
        console.log("DEBUG FileList: RECEIVED/DECODED Ciphertext Base64 (Before Decrypt):", receivedCipherTextBase64);
    } catch (bufError) {
        // Fallback or just log hex if Buffer API isn't readily available
        console.log("DEBUG FileList: RECEIVED/DECODED Ciphertext Hex (Start):", uint8ArrayToHex(encryptedUint8Array.slice(0, 20)));
        console.log("DEBUG FileList: RECEIVED/DECODED Ciphertext Hex (End):", uint8ArrayToHex(encryptedUint8Array.slice(-20)));
        console.error("Buffer API might not be available in browser for Base64 conversion", bufError);
    }
    // --- END LOGGING ---




      // --- Remove U/V split in JS --- NO LONGER NEEDED

      // 5. Prepare data for Wasm decryption
      setDecryptionStatus("Preparing data for Wasm decryption...");
      wasmDecLenPtr = wasmModule._malloc(4); // For output plaintext len
      wasmSigLenPtr = wasmModule._malloc(4); // For output signature len
      if (!wasmDecLenPtr || !wasmSigLenPtr) throw new Error("Malloc failed for output length pointers");

      wasmPrivKeyPtr = passBufferToWasm(wasmModule, recipientPrivateKeyBuffer);
      // Pass COMBINED ciphertext to WASM
      wasmCiphertextPtr = passBufferToWasm(wasmModule, encryptedUint8Array);

      console.log(`DEBUG Verify: publicParamsBuffer type: ${typeof publicParamsBuffer}, instanceof Uint8Array: ${publicParamsBuffer instanceof Uint8Array}, length: ${publicParamsBuffer?.length}`);
      // Also maybe log first few bytes if needed:
      //console.log("DEBUG Verify: publicParamsBuffer (start):", uint8ArrayToHex(publicParamsBuffer.slice(0, 10)));

      // 6. Call Wasm Decrypt (Updated Signature)
      setDecryptionStatus("Decrypting...");
      console.log(`Calling updated wasm_decrypt_buffer...`);
      wasmDecPtr = wasmModule.ccall(
        'wasm_decrypt_buffer', 'number',
        // Args: privKeyData, privKeyLen, combinedCiphertextData, combinedCiphertextLen, outPlaintextLenPtr, outSigLenPtr
        // REMOVED uLength argument
        ['number', 'number', 'number', 'number', 'number', 'number'],
        [wasmPrivKeyPtr, recipientPrivateKeyBuffer.length, wasmCiphertextPtr, ciphertext_len, wasmDecLenPtr, wasmSigLenPtr]
      );
      if (!wasmDecPtr) throw new Error("Decryption failed: wasm_decrypt_buffer returned null.");
      const decLen = wasmModule.HEAPU32[wasmDecLenPtr / 4]; // Total length of Msg||Sig
      // --- Get actual signature length from WASM output ---
      const actualSigLen = wasmModule.HEAPU32[wasmSigLenPtr / 4];
      console.log(`Decryption successful. Plaintext (Msg||Sig) length: ${decLen}, Signature part length: ${actualSigLen}`);
      if (actualSigLen <= 0 || actualSigLen > decLen) {
        throw new Error(`Invalid Signature length returned by WASM: ${actualSigLen}`);
      }
      // --- End Get Sig Length ---
      const decryptedUint8Array = getBufferFromWasm(wasmModule, wasmDecPtr, decLen);

      // 7. Split Plaintext (Message || Signature) using actualSigLen
      // --- Remove hardcoded sigLenExpected ---
      // const sigLenExpected = 65; // NO LONGER NEEDED
      // --- Use actualSigLen ---
      const msgLen = decLen - actualSigLen;
      if (msgLen < 0) { // Add check for safety
        throw new Error(`Calculated message length is negative (${msgLen}). DecLen: ${decLen}, SigLen: ${actualSigLen}`);
      }
      const messageData = decryptedUint8Array.slice(0, msgLen);
      const signatureData = decryptedUint8Array.slice(msgLen);
      console.log(`Split plaintext: Msg len=${msgLen}, Sig len=${actualSigLen}`);
      // --- End Split ---

      // 8. Prepare data for Wasm verification
      setDecryptionStatus("Preparing data for verification...");
      wasmPubParamsPtr = passBufferToWasm(wasmModule, publicParamsBuffer);
      wasmSenderIdPtr = passBufferToWasm(wasmModule, new TextEncoder().encode(senderId + '\0'));
      wasmMsgDataPtr = passBufferToWasm(wasmModule, messageData); // Pass separated message
      wasmSigDataPtr = passBufferToWasm(wasmModule, signatureData); // Pass separated signature

      // 9. Call Wasm Verify
      setDecryptionStatus("Verifying signature...");
      console.log(`DEBUG Verify: Verifying with Sender ID: ${senderId}, Msg Len: ${messageData.length}, Sig Len: ${signatureData.length}`); // Log inputs
      const verifyResult = wasmModule.ccall(
        'wasm_verify_buffer', 'number',
        // Args: pubParamsData, pubParamsLen, signerIdStr, msgData, msgLen, sigData, sigLen
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [wasmPubParamsPtr, publicParamsBuffer.length, wasmSenderIdPtr, wasmMsgDataPtr, messageData.length, wasmSigDataPtr, signatureData.length] // Pass correct args
      );

      // 10. Display results (logic remains the same)
      if (verifyResult === 0) {
        setVerificationResult("VALID");
        console.log("Verification VALID.");
        setDecryptedContent(uint8ArrayToString(messageData));
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
      const errorMsg = error.message || 'Decryption/Verification failed!';
      setDecryptionStatus(`Error: ${errorMsg}`);
      setVerificationResult("ERROR");
    } finally {
      // 11. Cleanup Wasm Memory
      console.log("Cleaning up Wasm memory...");
      // Add wasmSigLenPtr to cleanup
      if (wasmSigLenPtr) wasmModule._free(wasmSigLenPtr);
      // Free other pointers
      if (wasmDecPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmDecPtr]);
      if (wasmPrivKeyPtr) wasmModule._free(wasmPrivKeyPtr);
      if (wasmCiphertextPtr) wasmModule._free(wasmCiphertextPtr); // Use updated name
      if (wasmDecLenPtr) wasmModule._free(wasmDecLenPtr);
      if (wasmPubParamsPtr) wasmModule._free(wasmPubParamsPtr);
      if (wasmSenderIdPtr) wasmModule._free(wasmSenderIdPtr);
      if (wasmMsgDataPtr) wasmModule._free(wasmMsgDataPtr);
      if (wasmSigDataPtr) wasmModule._free(wasmSigDataPtr);
      setIsProcessing(false);
    }
  };
  const isDecryptDisabledGlobally = isLoadingKey || !!keyError || !privateKey;

  if (!files || files.length === 0) {
    return <p className="text-gray-600">You have not received any documents yet.</p>;
  }


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
            <p className={`text-sm mb-2 font-medium ${verificationResult === 'VALID' ? 'text-green-600' : 'text-red-600'
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

