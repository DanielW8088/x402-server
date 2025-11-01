import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, getAddress, keccak256, toHex, isAddress, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { Pool } from "pg";
import Redis from "ioredis";
import { 
  deployToken, 
  saveDeployedToken, 
  getToken, 
  getAllTokens,
  updateTokenMintCount,
  verifyContract,
  TokenDeployConfig 
} from "./services/tokenDeployer.js";
import { initDatabase } from "./db/init.js";
import { MintQueueProcessor } from "./queue/processor.js";
import { PaymentQueueProcessor } from "./queue/payment-processor.js";
import { UserService } from "./services/userService.js";
import { verify, settle } from "x402/facilitator";
import { facilitator } from "@coinbase/x402";
import { createRPCBalancer } from "./lib/rpc-balancer.js";

config();

// Input validation constants
const MAX_NAME_LENGTH = 100;
const MAX_SYMBOL_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_URL_LENGTH = 500;

/**
 * Validate token name (alphanumeric, spaces, and basic punctuation)
 */
function isValidTokenName(name: string): boolean {
  return /^[a-zA-Z0-9\s\-_.,!?()]+$/.test(name);
}

/**
 * Validate token symbol (uppercase letters and numbers only)
 */
function isValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9]+$/.test(symbol);
}

/**
 * Validate HTTP/HTTPS URL
 */
function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Environment variables
const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const minterPrivateKey = process.env.MINTER_PRIVATE_KEY as `0x${string}`; // Separate wallet for minting (needs MINTER_ROLE)
const excessRecipient = process.env.EXCESS_RECIPIENT_ADDRESS as `0x${string}`; // Address to receive excess USDC from LP deployment
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";

// x402 Configuration
const x402FacilitatorUrl = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
const x402Enabled = process.env.X402_ENABLED !== 'false'; // Default enabled

// Database configuration
const databaseUrl = process.env.DATABASE_URL;
const useDatabase = !!databaseUrl;

// Validation
const missingVars: string[] = [];
if (!serverPrivateKey) missingVars.push("SERVER_PRIVATE_KEY");
if (!minterPrivateKey) missingVars.push("MINTER_PRIVATE_KEY");
if (!databaseUrl) missingVars.push("DATABASE_URL");

if (missingVars.length > 0) {
  console.error("\n❌ Missing required environment variables:");
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error("\n💡 To fix:");
  console.error("   1. Create .env file: cp env.multi-token.example .env");
  console.error("   2. Update DATABASE_URL with your PostgreSQL connection");
  console.error("   3. Set SERVER_PRIVATE_KEY and LP_DEPLOYER_PRIVATE_KEY");
  console.error("\n📖 See env.multi-token.example for full configuration\n");
  process.exit(1);
}

if (!excessRecipient) {
  // EXCESS_RECIPIENT_ADDRESS not set, using deployer as default
}

// Setup database pool with SSL support
const dbSslEnabled = process.env.DB_SSL_ENABLED !== 'false'; // Default to true, set to 'false' to disable
const isRemoteDB = databaseUrl && !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');

// SSL certificate configuration
const sslConfig = (dbSslEnabled && isRemoteDB) ? (() => {
  const sslCA = process.env.DB_SSL_CA;
  const sslCert = process.env.DB_SSL_CERT;
  const sslKey = process.env.DB_SSL_KEY;
  
  // If certificate files are specified, use them
  if (sslCA || sslCert || sslKey) {
      return {
      rejectUnauthorized: true,
      ca: sslCA ? readFileSync(sslCA).toString() : undefined,
      cert: sslCert ? readFileSync(sslCert).toString() : undefined,
      key: sslKey ? readFileSync(sslKey).toString() : undefined,
    };
  }
  
  // Otherwise use default SSL with relaxed verification
  return {
    rejectUnauthorized: false
  };
})() : false;

if (!dbSslEnabled && isRemoteDB) {
  // SSL disabled for remote database
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 50, // Increased from 20 for better concurrency
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Increased from 2000
  statement_timeout: 30000, // SQL query timeout
  ssl: sslConfig,
});

// Redis setup (optional, graceful fallback) - will be initialized in start()
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redis: Redis | null = null;
let userService: UserService;

// Viem setup
const chain = network === "base-sepolia" ? baseSepolia : base;

// SERVER wallet: for receiving USDC payments
const serverAccount = privateKeyToAccount(serverPrivateKey);

// MINTER wallet: for executing mint transactions (needs MINTER_ROLE on token contracts)
const minterAccount = privateKeyToAccount(minterPrivateKey);

// RPC Load Balancer - supports multiple RPC URLs for better throughput
const rpcBalancer = createRPCBalancer(
  network === "base-sepolia" 
    ? process.env.BASE_SEPOLIA_RPC_URL
    : process.env.BASE_RPC_URL,
  network === "base-sepolia" 
    ? "https://sepolia.base.org"
    : "https://mainnet.base.org"
);

console.log(`🌐 RPC Configuration: ${rpcBalancer.getStatus().totalUrls} endpoint(s)`);
rpcBalancer.getUrls().forEach((url, i) => {
  console.log(`   ${i + 1}. ${url}`);
});

// Create transport with fallback support
const rpcTransport = rpcBalancer.createTransport({
  timeout: 30000,
  retryCount: 3,
  retryDelay: 1000,
});

// Server wallet client (for USDC payments)
const serverWalletClient = createWalletClient({
  account: serverAccount,
  chain,
  transport: rpcTransport,
}) as any;

// Minter wallet client (for mint transactions)
const minterWalletClient = createWalletClient({
  account: minterAccount,
  chain,
  transport: rpcTransport,
}) as any;

const publicClient = createPublicClient({
  chain,
  transport: rpcTransport,
}) as any; // Type assertion to avoid viem version conflicts

// Keep backward compatibility: walletClient points to server wallet
const walletClient = serverWalletClient;
const account = serverAccount;

// Create a combined client with both public and wallet capabilities for x402 settle
// x402 settle needs verifyTypedData (from public) and transaction signing (from wallet)
const combinedClient = {
  ...publicClient,
  ...serverWalletClient,
  account: serverAccount,
  chain,
  transport: rpcTransport,
} as any;

// x402 is enabled by default, uses Coinbase facilitator

// Contract ABIs
const tokenAbi = parseAbi([
  "function mint(address to, bytes32 txHash) external",
  "function hasMinted(bytes32 txHash) view returns (bool)",
  "function mintAmount() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function remainingSupply() view returns (uint256)",
  "function mintCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function liquidityDeployed() view returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "event TokensMinted(address indexed to, uint256 amount, bytes32 txHash)",
]);

const usdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const app = express();

// Trust proxy (nginx/cloudflare) to get correct protocol from X-Forwarded-Proto header
// This fixes the http vs https issue when behind a reverse proxy
app.set('trust proxy', true);

// Enable CORS with x402 headers - Allow all headers for x402-fetch compatibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*'); // Allow all headers to avoid x402-fetch issues
  res.header('Access-Control-Expose-Headers', 'X-Payment-Required, X-Payment-Version, X-Payment-Response');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

// Initialize queue processor (no default token for multi-token mode)
// Use MINTER wallet for executing mint transactions (needs MINTER_ROLE)
// Will be initialized with userService in start() function
let queueProcessor: MintQueueProcessor;

// In-memory cache for token info (fallback when Redis not available)
const tokenInfoCache = new Map<string, { data: any; expiry: number }>();
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 60 seconds (1 minute)

// Clean up expired cache entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, entry] of tokenInfoCache.entries()) {
    if (entry.expiry < now) {
      tokenInfoCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries. Current size: ${tokenInfoCache.size}`);
  }
}, 120000); // Every 2 minutes

// Initialize payment queue processor for serial payment processing
// Use SERVER wallet for receiving USDC payments (prevents nonce conflicts)
const paymentQueueProcessor = new PaymentQueueProcessor(
  pool,
  serverWalletClient,  // Use SERVER wallet for payment transactions
  publicClient,
  chain,
  serverAccount,
  // Callback for handling payment completion (e.g., trigger deployment or mint)
  async (item, txHash) => {
    if (item.payment_type === 'deploy' && item.metadata) {
      // Payment for deployment completed, now deploy the token
      const deployConfig = item.metadata.deployConfig;
      
      try {
        // Deploy token
        const deployResult = await deployToken(deployConfig);
        
        // Save to database
        const savedToken = await saveDeployedToken(pool, deployConfig, deployResult);
        
        // Trigger contract verification asynchronously (don't block deployment response)
        // Wait a few seconds for contract to be indexed by block explorer
        setTimeout(async () => {
          try {
            console.log(`🔍 Starting automatic verification for ${savedToken.address}...`);
            const verifyResult = await verifyContract(pool, savedToken.address);
            
            if (verifyResult.success) {
              console.log(`✅ Auto-verification successful for ${savedToken.address}`);
              if (verifyResult.guid) {
                console.log(`   GUID: ${verifyResult.guid}`);
              }
            } else {
              console.warn(`⚠️  Auto-verification failed for ${savedToken.address}: ${verifyResult.error}`);
              console.warn(`   Contract is deployed successfully. Verification can be retried manually.`);
            }
          } catch (verifyError: any) {
            console.warn(`⚠️  Auto-verification error for ${savedToken.address}: ${verifyError.message}`);
            console.warn(`   Contract is deployed successfully. Verification can be retried manually.`);
          }
        }, 15000); // Wait 15 seconds for block explorer indexing
        
        // Return deployment result
        return {
          success: true,
          tokenAddress: savedToken.address,
          deployTxHash: savedToken.deploy_tx_hash,
          blockNumber: savedToken.deploy_block_number,
        };
      } catch (error: any) {
        console.error(`❌ Deployment failed after payment:`, error.message);
        throw error;
      }
    }
    
    if (item.payment_type === 'mint' && item.metadata) {
      // 🔒 SECURE: Payment confirmed, now create mint queue items
      const { quantity, mode, paymentHeader, timestamp: paymentTimestamp } = item.metadata;
      const tokenAddress = item.token_address!;
      const payer = item.payer;
      
      try {
        const queueIds: string[] = [];
        const timestamp = paymentTimestamp || Date.now();
        
        // Generate mint tx hashes and add to queue
        for (let i = 0; i < quantity; i++) {
          const txHashBytes32 = generateMintTxHash(payer, timestamp + i, tokenAddress);
          
          // Add to mint queue
          const queueId = await queueProcessor.addToQueue(
            payer,
            txHashBytes32,
            txHash, // Payment tx hash - links mint to payment
            mode === 'x402' ? { paymentHeader } : item.authorization, // Store payment data
            mode || 'x402', // Default to x402
            tokenAddress
          );
          
          queueIds.push(queueId);
        }
        
        console.log(`✅ Created ${queueIds.length}x mint queue items after ${mode} payment confirmation`);
        
        return {
          success: true,
          queueIds,
          quantity,
          mode,
        };
      } catch (error: any) {
        console.error(`❌ Failed to queue mints after payment:`, error.message);
        throw error;
      }
    }
    
    return null;
  }
);

// Note: LP deployment is now handled by a separate standalone service
// See: server/lp-deployer-standalone.ts
// Run with: npm run lp-deployer

// Deployment fee constants
const DEPLOY_FEE_USDC = BigInt(10 * 10 ** 6); // 10 USDC

/**
 * Generate a unique transaction hash for minting
 * Uses keccak256 to create a proper 32-byte hash
 */
function generateMintTxHash(payer: string, timestamp: number, tokenAddress: string): `0x${string}` {
  const data = `${payer}-${timestamp}-${tokenAddress}`;
  const hash = keccak256(toHex(data));
  return hash as `0x${string}`;
}

/**
 * Generate payment requirements (used for both 402 response and verification)
 * CRITICAL: payTo must be the token contract address (where payment goes)
 * asset is the USDC contract address (what token is being paid)
 * 
 * Includes inputSchema and outputSchema for x402scan discovery
 */
function generatePaymentRequirements(
  tokenAddress: string,
  quantity: number,
  totalPrice: number,
  totalPriceWei: bigint,
  baseUrl: string
) {
  const usdcAddress = network === 'base-sepolia' 
    ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
  
  // Ensure HTTPS for production (fixes x402scan compatibility)
  const resourceUrl = baseUrl.replace(/^http:/, 'https:');
  
  return {
    scheme: "exact" as const,
    description: `Mint ${quantity}x AI agent tokens - Gasless minting on 0x402 protocol`,
    network: network as "base-sepolia" | "base",
    resource: `${resourceUrl}/api/mint/${tokenAddress}`,
    mimeType: "application/json",
    payTo: tokenAddress as `0x${string}`, // Recipient of payment (token contract)
    maxAmountRequired: totalPriceWei.toString(),
    maxTimeoutSeconds: 300,
    asset: usdcAddress, // Token being paid (USDC)
    // Schema for x402scan discovery (matches X402Response Accepts format)
    outputSchema: {
      input: {
        type: "http" as const,
        method: "POST" as const,
        bodyType: "json" as const,
        bodyFields: {
          quantity: {
            type: "number",
            description: "Number of tokens to mint",
            required: false
          }
        }
      },
      output: {
        success: {
          type: "boolean",
          description: "Whether the mint was successful"
        },
        tokenAddress: {
          type: "string",
          description: "Address of the minted token contract"
        },
        amount: {
          type: "string",
          description: "Amount of tokens minted (in wei)"
        },
        mint_tx_hash: {
          type: "string",
          description: "Transaction hash of the mint operation"
        },
        payment_tx_hash: {
          type: "string",
          description: "Transaction hash of the payment"
        },
        payer: {
          type: "string",
          description: "Address of the payer"
        }
      }
    }
  };
}

/**
 * Verify x402 payment using facilitator
 */
async function verifyX402Payment(
  paymentHeader: string, 
  tokenAddress: string,
  expectedAmount: bigint,
  quantity: number,
  req: any
): Promise<{ valid: boolean; payer?: string; amount?: bigint; error?: string }> {
  try {
    // Decode X-PAYMENT header to get PaymentPayload
    const paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    
    console.log(`🔐 Payment payload value: ${paymentPayload.value}, expected: ${expectedAmount.toString()}`);
    
    // Calculate price (must match 402 response)
    const pricePerMint = Number(expectedAmount) / (1e6 * quantity);
    const totalPrice = pricePerMint * quantity;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Generate payment requirements (MUST match what was sent in 402 response!)
    const paymentRequirements = generatePaymentRequirements(
      tokenAddress,
      quantity,
      totalPrice,
      expectedAmount,
      baseUrl
    );
    
    console.log('🔍 Verifying x402 payment via facilitator');
    console.log('📋 Payment requirements:', JSON.stringify({
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      resource: paymentRequirements.resource,
      payTo: paymentRequirements.payTo,
      asset: paymentRequirements.asset,
      maxAmountRequired: paymentRequirements.maxAmountRequired
    }, null, 2));
    
    const verifyResult = await verify(
      publicClient as any,
      paymentPayload,
      paymentRequirements
      // Note: x402 SDK uses default facilitator (x402.org) or verifies locally
    );
    
    console.log('✅ Verify result:', {
      isValid: verifyResult.isValid,
      invalidReason: verifyResult.invalidReason,
      payer: verifyResult.payer
    });
    
    if (verifyResult.isValid) {
      const payer = verifyResult.payer || paymentPayload.from as string;
      const amount = BigInt(paymentPayload.value || expectedAmount);
      
      // 🛡️ DEFENSE: Check balance and allowance before accepting payment
      const paymentTokenAddress = paymentRequirements.asset as `0x${string}`;
      const launchToolAddress = paymentRequirements.payTo as `0x${string}`;
      
      try {
        // Check user's USDC balance
        const balance = await publicClient.readContract({
          address: paymentTokenAddress,
          abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
          functionName: 'balanceOf',
          args: [payer as `0x${string}`],
        });
        
        // Check user's allowance to LaunchTool
        const allowance = await publicClient.readContract({
          address: paymentTokenAddress,
          abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
          functionName: 'allowance',
          args: [payer as `0x${string}`, launchToolAddress],
        });
        
        console.log(`💰 Balance check - Required: ${amount}, Balance: ${balance}, Allowance: ${allowance}`);
        
        if (balance < amount) {
          return {
            valid: false,
            error: `Insufficient balance: have ${balance}, need ${amount}`,
          };
        }
        
        if (allowance < amount) {
          return {
            valid: false,
            error: `Insufficient allowance: have ${allowance}, need ${amount}`,
          };
        }
      } catch (balanceError: any) {
        console.error('❌ Balance check failed:', balanceError.message);
        return {
          valid: false,
          error: `Balance check failed: ${balanceError.message}`,
        };
      }
      
      return {
        valid: true,
        payer,
        amount,
      };
    } else {
      // Debug: Try to recover signer address to verify signature correctness
      try {
        const auth = paymentPayload.payload?.authorization;
        if (auth && paymentPayload.payload?.signature) {
          // Normalize message (convert uint256 fields to bigint for correct recovery)
          const normMsg = {
            from: auth.from,
            to: auth.to,
            value: BigInt(auth.value),
            validAfter: BigInt(auth.validAfter),
            validBefore: BigInt(auth.validBefore),
            nonce: auth.nonce as `0x${string}`,
          };
          
          const usdcAddress = network === 'base-sepolia' 
            ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
            : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
          
          // CRITICAL: Base Sepolia USDC name is "USDC", not "USD Coin"
          // Base Mainnet USDC name is "USD Coin"
          const usdcName = network === 'base-sepolia' ? 'USDC' : 'USD Coin';
          
          const domain = {
            name: usdcName,
            version: '2',
            chainId: chain.id,
            verifyingContract: usdcAddress,
          };
          
          const types = {
            TransferWithAuthorization: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' },
            ],
          };
          
          await recoverTypedDataAddress({
            domain,
            types,
            primaryType: 'TransferWithAuthorization',
            message: normMsg,
            signature: paymentPayload.payload.signature as `0x${string}`,
          });
        }
      } catch (recoverError: any) {
        // Signature recovery failed
      }
      
      return { 
        valid: false, 
        error: verifyResult.invalidReason || "Payment verification failed" 
      };
    }
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Settle x402 payment through payment queue (avoids nonce conflicts)
 * Extracts authorization from x402 payload and queues it for serial processing
 */
async function settleX402Payment(
  paymentHeader: string,
  tokenAddress: string,
  expectedAmount: bigint,
  quantity: number,
  req: any
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Decode X-PAYMENT header to get PaymentPayload
    const paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
    
    console.log('🔄 Settling x402 payment via facilitator:', x402FacilitatorUrl);
    
    // Calculate price (must match 402 response)
    const pricePerMint = Number(expectedAmount) / (1e6 * quantity);
    const totalPrice = pricePerMint * quantity;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Generate payment requirements (MUST match what was sent in 402 response!)
    const paymentRequirements = generatePaymentRequirements(
      tokenAddress,
      quantity,
      totalPrice,
      expectedAmount,
      baseUrl
    );

    // ✅ Use x402 SDK to settle payment through facilitator
    // This is the standard x402 flow - facilitator handles the settlement
    console.log('🔄 Settling x402 payment');
    console.log('📋 Settle payment requirements:', JSON.stringify({
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      resource: paymentRequirements.resource,
      payTo: paymentRequirements.payTo,
      asset: paymentRequirements.asset,
      maxAmountRequired: paymentRequirements.maxAmountRequired
    }, null, 2));
    
    const settleResult = await settle(
      combinedClient,       // Combined client with both public and wallet capabilities
      paymentPayload,       // Payment payload from X-PAYMENT header
      paymentRequirements   // Must match 402 response
      // Note: x402 SDK uses default facilitator or settles locally
    );

    console.log('✅ Facilitator settle result:', {
      success: settleResult.success,
      errorReason: settleResult.errorReason,
      transaction: settleResult.transaction,
      network: settleResult.network
    });

    if (settleResult.success) {
      // Payment settled successfully via facilitator
      return {
        success: true,
        txHash: settleResult.transaction,  // transaction hash from settle result
      };
    } else {
      console.error('❌ Facilitator settlement failed:', settleResult.errorReason);
      return {
        success: false,
        error: settleResult.errorReason || "Payment settlement failed via facilitator",
      };
    }

  } catch (error: any) {
    console.error('❌ Settlement error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * GET /api/deploy-address - Get deployment service address
 */
app.get("/api/deploy-address", async (req, res) => {
  try {
    return res.status(200).json({
      deployAddress: account.address,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to get deploy address",
      message: error.message,
    });
  }
});

/**
 * Generate a hash code from a string for advisory lock
 * PostgreSQL advisory locks use bigint (64-bit), so we need a hash within that range
 */
function getAdvisoryLockId(str: string): bigint {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  // Use absolute value and ensure it's within PostgreSQL bigint range
  return BigInt(Math.abs(hash));
}

/**
 * POST /api/deploy - Deploy a new token (with database lock for concurrency control)
 */
app.post("/api/deploy", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: "Database not configured",
      message: "Token deployment requires DATABASE_URL to be set",
    });
  }

  const client = await pool.connect();
  
  try {
    const { name, symbol, mintAmount, maxMintCount, price, paymentToken, deployer, authorization, imageUrl, description } = req.body;

    // 🔒 SECURITY: Comprehensive input validation
    
    // Required fields
    if (!name || !symbol || !mintAmount || !maxMintCount || !price || !paymentToken || !deployer) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["name", "symbol", "mintAmount", "maxMintCount", "price", "paymentToken", "deployer"],
      });
    }

    // Payment authorization
    if (!authorization || !authorization.signature) {
      return res.status(400).json({
        error: "Missing payment authorization",
        message: "Deployment requires 10 USDC payment authorization",
      });
    }

    // Length validation
    if (name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({
        error: "Invalid name",
        message: `Name must be ${MAX_NAME_LENGTH} characters or less (got ${name.length})`,
      });
    }

    if (symbol.length > MAX_SYMBOL_LENGTH) {
      return res.status(400).json({
        error: "Invalid symbol",
        message: `Symbol must be ${MAX_SYMBOL_LENGTH} characters or less (got ${symbol.length})`,
      });
    }

    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        error: "Invalid description",
        message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less (got ${description.length})`,
      });
    }

    if (imageUrl && imageUrl.length > MAX_URL_LENGTH) {
      return res.status(400).json({
        error: "Invalid image URL",
        message: `Image URL must be ${MAX_URL_LENGTH} characters or less (got ${imageUrl.length})`,
      });
    }

    // Character validation
    if (!isValidTokenName(name)) {
      return res.status(400).json({
        error: "Invalid name format",
        message: "Name can only contain letters, numbers, spaces, and basic punctuation (.,!?-_())",
      });
    }

    if (!isValidSymbol(symbol)) {
      return res.status(400).json({
        error: "Invalid symbol format",
        message: "Symbol can only contain uppercase letters and numbers (e.g., TOKEN, ABC123)",
      });
    }

    // Address validation
    if (!isAddress(deployer)) {
      return res.status(400).json({
        error: "Invalid deployer address",
        message: "Deployer must be a valid Ethereum address",
      });
    }

    // URL validation
    if (imageUrl && !isValidHttpUrl(imageUrl)) {
      return res.status(400).json({
        error: "Invalid image URL",
        message: "Image URL must be a valid HTTP or HTTPS URL",
      });
    }

    // Normalize deployer address
    const normalizedDeployer = getAddress(deployer);

    // Numeric constraints
    const mintAmountNum = parseFloat(mintAmount);
    const maxMintCountNum = parseInt(maxMintCount);
    const priceNum = parseFloat(price);

    if (isNaN(mintAmountNum) || mintAmountNum < 1) {
      return res.status(400).json({
        error: "Invalid mintAmount",
        message: "mintAmount must be a number greater than or equal to 1",
      });
    }

    if (isNaN(maxMintCountNum) || maxMintCountNum < 10) {
      return res.status(400).json({
        error: "Invalid maxMintCount",
        message: "maxMintCount must be an integer greater than or equal to 10",
      });
    }

    if (isNaN(priceNum) || priceNum < 1) {
      return res.status(400).json({
        error: "Invalid price",
        message: "price must be a number greater than or equal to 1",
      });
    }

    // Payment token validation
    if (paymentToken !== 'USDC' && paymentToken !== 'USDT') {
      return res.status(400).json({
        error: "Invalid payment token",
        message: "paymentToken must be either 'USDC' or 'USDT'",
      });
    }

    // 🔒 Acquire advisory lock to prevent concurrent deployments
    // Use a deployment-specific lock ID
    const lockId = getAdvisoryLockId('token-deployment-global');
    
    await client.query('BEGIN');
    const lockResult = await client.query('SELECT pg_try_advisory_xact_lock($1) as acquired', [lockId.toString()]);
    
    if (!lockResult.rows[0].acquired) {
      await client.query('ROLLBACK');
      return res.status(503).json({
        error: "Deployment in progress",
        message: "Another token is currently being deployed. Please wait a moment and try again.",
        retryAfter: 5, // Suggest retry after 5 seconds
      });
    }
    
    // Verify authorization is to our address and for correct amount
    const usdcAddress = network === 'base-sepolia' 
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;

    if (getAddress(authorization.to) !== getAddress(account.address)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: "Invalid payment recipient",
        message: `Payment must be sent to ${account.address}`,
      });
    }

    if (BigInt(authorization.value) !== DEPLOY_FEE_USDC) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: "Invalid payment amount",
        message: `Payment must be exactly 10 USDC (${DEPLOY_FEE_USDC.toString()} wei)`,
      });
    }

    // Create deployment config
    const deployConfig: TokenDeployConfig = {
      name,
      symbol,
      mintAmount: mintAmount.toString(),
      maxMintCount: parseInt(maxMintCount),
      price: price.toString(),
      paymentToken: paymentToken === 'USDT' ? 'USDT' : 'USDC',
      network,
      deployer: normalizedDeployer,
      excessRecipient: excessRecipient,
      imageUrl: imageUrl || undefined,
      description: description || undefined,
    };

    // Add payment to queue (will trigger deployment after payment succeeds)
    const paymentId = await paymentQueueProcessor.addToQueue(
      'deploy',
      authorization,
      normalizedDeployer,
      DEPLOY_FEE_USDC.toString(),
      usdcAddress,
      undefined, // No token address yet (will be created after deployment)
      { deployConfig } // Store deployment config in metadata
    );

    // Commit transaction and release lock
    await client.query('COMMIT');

    // Return payment ID for status polling
    return res.status(202).json({
      success: true,
      message: "Deployment payment queued. Token will be deployed after payment completes.",
      paymentId,
      paymentStatus: "pending",
      statusUrl: `${req.protocol}://${req.get('host')}/api/payment/${paymentId}`,
      estimatedSeconds: 5, // Rough estimate for payment processing
    });
  } catch (error: any) {
    // Rollback transaction and release lock
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Rollback failed
    }
    
    return res.status(500).json({
      error: "Deployment failed",
      message: error.message,
    });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});

/**
 * GET /api/tokens - Get all deployed tokens (with Redis cache)
 */
app.get("/api/tokens", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: "Database not configured",
    });
  }

  try {
    const { 
      deployer, 
      limit = 50, 
      offset = 0,
      search,
      sortBy,
      withTotal
    } = req.query;
    
    // Cache key includes all query params for proper cache isolation
    const cacheKey = `tokens:${network}:${deployer || 'all'}:${limit}:${offset}:${search || 'none'}:${sortBy || 'default'}:${withTotal || 'false'}`;
    const cacheTTL = parseInt(process.env.TOKENS_CACHE_TTL || '30'); // 30 seconds default
    
    // Try cache first
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (cacheErr: any) {
        // Redis read error
      }
    }

    const result = await getAllTokens(pool, {
      network,
      deployer: deployer as string,
      isActive: true,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      search: search as string,
      sortBy: (sortBy as 'mintCount' | 'created' | 'volume') || 'mintCount',
      withTotal: withTotal === 'true',
    });

    // Handle both array and object return types
    const tokens = Array.isArray(result) ? result : result.tokens;

    if (tokens.length === 0) {
      return res.json({ tokens: [], total: 0 });
    }

    // ⚡️ OPTIMIZATION: Use multicall to batch read all chain data in 1 RPC call
    const contracts = tokens.flatMap(token => [
      {
        address: token.address as `0x${string}`,
        abi: tokenAbi,
        functionName: "mintCount" as const,
      },
      {
        address: token.address as `0x${string}`,
        abi: tokenAbi,
        functionName: "liquidityDeployed" as const,
      }
    ]);

    let chainResults: any[] = [];
    try {
      // Batch read all chain data (200 calls → 1 call!)
      chainResults = await publicClient.multicall({ contracts, allowFailure: true });
    } catch (err: any) {
      // Multicall failed, using DB fallback
    }

    // Format tokens with chain data
    const formattedTokens = tokens.map((token, i) => {
      let mintCount = token.mint_count; // DB fallback
      let liquidityDeployed = token.liquidity_deployed; // DB fallback

      // Extract multicall results (2 calls per token)
      if (chainResults.length > i * 2) {
        const mintCountResult = chainResults[i * 2];
        const lpResult = chainResults[i * 2 + 1];
        
        if (mintCountResult.status === 'success' && mintCountResult.result !== undefined) {
          mintCount = Number(mintCountResult.result);
        }
        if (lpResult.status === 'success' && lpResult.result !== undefined) {
          liquidityDeployed = lpResult.result as boolean;
        }
      }

      // Calculate 24h USDC volume (now from optimized DB query)
      const mintCount24h = parseInt(token.mint_count_24h || '0');
      const priceMatch = token.price ? token.price.match(/[\d.]+/) : null;
      const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 0;
      const volume24hUSDC = mintCount24h * pricePerMint;

      return {
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        deployer: token.deployer_address,
        mintAmount: token.mint_amount,
        maxMintCount: token.max_mint_count,
        mintCount, // From chain or DB
        mintCount24h,
        volume24hUSDC,
        price: token.price,
        paymentToken: token.payment_token_symbol,
        network: token.network,
        liquidityDeployed,
        createdAt: token.created_at,
        mintUrl: `/mint/${token.address}`,
        logoUrl: token.logo_url || null,
      };
    });

    // Note: Sorting is now done in SQL query for better performance
    // (launched tokens first, then by mint count or volume)

    const response = {
      tokens: formattedTokens,
      total: !Array.isArray(result) ? result.total : formattedTokens.length,
    };
    
    // Store in cache
    if (redis) {
      try {
        await redis.setex(cacheKey, cacheTTL, JSON.stringify(response));
      } catch (cacheErr: any) {
        // Redis write error
      }
    }

    return res.json(response);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch tokens",
      message: error.message,
    });
  }
});

/**
 * GET /api/tokens/:address - Get specific token info (with cache - 1 minute TTL)
 */
app.get("/api/tokens/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const tokenContractAddress = address as `0x${string}`;
    
    // Cache key for individual token
    const cacheKey = `token:${network}:${address.toLowerCase()}`;
    const cacheTTL = parseInt(process.env.TOKEN_CACHE_TTL || '60'); // 60 seconds (1 minute) default
    
    // Try Redis cache first
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          console.log(`✅ Cache hit (Redis): ${address}`);
          return res.json(JSON.parse(cached));
        }
      } catch (cacheErr: any) {
        console.warn(`⚠️  Redis cache error: ${cacheErr.message}`);
      }
    }
    
    // Try in-memory cache as fallback
    const memCacheEntry = tokenInfoCache.get(cacheKey);
    if (memCacheEntry && memCacheEntry.expiry > Date.now()) {
      console.log(`✅ Cache hit (Memory): ${address}`);
      return res.json(memCacheEntry.data);
    }

    // Fetch on-chain data
    const [mintAmount, maxSupply, totalSupply, remainingSupply, mintCount, maxMintCount, liquidityDeployed] = 
      await Promise.all([
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "mintAmount",
        }),
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "maxSupply",
        }),
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "totalSupply",
        }),
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "remainingSupply",
        }),
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "mintCount",
        }),
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "maxMintCount",
        }),
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "liquidityDeployed",
        }),
      ]);

    const mintProgress = Number(mintCount) / Number(maxMintCount) * 100;

    // Get database info if available
    let dbToken = null;
    if (pool) {
      dbToken = await getToken(pool, address);
    }

    // Get decimals from contract (new X402Tokens use 6 decimals)
    let decimals = 6; // Default to 6 decimals
    try {
      const decimalsResult = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: tokenAbi,
        functionName: 'decimals',
      }) as number;
      decimals = decimalsResult;
    } catch (err) {
      console.warn(`Failed to read decimals for ${address}, using default 6:`, err);
    }

    const response = {
      address: address,
      name: dbToken?.name || "Unknown Token",
      symbol: dbToken?.symbol || "???",
      tokensPerMint: mintAmount.toString(),
      maxSupply: maxSupply.toString(),
      totalSupply: totalSupply.toString(),
      remainingSupply: remainingSupply.toString(),
      mintCount: mintCount.toString(),
      maxMintCount: maxMintCount.toString(),
      mintProgress: `${mintProgress.toFixed(2)}%`,
      liquidityDeployed,
      network,
      price: dbToken?.price || "1 USDC",
      paymentToken: dbToken?.payment_token_symbol || "USDC",
      deployer: dbToken?.deployer_address,
      paymentAddress: address, // USDC should be sent to token contract
      logoUrl: dbToken?.logo_url || null,
      decimals, // Token decimals (6 for new X402Tokens, 18 for old ones)
    };
    
    // Store in Redis cache
    if (redis) {
      try {
        await redis.setex(cacheKey, cacheTTL, JSON.stringify(response));
        console.log(`💾 Cached in Redis: ${address} (TTL: ${cacheTTL}s)`);
      } catch (cacheErr: any) {
        console.warn(`⚠️  Redis cache write error: ${cacheErr.message}`);
      }
    }
    
    // Store in memory cache as fallback
    tokenInfoCache.set(cacheKey, {
      data: response,
      expiry: Date.now() + TOKEN_CACHE_TTL_MS
    });
    console.log(`💾 Cached in Memory: ${address} (TTL: 60s)`);

    return res.json(response);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch token info",
      message: error.message,
    });
  }
});

/**
 * POST /api/mint/:address - Mint tokens (with gasless support)
 * Supports both x402 and traditional EIP-3009 payment methods
 */
app.post("/api/mint/:address", async (req, res) => {
  try {
    const { address: tokenAddress } = req.params;
    const tokenContractAddress = tokenAddress as `0x${string}`;
    const quantity = req.body.quantity || 1; // Support batch minting
    
    console.log(`📦 Request quantity: ${quantity}, body:`, JSON.stringify(req.body));
    
    if (quantity < 1 || quantity > 10) {
      return res.status(400).json({
        error: "Invalid quantity",
        message: "Quantity must be between 1 and 10",
      });
    }
    
    // 🔒 SECURITY: Payment verification is REQUIRED
    // Check payment method: x402 (X-PAYMENT header) or traditional (authorization body)
    const paymentHeader = req.headers['x-payment'] as string | undefined;
    const authorization = req.body.authorization;
    
    // Determine payment mode
    const useX402 = !!paymentHeader && x402Enabled;
    const useTraditional = !!authorization;
    
    // If no payment provided, return 402 Payment Required (x402 format)
    if (!useX402 && !useTraditional) {
      // Get token price for 402 response
      let tokenPrice = "1 USDC";
      if (pool) {
        const dbToken = await getToken(pool, tokenAddress);
        if (dbToken) {
          tokenPrice = dbToken.price;
        }
      }
      
      const priceMatch = tokenPrice.match(/[\d.]+/);
      const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 1;
      const totalPrice = pricePerMint * quantity;
      const totalPriceWei = BigInt(Math.floor(totalPrice * 1e6)); // USDC wei (6 decimals)
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      // Generate payment requirements using shared function
      const paymentRequirements = generatePaymentRequirements(
        tokenAddress,
        quantity,
        totalPrice,
        totalPriceWei,
        baseUrl
      );
      
      // x402-fetch expects this exact format:
      // { x402Version: 1, accepts: [PaymentRequirements] }
      const x402Response = {
        x402Version: 1,
        accepts: [paymentRequirements], // Array of payment options
      };
      
      // Return 402 with x402 standard format
      // Set x402 version header for client detection
      res.setHeader('X-Payment-Required', 'x402');
      res.setHeader('X-Payment-Version', '1');
      return res.status(402).json(x402Response);
    }
    
    // Validate traditional payment has signature
    if (useTraditional && (!authorization || !authorization.signature)) {
      return res.status(400).json({
        error: "Invalid payment authorization",
        message: "Traditional payment requires authorization with signature",
      });
    }
    
    // 🚀 ALL PAYMENTS MUST USE X402
    if (!useX402) {
      return res.status(400).json({
        error: "x402 payment required",
        message: "All payments must use x402 protocol",
      });
    }

    let payer: `0x${string}`;
      
      // Get token price for x402 verification
      let expectedPrice: bigint;
      if (pool) {
        const dbToken = await getToken(pool, tokenAddress);
        if (dbToken) {
          const priceMatch = dbToken.price.match(/[\d.]+/);
          if (priceMatch) {
            const priceInUSDC = parseFloat(priceMatch[0]);
            expectedPrice = BigInt(Math.floor(priceInUSDC * 1e6)) * BigInt(quantity);
          } else {
            expectedPrice = BigInt(1e6) * BigInt(quantity); // Default 1 USDC per mint
          }
        } else {
          expectedPrice = BigInt(1e6) * BigInt(quantity);
        }
      } else {
        expectedPrice = BigInt(1e6) * BigInt(quantity);
      }
      
      // Decode payment header to get payer
      const paymentPayload = JSON.parse(Buffer.from(paymentHeader!, 'base64').toString('utf-8'));
      payer = paymentPayload.payload?.authorization?.from as `0x${string}`;
      
      // First verify the payment
      console.log(`💰 Expected price: ${expectedPrice} wei for quantity ${quantity}`);
      const verifyResult = await verifyX402Payment(paymentHeader!, tokenAddress, expectedPrice, quantity, req);
      
      if (!verifyResult.valid) {
        return res.status(400).json({
          error: "x402 payment verification failed",
          message: verifyResult.error || "Payment signature or parameters invalid",
        });
      }
      
    // 🔒 SECURE X402 ASYNC MODE: Payment FIRST, then mints via callback
    // Extract authorization from x402 payment

    const paymentAuth = paymentPayload.payload?.authorization;
    const paymentSignature = paymentPayload.payload?.signature;
    
    if (!paymentAuth) {
      return res.status(400).json({
        error: "Invalid x402 payment",
        message: "Missing authorization in payment payload",
      });
    }
    
    // 🛡️ RATE LIMITING: Check pending payments for this user
    if (pool) {
      try {
        const pendingCountResult = await pool.query(
          `SELECT COUNT(*) as count FROM payment_queue 
           WHERE payer = $1 AND status IN ('pending', 'processing', 'sent')`,
          [payer]
        );
        const pendingCount = parseInt(pendingCountResult.rows[0].count);
        const maxPendingPerUser = 10; // Max 10 pending payments per user
        
        if (pendingCount >= maxPendingPerUser) {
          console.log(`🚫 Rate limit: User ${payer} has ${pendingCount} pending payments`);
          return res.status(429).json({
            error: "Too many pending payments",
            message: `You have ${pendingCount} pending payments. Please wait for them to complete.`,
            pendingCount,
          });
        }
      } catch (rateLimitError: any) {
        console.error('⚠️ Rate limit check failed:', rateLimitError.message);
        // Don't block the request if rate limit check fails
      }
    }
    
    // Combine authorization and signature for payment processor
    const authorizationWithSignature = {
      ...paymentAuth,
      signature: paymentSignature, // Add signature to authorization object
    };

    // Get payment token address
    let paymentTokenAddress: `0x${string}`;
    if (pool) {
      const dbToken = await getToken(pool, tokenAddress);
      if (dbToken) {
        paymentTokenAddress = dbToken.payment_token_address as `0x${string}`;
      } else {
        paymentTokenAddress = network === 'base-sepolia' 
          ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
          : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
      }
    } else {
      paymentTokenAddress = network === 'base-sepolia' 
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
    }

    // 🔒 CRITICAL: Add payment to queue FIRST
    // Mints will be created by payment callback ONLY after payment is confirmed on-chain
    try {
      const paymentQueueId = await paymentQueueProcessor.addToQueue(
        'mint',
        authorizationWithSignature, // Include signature for payment processor
        payer,
        expectedPrice.toString(),
        paymentTokenAddress,
        tokenAddress,
        { 
          quantity, 
          mode: 'x402',
          paymentHeader, // Store full payment header for mint creation
          timestamp: Date.now(), // For generating mint txHashes in callback
        }
      );

      console.log(`✅ X402 payment queued: ${paymentQueueId} (${quantity}x mint will be created after payment confirms)`);
      
      // ✅ IMMEDIATE RETURN - Payment processes in background
      // Mints will be created ONLY after payment is confirmed (via callback)
      return res.status(202).json({ // 202 Accepted
        success: true,
        message: `Payment queued - ${quantity}x mint will start after payment confirms`,
        paymentQueueId,
        quantity,
        payer,
        paymentMode: 'x402',
        status: 'payment_pending',
        note: 'Poll /api/payment/:paymentQueueId for status. Mints will be created automatically after payment confirms.',
      });
      
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to queue payment",
        message: error.message,
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      error: "Mint failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/payment/:paymentId - Get payment status
 */
app.get("/api/payment/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    const status = await paymentQueueProcessor.getPaymentStatus(paymentId);
    
    if (!status) {
      return res.status(404).json({
        error: "Payment not found",
      });
    }

    // Format response
    const response: any = {
      paymentId: status.id,
      paymentType: status.payment_type,
      status: status.status,
      payer: status.payer,
      amount: status.amount,
      paymentTokenAddress: status.payment_token_address,
      txHash: status.tx_hash,
      error: status.error,
      createdAt: status.created_at,
      processedAt: status.processed_at,
    };

    // Include deployment result if available
    if (status.result) {
      response.result = status.result;
      
      // For deploy payments, add convenient fields
      if (status.payment_type === 'deploy' && status.result.tokenAddress) {
        response.tokenAddress = status.result.tokenAddress;
        response.deployTxHash = status.result.deployTxHash;
        response.mintUrl = `${req.protocol}://${req.get('host')}/mint/${status.result.tokenAddress}`;
      }
    }

    return res.json(response);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch payment status",
      message: error.message,
    });
  }
});

/**
 * GET /api/payment/stats - Get payment queue statistics
 */
app.get("/api/payment/stats", async (req, res) => {
  try {
    const stats = await paymentQueueProcessor.getStats();
    return res.json(stats);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch payment stats",
      message: error.message,
    });
  }
});

/**
 * GET /api/queue/:queueId - Get queue item status
 */
app.get("/api/queue/:queueId", async (req, res) => {
  try {
    const { queueId } = req.params;
    const status = await queueProcessor.getQueueStatus(queueId);
    
    if (!status) {
      return res.status(404).json({
        error: "Queue item not found",
      });
    }

    return res.json(status);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch queue status",
      message: error.message,
    });
  }
});

/**
 * GET /api/queue/stats - Get queue statistics
 */
app.get("/api/queue/stats", async (req, res) => {
  try {
    const stats = await queueProcessor.getQueueStats();
    return res.json(stats);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch queue stats",
      message: error.message,
    });
  }
});

// ==================== User & Points System APIs ====================

/**
 * Get or create user by wallet address
 * GET /api/user/:address
 */
app.get("/api/user/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const user = await userService.getOrCreateUser(address);
    
    return res.json({
      success: true,
      user,
    });
  } catch (error: any) {
    console.error("Error fetching user:", error);
    return res.status(500).json({
      error: "Failed to fetch user",
      message: error.message,
    });
  }
});

/**
 * Use invitation code
 * POST /api/user/:address/invite
 * Body: { invitationCode: string }
 */
app.post("/api/user/:address/invite", async (req, res) => {
  try {
    const { address } = req.params;
    const { invitationCode } = req.body;

    if (!isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    if (!invitationCode || typeof invitationCode !== 'string') {
      return res.status(400).json({ error: "Invitation code is required" });
    }

    // Ensure user exists
    await userService.getOrCreateUser(address);

    // Use invitation code
    const result = await userService.useInvitationCode(address, invitationCode);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    return res.json(result);
  } catch (error: any) {
    console.error("Error using invitation code:", error);
    return res.status(500).json({
      error: "Failed to use invitation code",
      message: error.message,
    });
  }
});

/**
 * Get user rank
 * GET /api/user/:address/rank
 */
app.get("/api/user/:address/rank", async (req, res) => {
  try {
    const { address } = req.params;

    if (!isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const rank = await userService.getUserRank(address);

    if (rank === null) {
      return res.status(404).json({ error: "User not found in rankings" });
    }

    return res.json({
      success: true,
      rank,
    });
  } catch (error: any) {
    console.error("Error fetching user rank:", error);
    return res.status(500).json({
      error: "Failed to fetch user rank",
      message: error.message,
    });
  }
});

/**
 * Get user's referrals
 * GET /api/user/:address/referrals
 */
app.get("/api/user/:address/referrals", async (req, res) => {
  try {
    const { address } = req.params;

    if (!isAddress(address)) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    const referrals = await userService.getUserReferrals(address);

    return res.json({
      success: true,
      count: referrals.length,
      referrals,
    });
  } catch (error: any) {
    console.error("Error fetching referrals:", error);
    return res.status(500).json({
      error: "Failed to fetch referrals",
      message: error.message,
    });
  }
});

/**
 * Get leaderboard
 * GET /api/leaderboard
 * Query params: limit (default: 100), offset (default: 0)
 */
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const leaderboard = await userService.getLeaderboard(limit, offset);
    const stats = await userService.getLeaderboardStats();

    return res.json({
      success: true,
      stats,
      leaderboard,
      pagination: {
        limit,
        offset,
        total: stats.total_users,
      },
    });
  } catch (error: any) {
    console.error("Error fetching leaderboard:", error);
    return res.status(500).json({
      error: "Failed to fetch leaderboard",
      message: error.message,
    });
  }
});

/**
 * Get leaderboard stats only
 * GET /api/leaderboard/stats
 */
app.get("/api/leaderboard/stats", async (req, res) => {
  try {
    const stats = await userService.getLeaderboardStats();

    return res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error("Error fetching leaderboard stats:", error);
    return res.status(500).json({
      error: "Failed to fetch leaderboard stats",
      message: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    network,
    database: true,
    redis: redis?.status === 'ready',
    queueProcessor: "enabled",
  });
});

const PORT = process.env.PORT || 4021;

async function start() {
  // Initialize Redis
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });
    await redis.connect();
  } catch (err: any) {
    redis = null;
  }

  // Initialize database
  try {
    await initDatabase(pool);
  } catch (error) {
    process.exit(1);
  }

  // Initialize user service
  userService = new UserService(pool, redis);

  // Initialize queue processor with userService
  queueProcessor = new MintQueueProcessor(
    pool,
    minterWalletClient,  // Use MINTER wallet, not SERVER wallet
    publicClient,
    minterAccount,       // Account for nonce management
    undefined,           // No default token for multi-token mode
    userService          // Pass userService for automatic points update
  );

  // Start queue processors
  await queueProcessor.start();
  await paymentQueueProcessor.start();

  // Get actual queue config from database
  let mintQueueConfigDisplay = "enabled";
  let paymentQueueConfigDisplay = "enabled";
  try {
    const configResult = await pool.query(`
      SELECT key, value FROM system_settings 
      WHERE key IN ('batch_interval_seconds', 'payment_batch_interval_ms')
    `);
    configResult.rows.forEach(row => {
      const interval = parseInt(row.value);
      if (row.key === 'batch_interval_seconds') {
        mintQueueConfigDisplay = `✅ Enabled (batch every ${interval}s)`;
      } else if (row.key === 'payment_batch_interval_ms') {
        paymentQueueConfigDisplay = `✅ Enabled (batch every ${interval}ms)`;
      }
    });
  } catch (e) {
    mintQueueConfigDisplay = "✅ Enabled";
    paymentQueueConfigDisplay = "✅ Enabled";
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Multi-Token Mint Server Started`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Network: ${network}`);
    console.log(`   Database: ✅ Connected`);
    console.log(`   Redis: ${redis ? '✅ Connected' : '⚠️  Disabled'}`);
    console.log(`\n💰 Wallet Configuration:`);
    console.log(`   SERVER (USDC payments): ${serverAccount.address}`);
    console.log(`   MINTER (mint execution): ${minterAccount.address}`);
    console.log(`\n⚙️  Queue Processors:`);
    console.log(`   Payment Queue: ${paymentQueueConfigDisplay}`);
    console.log(`   Mint Queue: ${mintQueueConfigDisplay}`);
    console.log(`   x402: ${x402Enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(``);
  });
}

start().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  queueProcessor.stop();
  paymentQueueProcessor.stop();
  if (redis) await redis.quit();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  queueProcessor.stop();
  paymentQueueProcessor.stop();
  if (redis) await redis.quit();
  await pool.end();
  process.exit(0);
});

