// client/components/FileList.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; // Import useAuth

// --- Wasm Memory/Data Helpers ---
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

const base64ToUint8Array = (base64) => {
    try {
        // Add checks for null/undefined/non-string input
        if (base64 === null || typeof base64 === 'undefined') throw new Error("Input is null or undefined.");
        if (typeof base64 !== 'string') throw new Error(`Input must be a string, got ${typeof base64}`);

        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("Error decoding base64:", e);
        // Re-throw original error
        throw e;
    }
};

const uint8ArrayToString = (buffer) => {
  try {
    return new TextDecoder().decode(buffer); // Default is utf-8
  } catch (e) {
    console.error("Error decoding buffer to string:", e);
    // Return a placeholder or indication of binary for the preview
    return "[Binary data - Use Download button]";
  }
};

const uint8ArrayToHex = (buffer) => {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
};
// --- End Helpers ---

// --- NEW HELPER: Extract Base Filename ---
const getBaseFilename = (encryptedFilename) => {
    if (!encryptedFilename) return "downloaded_file";
    // Remove .enc extension first
    let name = encryptedFilename.endsWith('.enc')
               ? encryptedFilename.slice(0, -4)
               : encryptedFilename;
    // Try to remove recipient ID pattern (.email@domain) before the (now removed) .enc
    // This regex looks for a dot followed by something with '@' up to the end
    const emailPattern = /\.[^.]+@[^.]+(\.[^.]+)*$/;
    name = name.replace(emailPattern, '');
    // Fallback if pattern fails somehow
    return name || "decrypted_file";
};
// --- END NEW HELPER ---


const FileList = ({ files = [], wasmModule, publicParamsBuffer }) => {
  const {
    user,
    privateKey,
    isLoadingKey,
    keyError,
    apiClient
  } = useAuth();

  const [selectedFile, setSelectedFile] = useState(null);
  const [decryptionStatus, setDecryptionStatus] = useState("");
  const [decryptedContent, setDecryptedContent] = useState(""); // For text preview
  const [decryptedBuffer, setDecryptedBuffer] = useState(null); // <-- Store raw buffer
  const [decryptedFilename, setDecryptedFilename] = useState(""); // <-- Store base filename
  const [verificationResult, setVerificationResult] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);


  useEffect(() => {
      if(keyError) {
          console.warn("FileList: AuthContext reported an error loading the private key:", keyError);
      }
  }, [keyError]);


  const handleDecryptAndVerify = async (documentId, senderId, originalFileName) => {
    setIsProcessing(true);
    setSelectedFile({ id: documentId, name: originalFileName });
    setDecryptionStatus(`Preparing for ${originalFileName}...`);
    setDecryptedContent("");
    setVerificationResult("");
    setDecryptedBuffer(null); // Clear previous buffer
    setDecryptedFilename(""); // Clear previous filename

    // --- 1. Prerequisites Check --- (Keep these)
    if (isLoadingKey) { alert("Your private key is still loading..."); setIsProcessing(false); return; }
    if (keyError) { alert(`Key Error: ${keyError}`); setIsProcessing(false); return; }
    if (!privateKey) { alert("Private key not available."); setIsProcessing(false); return; }
    if (!wasmModule || !publicParamsBuffer) { alert("Wasm/Params not ready."); setIsProcessing(false); return; }
    if (!documentId || !senderId) { alert("Missing document/sender ID."); setIsProcessing(false); return; }
    // --- End Prerequisites Check ---

    // --- Wasm Memory Pointers --- (Keep these)
    let wasmPrivKeyPtr = null, wasmCiphertextPtr = null, wasmDecPtr = null;
    let wasmDecLenPtr = null, wasmSigLenPtr = null, wasmPubParamsPtr = null;
    let wasmSenderIdPtr = null, wasmMsgDataPtr = null, wasmSigDataPtr = null;
    // --- End Wasm Pointers ---

    try {
        // --- 2. Decode Private Key --- (Keep as is)
        setDecryptionStatus("Decoding private key...");
        let recipientPrivateKeyBuffer = base64ToUint8Array(privateKey);
        console.log("Private key decoded for decryption (length):", recipientPrivateKeyBuffer.length);

        // 3. Fetch encrypted data (Backend provides only encryptedDataB64)
        setDecryptionStatus(`Workspaceing ${originalFileName}...`);
        const response = await apiClient.get(`/files/download-encrypted/${documentId}`);
        const { encryptedDataB64 } = response.data; // Expecting only this
        if (!encryptedDataB64) {
            throw new Error("Encrypted data not found in server response.");
        }

        setDecryptionStatus("Decoding encrypted data...");
        const encryptedUint8Array = base64ToUint8Array(encryptedDataB64);
        const ciphertext_len = encryptedUint8Array.length;

        // Log received/decoded ciphertext hex for comparison
        console.log("DEBUG FileList: RECEIVED/DECODED Ciphertext Hex (Start):", uint8ArrayToHex(encryptedUint8Array.slice(0, 20)));
        console.log("DEBUG FileList: RECEIVED/DECODED Ciphertext Hex (End):", uint8ArrayToHex(encryptedUint8Array.slice(-20)));

        // --- REMOVED U/V split in JS --- (Keep removed)

        // 5. Prepare data for Wasm decryption
        setDecryptionStatus("Preparing data for Wasm decryption...");
        wasmDecLenPtr = wasmModule._malloc(4); // For output plaintext len
        wasmSigLenPtr = wasmModule._malloc(4); // For output signature len
        if (!wasmDecLenPtr || !wasmSigLenPtr) throw new Error("Malloc failed for output length pointers");

        wasmPrivKeyPtr = passBufferToWasm(wasmModule, recipientPrivateKeyBuffer);
        wasmCiphertextPtr = passBufferToWasm(wasmModule, encryptedUint8Array); // Pass combined ciphertext

        console.log(`DEBUG Verify: publicParamsBuffer length: ${publicParamsBuffer?.length}`);

        // 6. Call Wasm Decrypt (Signature requires NO uLength input)
        setDecryptionStatus("Decrypting...");
        console.log(`Calling updated wasm_decrypt_buffer...`);
        wasmDecPtr = wasmModule.ccall(
            'wasm_decrypt_buffer', 'number',
            ['number', 'number', 'number', 'number', 'number', 'number'], // Corrected arg types
            [wasmPrivKeyPtr, recipientPrivateKeyBuffer.length, wasmCiphertextPtr, ciphertext_len, wasmDecLenPtr, wasmSigLenPtr] // Corrected args
        );
        if (!wasmDecPtr) throw new Error("Decryption failed: wasm_decrypt_buffer returned null.");
        const decLen = wasmModule.HEAPU32[wasmDecLenPtr / 4];
        const actualSigLen = wasmModule.HEAPU32[wasmSigLenPtr / 4];
        console.log(`Decryption successful. Plaintext (Msg||Sig) length: ${decLen}, Signature part length: ${actualSigLen}`);
        if (actualSigLen <= 0 || actualSigLen > decLen) {
            throw new Error(`Invalid Signature length returned by WASM: ${actualSigLen}`);
        }
        const decryptedUint8Array = getBufferFromWasm(wasmModule, wasmDecPtr, decLen);

        // 7. Split Plaintext using actualSigLen (Keep as is)
        const msgLen = decLen - actualSigLen;
        if (msgLen < 0) { throw new Error(`Calculated message length negative.`); }
        const messageData = decryptedUint8Array.slice(0, msgLen); // Raw message bytes
        const signatureData = decryptedUint8Array.slice(msgLen);
        console.log(`Split plaintext: Msg len=${msgLen}, Sig len=${actualSigLen}`);

        // 8. Prepare data for Wasm verification (Keep as is)
        setDecryptionStatus("Preparing data for verification...");
        wasmPubParamsPtr = passBufferToWasm(wasmModule, publicParamsBuffer);
        wasmSenderIdPtr = passBufferToWasm(wasmModule, new TextEncoder().encode(senderId + '\0'));
        wasmMsgDataPtr = passBufferToWasm(wasmModule, messageData);
        wasmSigDataPtr = passBufferToWasm(wasmModule, signatureData);

        // 9. Call Wasm Verify (Keep as is)
        setDecryptionStatus("Verifying signature...");
        console.log(`DEBUG Verify: Verifying with Sender ID: ${senderId}, Msg Len: ${messageData.length}, Sig Len: ${signatureData.length}`);
        const verifyResult = wasmModule.ccall(
          'wasm_verify_buffer', 'number',
          // Args: pubParamsData, pubParamsLen, signerIdStr, msgData, msgLen, sigData, sigLen
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [wasmPubParamsPtr, publicParamsBuffer.length, wasmSenderIdPtr, wasmMsgDataPtr, messageData.length, wasmSigDataPtr, signatureData.length] // Pass correct args
        );
        // 10. Display results (Correct Logic - Use this from now on)
        if (verifyResult === 0) { // Check for 0 (VALID)
            setVerificationResult("VALID");
            console.log("Verification VALID.");
            // --- Store raw buffer and filename, try text decode ---
            setDecryptedBuffer(messageData); // Store the Uint8Array
            const baseFilename = getBaseFilename(originalFileName);
            setDecryptedFilename(baseFilename);
            setDecryptedContent(uint8ArrayToString(messageData)); // Attempt text decode for preview
            // --- End store ---
            setDecryptionStatus("Decryption and Verification Successful!");
        } else if (verifyResult === 1) { // Check for 1 (INVALID)
            setVerificationResult("INVALID");
            console.warn("Verification INVALID.");
            setDecryptionStatus("Decryption successful, but signature verification FAILED!");
            setDecryptedContent("Cannot display content: Invalid Signature");
            // Clear buffer/filename if verification fails
            setDecryptedBuffer(null);
            setDecryptedFilename("");
        } else { // Handle -1 or other unexpected codes as errors
             console.error(`Verification function returned error code: ${verifyResult}`);
             setVerificationResult("ERROR");
             setDecryptionStatus(`Verification failed with error code: ${verifyResult}`);
             setDecryptedBuffer(null);
             setDecryptedFilename("");
        }

    } catch (error) {
        console.error("Decryption/Verification failed:", error);
        const errorMsg = error.message || 'Decryption/Verification failed!';
        setDecryptionStatus(`Error: ${errorMsg}`);
        setVerificationResult("ERROR");
        setDecryptedBuffer(null); // Clear buffer/filename on error
        setDecryptedFilename("");
    } finally {
        // 11. Cleanup Wasm Memory (Keep as is, ensure all ptrs freed)
        console.log("Cleaning up Wasm memory...");
        if (wasmSigLenPtr) wasmModule._free(wasmSigLenPtr);
        if (wasmDecPtr) wasmModule.ccall('wasm_free_buffer', null, ['number'], [wasmDecPtr]);
        if (wasmPrivKeyPtr) wasmModule._free(wasmPrivKeyPtr);
        if (wasmCiphertextPtr) wasmModule._free(wasmCiphertextPtr);
        if (wasmDecLenPtr) wasmModule._free(wasmDecLenPtr);
        if (wasmPubParamsPtr) wasmModule._free(wasmPubParamsPtr);
        if (wasmSenderIdPtr) wasmModule._free(wasmSenderIdPtr);
        if (wasmMsgDataPtr) wasmModule._free(wasmMsgDataPtr);
        if (wasmSigDataPtr) wasmModule._free(wasmSigDataPtr);
        setIsProcessing(false);
    }
  };

  // --- Download Handler (Add this function) ---
  const handleDownloadDecrypted = () => {
      if (!decryptedBuffer || !decryptedFilename) {
          console.error("Download clicked but decrypted data/filename not available.");
          alert("Decrypted data is not ready for download."); // User feedback
          return;
      }
      try {
          const blob = new Blob([decryptedBuffer], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = decryptedFilename; // Use the extracted filename
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log(`Download initiated for: ${decryptedFilename}`);
      } catch (error) {
          console.error("Error creating download link:", error);
          alert("Failed to initiate download.");
      }
  };
  // --- End Download Handler ---

  // --- Render Logic ---
  const isDecryptDisabledGlobally = isLoadingKey || !!keyError || !privateKey;

  if (!files || files.length === 0) {
    return <p className="text-gray-600">You have not received any documents yet.</p>;
  }

  return (
    <div className="space-y-4">
       {/* Optional key status display */}
       {isLoadingKey && <p className="text-blue-600">Loading private key...</p>}
       {keyError && <p className="text-red-600 font-semibold">Key Error: {keyError}. Decryption disabled.</p>}
       {!isLoadingKey && !privateKey && !keyError && <p className="text-orange-600">Private key not yet available.</p>}

       {/* File List Table (Sender/Date should be displayed here) */}
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
                        {/* --- MODIFIED TD --- */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" title={file.originalFileName}>
                            {getBaseFilename(file.originalFileName)}
                        </td>
                        {/* --- END MODIFIED TD --- */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{file.senderId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(file.createdAt).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                               <button
                                   onClick={() => handleDecryptAndVerify(file._id, file.senderId, file.originalFileName)}
                                   disabled={isDecryptDisabledGlobally || (isProcessing && selectedFile?.id === file._id)}
                                   className={`text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed`}
                                   title={isDecryptDisabledGlobally ? (keyError || "Private key not available or loading...") : ""}
                               >
                                   {(isProcessing && selectedFile?.id === file._id) ? 'Processing...' : 'Decrypt & Verify'} {/* Changed text slightly */}
                               </button>
                           </td>
                      </tr>



                   ))}
               </tbody>
           </table>
       </div>

      {/* Decryption/Verification Results Area (Simplified) */}
      {selectedFile && (
        <div className="mt-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-2">Processing Result: {selectedFile.name}</h3>
          <p className="text-sm mb-2">Status: <span className="font-medium">{decryptionStatus}</span></p>
          {verificationResult && (
             <p className={`text-sm mb-2 font-medium ${ verificationResult === 'VALID' ? 'text-green-600' : 'text-red-600' }`}>
                Signature Verification: {verificationResult}
            </p>
          )}

          {/* Download Button */}
          {verificationResult === 'VALID' && decryptedBuffer && (
              <button
                  onClick={handleDownloadDecrypted}
                  className="my-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              >
                  Download Decrypted File ({decryptedFilename})
              </button>
          )}

           {/* REMOVED Text Preview Section */}

           {/* Verification Failed Message */}
           {verificationResult === 'INVALID' && (
               <p className="text-sm text-red-600">Cannot download file: Invalid Signature.</p>
           )}
           {/* Optional: Show generic error if verificationResult === 'ERROR' */}
           {verificationResult === 'ERROR' && (
               <p className="text-sm text-red-600">An error occurred during the process. Cannot download file.</p>
           )}
        </div>
      )}
    </div>
  );
};

export default FileList;