const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs').promises; // Use promises for async file operations

// Configuration - Read paths from environment variables
const NATIVE_CRYPTO_DIR = process.env.NATIVE_CRYPTO_DIR || '/opt/crypto-native'; // Default path
const KEYGEN_EXEC = process.env.NATIVE_KEYGEN_EXEC || 'keygen';
const USER_KEYS_DIR = process.env.USER_KEYS_DIR || '/opt/crypto-keys'; // Default path

const keygenExecutablePath = path.join(NATIVE_CRYPTO_DIR, KEYGEN_EXEC);

/**
 * Executes the native C keygen program.
 * @param {string} emailId - The user's email ID to generate the key for.
 * @returns {Promise<string>} - Resolves with the path to the generated key file on success.
 * @throws {Error} - Throws an error if key generation fails.
 */
async function executeKeygen(emailId) {
    console.log(`Attempting to generate key for: ${emailId}`);
    const expectedKeyFilename = `${emailId}_private_key.dat`;
    const expectedKeyPath = path.join(USER_KEYS_DIR, expectedKeyFilename);

    // Ensure the key storage directory exists
    try {
        await fs.mkdir(USER_KEYS_DIR, { recursive: true });
        console.log(`Key storage directory ensured: ${USER_KEYS_DIR}`);
    } catch (mkdirError) {
        console.error(`Error creating key storage directory ${USER_KEYS_DIR}:`, mkdirError);
        throw new Error('Server configuration error creating key storage directory.');
    }

    return new Promise((resolve, reject) => {
        // IMPORTANT: execFile is safer than exec as it prevents command injection.
        // We execute the command within the NATIVE_CRYPTO_DIR where a.param and master_secret_key.dat should be.
        execFile(keygenExecutablePath, [emailId], { cwd: NATIVE_CRYPTO_DIR, timeout: 5000 }, // Added timeout
            async (error, stdout, stderr) => {
                if (error) {
                    console.error(`Keygen execution failed for ${emailId}:`, error);
                    console.error(`Keygen stderr: ${stderr}`);
                    // Attempt to clean up potentially incomplete key file if it exists
                    try { await fs.unlink(expectedKeyPath); } catch (e) { /* Ignore unlink error */ }
                    return reject(new Error(`Key generation failed for user ${emailId}. Code: ${error.code}. Signal: ${error.signal}`));
                }

                // Check if the expected key file was created in the correct directory
                // The C program saves it relative to its execution dir (NATIVE_CRYPTO_DIR)
                const generatedKeyPathInNativeDir = path.join(NATIVE_CRYPTO_DIR, expectedKeyFilename);

                try {
                    await fs.access(generatedKeyPathInNativeDir); // Check if file exists where C program created it
                    console.log(`Keygen successful, file created at: ${generatedKeyPathInNativeDir}`);
                    console.log(`Keygen stdout: ${stdout}`);

                    // Move the generated key file to the secure USER_KEYS_DIR
                    await fs.rename(generatedKeyPathInNativeDir, expectedKeyPath);
                    console.log(`Moved key file to secure location: ${expectedKeyPath}`);

                    // Optional: Set restrictive permissions on the key file (e.g., owner read-only)
                    // await fs.chmod(expectedKeyPath, 0o400); // Owner read-only

                    resolve(expectedKeyPath); // Resolve with the final path

                } catch (fileError) {
                     console.error(`Keygen seemed to succeed, but key file not found or couldn't be moved for ${emailId}:`, fileError);
                     console.error(`Expected location after C execution: ${generatedKeyPathInNativeDir}`);
                     console.error(`Target location: ${expectedKeyPath}`);
                     reject(new Error(`Key generation post-processing failed for user ${emailId}.`));
                }
            });
    });
}
console.log("executeKeygen.js: Module loaded, exporting executeKeygen function.");

module.exports = executeKeygen;