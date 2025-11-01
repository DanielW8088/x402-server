import { config } from "dotenv";
import { readFileSync, accessSync, constants } from "fs";
import { resolve } from "path";

config();

// Input validation constants
export const MAX_NAME_LENGTH = 100;
export const MAX_SYMBOL_LENGTH = 20;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_URL_LENGTH = 500;

// Private key file paths
// macOS: Use ~/.config/token-mint/private.key or /usr/local/etc/secret/private.key
// Linux: Use /etc/secret/private.key
const DEFAULT_KEY_FILE = process.platform === 'darwin' 
  ? `${process.env.HOME}/.config/token-mint/private.key`
  : '/etc/secret/private.key';
const PRIVATE_KEY_FILE = process.env.PRIVATE_KEY_FILE || DEFAULT_KEY_FILE;

/**
 * Read private keys from secure file system location
 * File should contain JSON: { "serverPrivateKey": "0x...", "minterPrivateKey": "0x...", "lpDeployerPrivateKey": "0x..." }
 * File permissions should be 600 (owner read/write only)
 */
function loadPrivateKeys(): { 
  serverPrivateKey: `0x${string}`; 
  minterPrivateKey: `0x${string}`;
  lpDeployerPrivateKey: `0x${string}`;
} {
  try {
    // Check file exists and is readable
    accessSync(PRIVATE_KEY_FILE, constants.R_OK);
    
    // Read and parse private keys
    const content = readFileSync(PRIVATE_KEY_FILE, "utf-8");
    const keys = JSON.parse(content);
    
    if (!keys.serverPrivateKey || !keys.minterPrivateKey || !keys.lpDeployerPrivateKey) {
      throw new Error("Missing required keys in private key file");
    }
    
    // Validate format
    if (!keys.serverPrivateKey.startsWith("0x") || 
        !keys.minterPrivateKey.startsWith("0x") ||
        !keys.lpDeployerPrivateKey.startsWith("0x")) {
      throw new Error("Private keys must start with 0x");
    }
    
    return {
      serverPrivateKey: keys.serverPrivateKey as `0x${string}`,
      minterPrivateKey: keys.minterPrivateKey as `0x${string}`,
      lpDeployerPrivateKey: keys.lpDeployerPrivateKey as `0x${string}`,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`\n❌ Private key file not found: ${PRIVATE_KEY_FILE}`);
      console.error("\n💡 To fix:");
      console.error(`   1. Create file: sudo mkdir -p /etc/secret && sudo touch ${PRIVATE_KEY_FILE}`);
      console.error(`   2. Set permissions: sudo chmod 600 ${PRIVATE_KEY_FILE}`);
      console.error(`   3. Add keys as JSON: { "serverPrivateKey": "0x...", "minterPrivateKey": "0x...", "lpDeployerPrivateKey": "0x..." }`);
      console.error(`   4. Set ownership: sudo chown $(whoami) ${PRIVATE_KEY_FILE}`);
      console.error(`\n📖 Or set PRIVATE_KEY_FILE env var to use a different location\n`);
    } else if ((error as NodeJS.ErrnoException).code === "EACCES") {
      console.error(`\n❌ Permission denied reading: ${PRIVATE_KEY_FILE}`);
      console.error(`💡 Fix with: sudo chmod 600 ${PRIVATE_KEY_FILE} && sudo chown $(whoami) ${PRIVATE_KEY_FILE}\n`);
    } else {
      console.error(`\n❌ Failed to load private keys: ${(error as Error).message}\n`);
    }
    process.exit(1);
  }
}

// Load private keys from secure file
const { serverPrivateKey, minterPrivateKey, lpDeployerPrivateKey } = loadPrivateKeys();
export { serverPrivateKey, minterPrivateKey, lpDeployerPrivateKey };

// Other environment variables
export const excessRecipient = process.env.EXCESS_RECIPIENT_ADDRESS as `0x${string}`;
export const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";

// x402 Configuration
export const x402FacilitatorUrl = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
export const x402Enabled = process.env.X402_ENABLED !== 'false';

// Database configuration
export const databaseUrl = process.env.DATABASE_URL;
export const useDatabase = !!databaseUrl;

// Redis configuration
export const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Deployment fee constants
export const DEPLOY_FEE_USDC = BigInt(10 * 10 ** 6); // 10 USDC

// Port
export const PORT = process.env.PORT || 4021;

// Validation
export function validateEnv() {
  const missingVars: string[] = [];
  // Private keys are loaded from file, validated in loadPrivateKeys()
  if (!databaseUrl) missingVars.push("DATABASE_URL");

  if (missingVars.length > 0) {
    console.error("\n❌ Missing required environment variables:");
    missingVars.forEach(v => console.error(`   - ${v}`));
    console.error("\n💡 To fix:");
    console.error("   1. Create .env file: cp env.multi-token.example .env");
    console.error("   2. Update DATABASE_URL with your PostgreSQL connection");
    console.error("\n📖 See env.multi-token.example for full configuration\n");
    process.exit(1);
  }
}

