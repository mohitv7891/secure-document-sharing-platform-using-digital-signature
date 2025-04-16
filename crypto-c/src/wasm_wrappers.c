#include <stdlib.h>
#include <stdio.h>
#include <string.h> // For memcpy
#include <pbc/pbc.h>
#include "bls_ibe_util.h" // For utilities including buffer deserializers
#include "ibe.h"          // For IBE Encrypt/Decrypt

// Define the path where pairing parameters are expected in the Wasm virtual filesystem
#define WASM_PARAM_FILE "/a.param"

// --- Helper Function ---
// Initializes pairing for Wasm environment. Returns 0 on success, 1 on error.
// Assumes WASM_PARAM_FILE exists in Emscripten's virtual FS (MEMFS).
static int initialize_wasm_pairing(pairing_t pairing) {
    FILE *fp = fopen(WASM_PARAM_FILE, "rb");
    if (!fp) {
        fprintf(stderr, "Wasm Error: Pairing parameter file '%s' not found in virtual filesystem.\n", WASM_PARAM_FILE);
        return 1; // Indicate error
    }
    fclose(fp);
    initialize_pairing(pairing, WASM_PARAM_FILE);
    // If initialize_pairing exits via DIE, we won't reach here.
    // If it were modified to return errors, we'd check the return value here.
    return 0; // Success (if initialize_pairing didn't exit)
}


// --- Exported Wasm Functions ---

/**
 * @brief Signs a message using a provided private key.
 *
 * Allocates memory for the signature which must be freed by the caller
 * using wasm_free_buffer().
 *
 * @param private_key_data Buffer containing the compressed private key (G1 element).
 * @param private_key_len Length of the private key buffer.
 * @param message_data Buffer containing the message to sign.
 * @param message_len Length of the message buffer.
 * @param output_sig_len Pointer to a size_t where the length of the returned signature buffer will be written.
 * @return Pointer to the allocated signature buffer (compressed G1 element), or NULL on error.
 */
unsigned char* wasm_sign_buffer(
    const unsigned char* private_key_data, size_t private_key_len,
    const unsigned char* message_data, size_t message_len,
    size_t* output_sig_len
) {
    pairing_t pairing;
    element_t d;       // User's private key
    element_t h;       // Hash of message
    element_t sigma;   // Signature
    unsigned char *sig_bytes_out = NULL; // Pointer to return

    // 1. Initialize Pairing
    if (initialize_wasm_pairing(pairing) != 0) {
        return NULL; // Failed to initialize pairing
    }

    // 2. Load private key from buffer
    if (deserialize_private_key_from_buffer(pairing, d, private_key_data, private_key_len) != 0) {
        fprintf(stderr, "Wasm Sign Error: Failed to load private key from buffer.\n");
        pairing_clear(pairing);
        return NULL;
    }

    // 3. Hash message buffer to Zr
    hash_message_to_Zr(h, message_data, message_len, pairing); // Initializes 'h'

    // 4. Compute signature: sigma = d^h
    element_init_G1(sigma, pairing);
    element_pow_zn(sigma, d, h); // sigma = d ^ h

    // 5. Serialize signature (compressed) and allocate memory for output
    int sig_len = element_length_in_bytes_compressed(sigma);
    if (sig_len <= 0) {
         fprintf(stderr, "Wasm Sign Error: Failed to get signature length.\n");
         element_clear(d);
         element_clear(h);
         element_clear(sigma);
         pairing_clear(pairing);
         return NULL;
    }
    // Ensure output_sig_len is valid before dereferencing
    if (!output_sig_len) {
        fprintf(stderr, "Wasm Sign Error: output_sig_len pointer is NULL.\n");
        element_clear(d); element_clear(h); element_clear(sigma); pairing_clear(pairing);
        return NULL;
    }
    *output_sig_len = (size_t)sig_len; // Set the output length

    sig_bytes_out = (unsigned char *)malloc(*output_sig_len);
    if (!sig_bytes_out) {
        fprintf(stderr, "Wasm Sign Error: Malloc failed for signature buffer.\n");
        element_clear(d);
        element_clear(h);
        element_clear(sigma);
        pairing_clear(pairing);
        return NULL;
    }
    element_to_bytes_compressed(sig_bytes_out, sigma);

    // 6. Cleanup PBC elements and pairing
    element_clear(d);
    element_clear(h);
    element_clear(sigma);
    pairing_clear(pairing);

    // 7. Return the allocated buffer containing the signature
    return sig_bytes_out;
}

/**
 * @brief Encrypts a message and signature for a recipient ID using IBE.
 *
 * Allocates memory for the ciphertext (U||V) which must be freed by the caller
 * using wasm_free_buffer().
 *
 * @param pub_params_data Buffer containing public parameters (compressed g || compressed P_pub).
 * @param pub_params_len Length of the public parameters buffer.
 * @param receiver_id Null-terminated string containing the recipient's identity.
 * @param message_data Buffer containing the original message.
 * @param message_len Length of the message buffer.
 * @param signature_data Buffer containing the signature (compressed G1 element).
 * @param signature_len Length of the signature buffer.
 * @param output_u_len Pointer to size_t where length of compressed U part will be written.
 * @param output_total_len Pointer to a size_t where the total length of the returned ciphertext buffer (U||V) will be written.
 * @return Pointer to the allocated ciphertext buffer (compressed U || V), or NULL on error.
 */
unsigned char* wasm_encrypt_buffer(
    const unsigned char* pub_params_data, size_t pub_params_len,
    const char* receiver_id,
    const unsigned char* message_data, size_t message_len,
    const unsigned char* signature_data, size_t signature_len,
    size_t* output_u_len, // Output param for U length
    size_t* output_total_len // Output param for Total length
) {
    // Add null checks for output pointers at the beginning
    if (!output_u_len || !output_total_len) {
        fprintf(stderr, "Wasm Encrypt Error: Output length pointers cannot be NULL.\n");
        return NULL;
    }
    // Initialize output lengths to 0 in case of early error return
    *output_u_len = 0;
    *output_total_len = 0;

    // fprintf(stderr, "[DEBUG] Entering wasm_encrypt_buffer...\n"); // Keep debug prints if helpful
    // fprintf(stderr, "[DEBUG] output_u_len pointer: %p\n", (void*)output_u_len);
    // fprintf(stderr, "[DEBUG] output_total_len pointer: %p\n", (void*)output_total_len);

    pairing_t pairing;
    element_t g, P_pub, U;
    unsigned char *plaintext_buffer = NULL;
    unsigned char *V = NULL;
    unsigned char *output_buffer = NULL;

    // 1. Initialize Pairing
    // fprintf(stderr, "[DEBUG] Initializing pairing...\n");
    if (initialize_wasm_pairing(pairing) != 0) {
        // fprintf(stderr, "[DEBUG] Pairing init FAILED.\n");
        return NULL;
    }
    // fprintf(stderr, "[DEBUG] Pairing initialized.\n");

    // 2. Deserialize Public Parameters
    // fprintf(stderr, "[DEBUG] Deserializing public params (len %zu)...\n", pub_params_len);
    if (deserialize_public_params_from_buffer(pairing, g, P_pub, pub_params_data, pub_params_len) != 0) {
        fprintf(stderr, "Wasm Encrypt Error: Failed to load public params from buffer.\n");
        pairing_clear(pairing);
        return NULL;
    }
    // fprintf(stderr, "[DEBUG] Public params deserialized.\n");

    // 3. Concatenate message and signature = plaintext
    size_t plaintext_len = message_len + signature_len;
    // fprintf(stderr, "[DEBUG] msg_len=%zu, sig_len=%zu, plaintext_len=%zu\n", message_len, signature_len, plaintext_len);
    if (plaintext_len == 0 && (message_len > 0 || signature_len > 0)) {
         // Check for potential overflow if lengths are huge
         fprintf(stderr, "Wasm Encrypt Error: Plaintext length calculation overflow or invalid input lengths.\n");
         element_clear(g); element_clear(P_pub); pairing_clear(pairing);
         return NULL;
    }
     if (plaintext_len == 0) {
         // Allow encrypting empty message? Return NULL or specific empty representation?
         fprintf(stderr, "Wasm Encrypt Warning: Plaintext length is zero.\n");
         // Let's return NULL for now, indicates nothing was encrypted.
         element_clear(g); element_clear(P_pub); pairing_clear(pairing);
         return NULL;
    }
    plaintext_buffer = (unsigned char *)malloc(plaintext_len);
    if (!plaintext_buffer) {
        fprintf(stderr, "Wasm Encrypt Error: Malloc failed for plaintext buffer.\n");
        element_clear(g); element_clear(P_pub); pairing_clear(pairing);
        return NULL;
    }
    memcpy(plaintext_buffer, message_data, message_len);
    memcpy(plaintext_buffer + message_len, signature_data, signature_len);
    // fprintf(stderr, "[DEBUG] Plaintext buffer created.\n");

    // 4. Prepare for IBE Encryption
    element_init_G1(U, pairing); // U will be computed by Encrypt
    V = (unsigned char *)malloc(plaintext_len); // Ciphertext part V
    if (!V) {
        fprintf(stderr, "Wasm Encrypt Error: Malloc failed for ciphertext V buffer.\n");
        free(plaintext_buffer); element_clear(g); element_clear(P_pub); element_clear(U); pairing_clear(pairing);
        return NULL;
    }
    // fprintf(stderr, "[DEBUG] V buffer allocated.\n");

    // 5. Call IBE Encrypt function (from ibe.c)
    // fprintf(stderr, "[DEBUG] Calling Encrypt (receiver_id: %s)...\n", receiver_id);
    Encrypt(pairing, g, P_pub, receiver_id, plaintext_buffer, plaintext_len, U, V);
    // fprintf(stderr, "[DEBUG] Encrypt function returned.\n");

    // 6. Prepare output buffer (U_compressed || V)
    int U_len_comp = element_length_in_bytes_compressed(U);
    // fprintf(stderr, "[DEBUG] Calculated U_len_comp: %d\n", U_len_comp);
     if (U_len_comp <= 0) {
         fprintf(stderr, "Wasm Encrypt Error: Failed to get compressed U length.\n");
         free(plaintext_buffer); free(V); element_clear(g); element_clear(P_pub); element_clear(U); pairing_clear(pairing);
         return NULL;
     }

    // --- Assign output lengths ---
    *output_u_len = (size_t)U_len_comp;
    size_t total_len_calc = (size_t)U_len_comp + plaintext_len;
    *output_total_len = total_len_calc;
    // fprintf(stderr, "[DEBUG] Assigned *output_u_len = %zu\n", *output_u_len);
    // fprintf(stderr, "[DEBUG] Assigned *output_total_len = %zu\n", *output_total_len);
    // --- End assign output lengths ---

    // fprintf(stderr, "[DEBUG] Allocating output buffer of size %zu...\n", *output_total_len);
    output_buffer = (unsigned char *)malloc(*output_total_len);
    if (!output_buffer) {
        fprintf(stderr, "Wasm Encrypt Error: Malloc failed for output buffer.\n");
        // Reset output lengths on failure
        *output_u_len = 0;
        *output_total_len = 0;
        free(plaintext_buffer); free(V); element_clear(g); element_clear(P_pub); element_clear(U); pairing_clear(pairing);
        return NULL;
    }
    // fprintf(stderr, "[DEBUG] Output buffer allocated at %p.\n", (void*)output_buffer);

    // Serialize compressed U into the start of output_buffer
    element_to_bytes_compressed(output_buffer, U);
    // Copy V into output_buffer after U
    memcpy(output_buffer + U_len_comp, V, plaintext_len);
    // fprintf(stderr, "[DEBUG] U and V copied to output buffer.\n");

    // 7. Cleanup
    // fprintf(stderr, "[DEBUG] Cleaning up encrypt...\n");
    free(plaintext_buffer);
    free(V);
    element_clear(g);
    element_clear(P_pub);
    element_clear(U);
    pairing_clear(pairing);

    // 8. Return combined ciphertext
    // fprintf(stderr, "[DEBUG] Returning output buffer: %p\n", (void*)output_buffer);
    return output_buffer;
}


/**
 * @brief Decrypts an IBE ciphertext (U||V) using the recipient's private key.
 *
 * Allocates memory for the plaintext (message||signature) which must be freed
 * by the caller using wasm_free_buffer().
 *
 * @param private_key_data Buffer containing the compressed private key (G1 element).
 * @param private_key_len Length of the private key buffer.
 * @param u_data Buffer containing the compressed U component of the ciphertext.
 * @param u_len Length of the U buffer.
 * @param v_data Buffer containing the V component of the ciphertext.
 * @param v_len Length of the V buffer (which is also the plaintext length).
 * @param output_plaintext_len Pointer to size_t where the length of the returned plaintext will be written.
 * @return Pointer to the allocated plaintext buffer (message || signature), or NULL on error.
 */
unsigned char* wasm_decrypt_buffer(
    const unsigned char* private_key_data, size_t private_key_len,
    const unsigned char* u_data, size_t u_len,
    const unsigned char* v_data, size_t v_len,
    size_t* output_plaintext_len
) {
     // Add null check for output pointer
    if (!output_plaintext_len) {
        fprintf(stderr, "Wasm Decrypt Error: output_plaintext_len pointer is NULL.\n");
        return NULL;
    }
    *output_plaintext_len = 0; // Initialize

    pairing_t pairing;
    element_t d_receiver; // Receiver's private key
    element_t U;          // Ephemeral key from ciphertext U
    unsigned char *plaintext_buffer = NULL;

    // 1. Initialize Pairing
    if (initialize_wasm_pairing(pairing) != 0) {
        return NULL;
    }

    // 2. Deserialize private key
    if (deserialize_private_key_from_buffer(pairing, d_receiver, private_key_data, private_key_len) != 0) {
        fprintf(stderr, "Wasm Decrypt Error: Failed to load private key from buffer.\n");
        pairing_clear(pairing);
        return NULL;
    }

    // 3. Deserialize ciphertext component U
    if (deserialize_ciphertext_u_from_buffer(pairing, U, u_data, u_len) != 0) {
        fprintf(stderr, "Wasm Decrypt Error: Failed to load U from buffer.\n");
        element_clear(d_receiver); pairing_clear(pairing);
        return NULL;
    }

    // 4. Allocate buffer for decrypted plaintext
    // V's length (v_len) is the plaintext length
    if (v_len == 0) {
        // If V is empty, plaintext is empty. Return empty buffer? Or NULL?
        // Let's return NULL as it likely indicates an issue or empty encryption.
        fprintf(stderr, "Wasm Decrypt Error: Ciphertext V part has zero length.\n");
        element_clear(d_receiver); element_clear(U); pairing_clear(pairing);
        return NULL;
    }
    plaintext_buffer = (unsigned char *)malloc(v_len);
    if (!plaintext_buffer) {
        fprintf(stderr, "Wasm Decrypt Error: Malloc failed for plaintext buffer.\n");
        element_clear(d_receiver); element_clear(U); pairing_clear(pairing);
        return NULL;
    }

    // 5. Call IBE Decrypt function (from ibe.c)
    // Decrypt modifies plaintext_buffer in place
    Decrypt(pairing, d_receiver, U, v_data, v_len, plaintext_buffer);

    // 6. Set output length and cleanup
    *output_plaintext_len = v_len;
    element_clear(d_receiver);
    element_clear(U);
    pairing_clear(pairing);

    // 7. Return allocated plaintext buffer (contains message || signature)
    return plaintext_buffer;
}

/**
 * @brief Verifies a signature against a message and signer's identity.
 *
 * @param pub_params_data Buffer containing public parameters (compressed g || compressed P_pub).
 * @param pub_params_len Length of the public parameters buffer.
 * @param signer_id Null-terminated string containing the signer's identity.
 * @param message_data Buffer containing the message.
 * @param message_len Length of the message buffer.
 * @param signature_data Buffer containing the signature (compressed G1 element).
 * @param signature_len Length of the signature buffer.
 * @return 0 if signature is VALID, 1 if signature is INVALID, -1 on error.
 */
int wasm_verify_buffer(
    const unsigned char* pub_params_data, size_t pub_params_len,
    const char* signer_id,
    const unsigned char* message_data, size_t message_len,
    const unsigned char* signature_data, size_t signature_len
) {
    pairing_t pairing;
    element_t g, P_pub;     // Public parameters
    element_t Q_signer;     // H(signer_id)
    element_t h;            // H(message)
    element_t sigma;        // Signature
    element_t temp_G1, lhs_GT, rhs_GT; // Temporaries
    int result = -1; // Default to error

    // 1. Initialize Pairing
    if (initialize_wasm_pairing(pairing) != 0) {
        return -1; // Error
    }

    // 2. Deserialize Public Parameters
    if (deserialize_public_params_from_buffer(pairing, g, P_pub, pub_params_data, pub_params_len) != 0) {
        fprintf(stderr, "Wasm Verify Error: Failed to load public params from buffer.\n");
        pairing_clear(pairing);
        return -1; // Error
    }

    // 3. Deserialize Signature
    if (deserialize_signature_from_buffer(pairing, sigma, signature_data, signature_len) != 0) {
        fprintf(stderr, "Wasm Verify Error: Failed to load signature from buffer.\n");
        element_clear(g); element_clear(P_pub); pairing_clear(pairing);
        return -1; // Error
    }

    // 4. Hash signer ID to G1
    // Check for NULL or empty signer_id
    if (!signer_id || strlen(signer_id) == 0) {
         fprintf(stderr, "Wasm Verify Error: Signer ID is NULL or empty.\n");
         element_clear(g); element_clear(P_pub); element_clear(sigma); pairing_clear(pairing);
         return -1;
    }
    hash_id_to_G1(Q_signer, signer_id, pairing); // Initializes Q_signer

    // 5. Hash message to Zr
    // Allow empty message? hash_message_to_Zr should handle it.
    hash_message_to_Zr(h, message_data, message_len, pairing); // Initializes h

    // 6. Verification check: e(sigma, g) == e(Q_signer^h, P_pub)
    element_init_GT(lhs_GT, pairing);
    pairing_apply(lhs_GT, sigma, g, pairing); // LHS = e(sigma, g)

    element_init_G1(temp_G1, pairing);
    element_pow_zn(temp_G1, Q_signer, h); // temp_G1 = Q_signer^h

    element_init_GT(rhs_GT, pairing);
    pairing_apply(rhs_GT, temp_G1, P_pub, pairing); // RHS = e(temp_G1, P_pub)

    // Compare LHS and RHS
    if (!element_cmp(lhs_GT, rhs_GT)) {
        result = 0; // VALID
    } else {
        result = 1; // INVALID
    }

    // 7. Cleanup
    element_clear(g);
    element_clear(P_pub);
    element_clear(Q_signer);
    element_clear(h);
    element_clear(sigma);
    element_clear(temp_G1);
    element_clear(lhs_GT);
    element_clear(rhs_GT);
    pairing_clear(pairing);

    return result;
}


/**
 * @brief Frees memory allocated by Wasm functions (like wasm_sign_buffer).
 *
 * Should be called from JavaScript to free the pointers returned by functions
 * that allocate memory internally.
 *
 * @param ptr Pointer to the memory buffer to free.
 */
void wasm_free_buffer(void* ptr) {
    if (ptr != NULL) {
        free(ptr);
    }
}


