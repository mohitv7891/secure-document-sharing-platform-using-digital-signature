import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext'; // To get token and potentially user key

// --- Wasm Memory/Data Helpers (Copied from FileUpload for consistency) ---
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
  const { token, user } = useAuth(); // Get token for API calls and user info
  // *** IMPORTANT: Assume useAuth() provides the key buffer ***
  // Replace this with how you actually access the securely stored key buffer
  const recipientPrivateKeyBuffer = user?.privateKeyBuffer || null; // EXAMPLE ACCESS - NEEDS IMPLEMENTATION

  const [selectedFile, setSelectedFile] = useState(null); // Store details of file being viewed
  const [decryptionStatus, setDecryptionStatus] = useState("");
  const [decryptedContent, setDecryptedContent] = useState("");
  const [verificationResult, setVerificationResult] = useState(""); // "VALID", "INVALID", "ERROR", ""
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDecryptAndVerify = async (documentId, senderId, originalFileName) => {
    if (!wasmModule || !recipientPrivateKeyBuffer || !publicParamsBuffer || !token) {
        alert("Error: Missing required components for decryption (Wasm module, private key, public params, or auth token).");
        console.error("Missing prerequisites:", { wasmModule, recipientPrivateKeyBuffer, publicParamsBuffer, token });
        return;
    }
    if (!documentId || !senderId) {
        alert("Error: Missing document ID or sender ID.");
        return;
    }

    setIsProcessing(true);
    setSelectedFile({ id: documentId, name: originalFileName }); // Show which file is processing
    setDecryptionStatus(`Fetching ${originalFileName}...`);
    setDecryptedContent("");
    setVerificationResult("");

    // --- Wasm Memory Pointers ---
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
        // 1. Fetch encrypted data + metadata from backend
        const config = { headers: { 'Authorization': `Bearer ${token}` } };
        const response = await axios.get(`http://localhost:5006/api/files/download-encrypted/${documentId}`, config);
        const { encryptedDataB64 } = response.data; // Assuming senderId is already available

        if (!encryptedDataB64) throw new Error("Encrypted data not found in server response.");

        setDecryptionStatus("Decoding data...");
        const encryptedUint8Array = base64ToUint8Array(encryptedDataB64);

        // 2. Determine U length & Split U||V
        // WARNING: Using hardcoded length 65 based on previous tests. Fragile!
        // Replace this if U length is stored in DB or returned by backend.
        const uLen = 65;
        console.log(`Using assumed U length: ${uLen}`);
        if (uLen <= 0 || uLen >= encryptedUint8Array.length) {
            throw new Error(`Invalid calculated U length: ${uLen}`);
        }
        const vLen = encryptedUint8Array.length - uLen;
        const uData = encryptedUint8Array.slice(0, uLen);
        const vData = encryptedUint8Array.slice(uLen);
        console.log(`Split ciphertext: U len=${uLen}, V len=${vLen}`);

        // 3. Prepare data for Wasm decryption
        setDecryptionStatus("Preparing data for Wasm...");
        wasmDecLenPtr = wasmModule._malloc(4);
        if (!wasmDecLenPtr) throw new Error("Malloc failed for output length pointer");

        wasmPrivKeyPtr = passBufferToWasm(wasmModule, recipientPrivateKeyBuffer);
        wasmUPtr = passBufferToWasm(wasmModule, uData);
        wasmVPtr = passBufferToWasm(wasmModule, vData);

        // 4. Call Wasm Decrypt
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

        // 5. Split Plaintext (Message || Signature)
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

        // 6. Prepare data for Wasm verification
        setDecryptionStatus("Preparing data for verification...");
        wasmPubParamsPtr = passBufferToWasm(wasmModule, publicParamsBuffer);
        wasmSenderIdPtr = passBufferToWasm(wasmModule, new TextEncoder().encode(senderId + '\0'));
        wasmMsgDataPtr = passBufferToWasm(wasmModule, messageData);
        wasmSigDataPtr = passBufferToWasm(wasmModule, signatureData);

        // 7. Call Wasm Verify
        setDecryptionStatus("Verifying signature...");
        console.log("Calling wasm_verify_buffer...");
        const verifyResult = wasmModule.ccall(
            'wasm_verify_buffer', 'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [wasmPubParamsPtr, publicParamsBuffer.length, wasmSenderIdPtr, wasmMsgDataPtr, messageData.length, wasmSigDataPtr, signatureData.length]
        );

        // 8. Display results
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
        // 9. Cleanup Wasm Memory
        console.log("Cleaning up Wasm memory...");
        if (wasmDecPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmDecPtr]);
        if (wasmPrivKeyPtr) wasmModule._free(wasmPrivKeyPtr);
        if (wasmUPtr) wasmModule._free(wasmUPtr);
        if (wasmVPtr) wasmModule._free(wasmVPtr);
        if (wasmDecLenPtr) wasmModule._free(wasmDecLenPtr);
        if (wasmPubParamsPtr) wasmModule._free(wasmPubParamsPtr);
        if (wasmSenderIdPtr) wasmModule._free(wasmSenderIdPtr);
        if (wasmMsgDataPtr) wasmModule._free(wasmMsgDataPtr);
        if (wasmSigDataPtr) wasmModule._free(wasmSigDataPtr);
        setIsProcessing(false);
    }
  };


  // --- Render Logic ---
  if (!files || files.length === 0) {
    return 
    (
    <p className="text-gray-600">You have not received any documents yet.</p>
  );}

  return (
    <div className="space-y-4">
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
                    disabled={isProcessing && selectedFile?.id === file._id} // Disable button for the file being processed
                    className={`text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed`}
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

