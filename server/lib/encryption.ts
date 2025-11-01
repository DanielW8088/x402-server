/**
 * Encryption utilities for secure storage of private keys
 * Uses AES-256-GCM with key derived from environment variable
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Get encryption key from environment variable
 * Key should be 32 bytes (256 bits) hex string
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.AGENT_ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error('AGENT_ENCRYPTION_KEY environment variable not set');
  }
  
  // If key is less than 64 chars (32 bytes hex), derive it using PBKDF2
  if (keyHex.length < 64) {
    const salt = Buffer.from('0x402-ai-agent-salt'); // Fixed salt for consistency
    return crypto.pbkdf2Sync(keyHex, salt, 100000, 32, 'sha256');
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a private key for storage
 * @param privateKey - Private key to encrypt (with or without 0x prefix)
 * @returns Encrypted string format: iv:authTag:encrypted
 */
export function encryptPrivateKey(privateKey: string): string {
  try {
    // Remove 0x prefix if present
    const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    
    // Get encryption key
    const key = getEncryptionKey();
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(cleanKey, 'utf8'),
      cipher.final()
    ]);
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Return format: iv:authTag:encrypted (all in hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (error: any) {
    throw new Error(`Failed to encrypt private key: ${error.message}`);
  }
}

/**
 * Decrypt a private key from storage
 * @param encryptedData - Encrypted string from database
 * @returns Decrypted private key with 0x prefix
 */
export function decryptPrivateKey(encryptedData: string): `0x${string}` {
  try {
    // Parse encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    // Get encryption key
    const key = getEncryptionKey();
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    const privateKey = decrypted.toString('utf8');
    
    // Return with 0x prefix
    return `0x${privateKey}` as `0x${string}`;
  } catch (error: any) {
    throw new Error(`Failed to decrypt private key: ${error.message}`);
  }
}

/**
 * Generate a random encryption key (for initial setup)
 * Returns 32-byte hex string suitable for AGENT_ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Test encryption/decryption
 */
export function testEncryption(): boolean {
  try {
    const testKey = '0x' + '0'.repeat(64); // Test private key
    const encrypted = encryptPrivateKey(testKey);
    const decrypted = decryptPrivateKey(encrypted);
    return decrypted === testKey;
  } catch {
    return false;
  }
}

