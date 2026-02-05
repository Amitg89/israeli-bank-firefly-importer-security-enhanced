/**
 * Cryptographic utilities for secure credential storage
 * Uses AES-256-GCM with PBKDF2 key derivation
 */

import crypto from 'node:crypto';

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const SALT_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000; // OWASP recommendation
const PBKDF2_DIGEST = 'sha256';
const ENCRYPTED_PREFIX = 'encrypted:v1:';

/**
 * Derives a cryptographic key from a password using PBKDF2
 * @param {string} password - The master password
 * @param {Buffer} salt - Random salt
 * @returns {Promise<Buffer>} - Derived key
 */
function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 * @param {string} plaintext - The text to encrypt
 * @param {string} masterPassword - The master password
 * @returns {Promise<string>} - Encrypted string with prefix
 */
export async function encrypt(plaintext, masterPassword) {
  if (!plaintext || !masterPassword) {
    throw new Error('Plaintext and master password are required');
  }

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key from password
  const key = await deriveKey(masterPassword, salt);

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);

  // Return with prefix for identification
  return ENCRYPTED_PREFIX + combined.toString('base64');
}

/**
 * Decrypts an encrypted string using AES-256-GCM
 * @param {string} encryptedText - The encrypted text with prefix
 * @param {string} masterPassword - The master password
 * @returns {Promise<string>} - Decrypted plaintext
 */
export async function decrypt(encryptedText, masterPassword) {
  if (!encryptedText || !masterPassword) {
    throw new Error('Encrypted text and master password are required');
  }

  if (!isEncrypted(encryptedText)) {
    throw new Error('Text is not in encrypted format');
  }

  // Remove prefix and decode base64
  const base64Data = encryptedText.slice(ENCRYPTED_PREFIX.length);
  const combined = Buffer.from(base64Data, 'base64');

  // Extract components
  let offset = 0;
  const salt = combined.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  const iv = combined.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const authTag = combined.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;

  const ciphertext = combined.subarray(offset);

  // Derive the same key
  const key = await deriveKey(masterPassword, salt);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    if (error.message.includes('Unsupported state') || error.message.includes('auth')) {
      throw new Error('Decryption failed: Invalid master password or corrupted data');
    }
    throw error;
  }
}

/**
 * Checks if a string is in encrypted format
 * @param {string} text - The text to check
 * @returns {boolean} - True if encrypted
 */
export function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Recursively decrypts all encrypted values in an object
 * @param {any} obj - The object to decrypt
 * @param {string} masterPassword - The master password
 * @returns {Promise<any>} - Object with decrypted values
 */
export async function decryptObject(obj, masterPassword) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    if (isEncrypted(obj)) {
      return decrypt(obj, masterPassword);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return Promise.all(obj.map((item) => decryptObject(item, masterPassword)));
  }

  if (typeof obj === 'object') {
    const result = {};
    const entries = Object.entries(obj);
    await Promise.all(
      entries.map(async ([key, value]) => {
        result[key] = await decryptObject(value, masterPassword);
      }),
    );
    return result;
  }

  return obj;
}

/**
 * Recursively encrypts sensitive fields in an object
 * Encrypts fields matching: credentials.*, password, tokenApi, id (in credentials context)
 * @param {any} obj - The object to encrypt
 * @param {string} masterPassword - The master password
 * @param {string} path - Current path in object (for context)
 * @returns {Promise<any>} - Object with encrypted sensitive values
 */
export async function encryptSensitiveFields(obj, masterPassword, path = '') {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Skip if already encrypted
    if (isEncrypted(obj)) {
      return obj;
    }

    // Check if this is a sensitive field based on path
    const sensitivePatterns = [
      /\.credentials\./,
      /\.credentials$/,
      /\.password$/,
      /\.tokenApi$/,
      /\.token$/,
      /\.secret$/,
      /\.apiKey$/,
    ];

    const isSensitive = sensitivePatterns.some((pattern) => pattern.test(path));
    if (isSensitive && obj.trim() !== '') {
      return encrypt(obj, masterPassword);
    }

    return obj;
  }

  if (Array.isArray(obj)) {
    return Promise.all(
      obj.map((item, index) => encryptSensitiveFields(item, masterPassword, `${path}[${index}]`)),
    );
  }

  if (typeof obj === 'object') {
    const result = {};
    const entries = Object.entries(obj);
    await Promise.all(
      entries.map(async ([key, value]) => {
        const newPath = path ? `${path}.${key}` : key;
        result[key] = await encryptSensitiveFields(value, masterPassword, newPath);
      }),
    );
    return result;
  }

  return obj;
}

export { ENCRYPTED_PREFIX };
