import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, decodeEventLog, keccak256, toHex, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";
import { initDatabase, checkDatabaseConnection } from "./db/init";
import { MintQueueProcessor } from "./queue/processor";

config();

// Environment variables
const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const tokenContractAddress = process.env.TOKEN_CONTRACT_ADDRESS as `0x${string}`;
const usdcContractAddress = process.env.USDC_CONTRACT_ADDRESS as `0x${string}`;
const payTo = process.env.PAY_TO_ADDRESS as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const requiredPayment = process.env.REQUIRED_PAYMENT_USDC || "1"; // USDC amount
const databaseUrl = process.env.DATABASE_URL;

// CDP API keys (required for mainnet)
const cdpApiKeyId = process.env.CDP_API_KEY_ID;
const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;

// Validation
if (!serverPrivateKey || !tokenContractAddress || !payTo) {
  console.error("Missing required environment variables:");
  console.error("- SERVER_PRIVATE_KEY (for calling contract as MINTER_ROLE)");
  console.error("- TOKEN_CONTRACT_ADDRESS");
  console.error("- PAY_TO_ADDRESS (where you receive USDC)");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("Missing DATABASE_URL environment variable");
  console.error("Example: postgresql://user:password@localhost:5432/token_mint");
  process.exit(1);
}

// Validate CDP API keys for mainnet
if (network === "base" && (!cdpApiKeyId || !cdpApiKeySecret)) {
  console.error("⚠️  Warning: CDP API keys not configured for mainnet!");
  console.error("For mainnet (base), you need:");
  console.error("- CDP_API_KEY_ID");
  console.error("- CDP_API_KEY_SECRET");
  console.error("\nGet your API keys at: https://portal.cdp.coinbase.com/");
  console.error("\nFor testnet, you can use the public facilitator without API keys.");
  process.exit(1);
}

// PostgreSQL connection
const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Viem setup
const chain = network === "base-sepolia" ? baseSepolia : base;
const account = privateKeyToAccount(serverPrivateKey);

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

// Contract ABIs
const tokenAbi = parseAbi([
  "function mint(address to, bytes32 txHash) external",
  "function batchMint(address[] memory to, bytes32[] memory txHashes) public",
  "function hasMinted(bytes32 txHash) view returns (bool)",
  "function mintAmount() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function remainingSupply() view returns (uint256)",
  "function mintCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function liquidityDeployed() view returns (bool)",
  "event TokensMinted(address indexed to, uint256 amount, bytes32 txHash)",
]);

const usdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

// Initialize queue processor
const queueProcessor = new MintQueueProcessor(
  pool,
  walletClient,
  publicClient,
  tokenContractAddress
);

const app = express();

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-PAYMENT'],
}));

app.use(express.json());

/**
 * Helper: Verify USDC payment transaction
 */
async function verifyUSDCPayment(txHash: `0x${string}`, expectedPayer: `0x${string}`, expectedAmount: bigint) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  
  if (!receipt || receipt.status !== "success") {
    throw new Error("Transaction not found or failed");
  }

  // Check USDC transfer event
  const transferEvent = receipt.logs.find((log) => {
    try {
      const decoded = decodeEventLog({
        abi: usdcAbi,
        data: log.data,
        topics: log.topics,
      });
      return (
        decoded.eventName === "Transfer" &&
        decoded.args.from?.toLowerCase() === expectedPayer.toLowerCase() &&
        decoded.args.to?.toLowerCase() === payTo.toLowerCase() &&
        decoded.args.value >= expectedAmount
      );
    } catch {
      return false;
    }
  });

  if (!transferEvent) {
    throw new Error("Valid USDC payment not found in transaction");
  }

  return true;
}

/**
 * Generate a unique transaction hash for minting
 */
function generateMintTxHash(payer: string, timestamp: number): `0x${string}` {
  const data = `${payer}-${timestamp}`;
  const hash = keccak256(toHex(data));
  return hash as `0x${string}`;
}

/**
 * Verify custom X-PAYMENT header
 */
async function verifyCustomPayment(paymentHeader: string): Promise<{
  valid: boolean;
  txHash?: string;
  payer?: string;
  error?: string;
}> {
  try {
    const proofJson = Buffer.from(paymentHeader, 'base64').toString('utf8');
    const proof = JSON.parse(proofJson);
    
    if (proof.type !== 'transaction') {
      return { valid: false, error: 'Invalid payment type' };
    }
    
    const { txHash, payer } = proof;
    
    if (!txHash || !payer) {
      return { valid: false, error: 'Missing txHash or payer' };
    }
    
    // Verify USDC payment on-chain
    if (usdcContractAddress) {
      const requiredAmountWei = parseUnits(requiredPayment, 6);
      try {
        await verifyUSDCPayment(txHash as `0x${string}`, payer as `0x${string}`, requiredAmountWei);
        return { valid: true, txHash, payer };
      } catch (error: any) {
        return { valid: false, error: error.message };
      }
    }
    
    return { valid: true, txHash, payer };
  } catch (error: any) {
    return { valid: false, error: `Failed to parse payment: ${error.message}` };
  }
}

/**
 * Custom middleware to handle our simplified x402 payment
 */
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/mint') {
    if (req.headers['x-payment'] || (req.body && req.body.authorization)) {
      console.log('🔓 Bypassing x402 middleware - custom payment or gasless mode detected');
      (req as any).skipX402Middleware = true;
    }
  }
  next();
});

/**
 * Configure facilitator based on network
 */
const facilitatorConfig = network === "base-sepolia" 
  ? { url: "https://x402.org/facilitator" }
  : facilitator;

/**
 * x402 Payment Middleware
 */
app.use((req, res, next) => {
  if ((req as any).skipX402Middleware) {
    return next();
  }
  
  return paymentMiddleware(
    payTo,
    {
      "POST /mint": {
        price: `$${requiredPayment}`,
        network: network,
        config: {
          description: `Mint tokens - Pay ${requiredPayment} USDC`,
          mimeType: "application/json",
          maxTimeoutSeconds: 120,
          inputSchema: {
            type: "object",
            properties: {
              payer: {
                type: "string",
                description: "Ethereum address that will receive the minted tokens"
              }
            },
            required: ["payer"]
          },
          outputSchema: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              queueId: { type: "string" },
              queuePosition: { type: "number" },
              payer: { type: "string" },
              estimatedWaitSeconds: { type: "number" }
            }
          }
        }
      }
    },
    facilitatorConfig
  )(req, res, next);
});

/**
 * Main mint endpoint - adds request to queue
 */
app.post("/mint", async (req, res) => {
  console.log(`\n🎨 POST /mint received`);
  console.log(`   Headers:`, Object.keys(req.headers));
  console.log(`   Body:`, req.body);
  
  try {
    let payer: `0x${string}`;
    let paymentTxHash: string | undefined;
    let isGasless = false;
    let authorizationData: any = null;
    
    // Check if this is a gasless request with EIP-3009 authorization
    const authorization = req.body.authorization;
    
    if (authorization && authorization.signature) {
      // Gasless mode: Use EIP-3009 receiveWithAuthorization
      console.log(`🆓 Gasless mint request detected (EIP-3009)`);
      console.log(`   From: ${authorization.from}`);
      console.log(`   To: ${authorization.to}`);
      console.log(`   Value: ${authorization.value}`);
      
      payer = authorization.from as `0x${string}`;
      isGasless = true;
      authorizationData = authorization;
      
      // Validate addresses
      if (!authorization.from || !authorization.to) {
        throw new Error('Missing from or to address in authorization');
      }
      
      // Ensure addresses are in checksum format
      try {
        const fromChecksummed = getAddress(authorization.from);
        const toChecksummed = getAddress(authorization.to);
        
        authorizationData.from = fromChecksummed;
        authorizationData.to = toChecksummed;
        
        console.log(`   ✅ Addresses validated and checksummed`);
      } catch (err: any) {
        throw new Error(`Invalid address format: ${err.message}`);
      }
      
      // Execute transferWithAuthorization to transfer USDC (server pays gas)
      try {
        console.log(`💸 Executing transferWithAuthorization...`);
        
        // Split signature into v, r, s components
        const sig = authorization.signature.startsWith('0x') 
          ? authorization.signature.slice(2) 
          : authorization.signature;
        
        if (sig.length !== 130) {
          throw new Error(`Invalid signature length: ${sig.length}. Expected 130 hex characters (65 bytes)`);
        }
        
        const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
        const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
        let v = parseInt(sig.slice(128, 130), 16);
        
        // Normalize v to 27 or 28
        if (v === 0 || v === 1) {
          v = v + 27;
        } else if (v !== 27 && v !== 28) {
          const recoveryId = v >= 35 ? ((v - 35) % 2) : (v % 2);
          v = 27 + recoveryId;
        }
        
        if (v !== 27 && v !== 28) {
          throw new Error(`Invalid v value: ${v}. Expected 27 or 28 after normalization.`);
        }
        
        const gasPrice = await publicClient.getGasPrice();
        const gasPriceWithBuffer = gasPrice > 0n ? (gasPrice * 150n) / 100n : 1000000n;
        
        const authHash = await walletClient.writeContract({
          address: usdcContractAddress,
          abi: usdcAbi,
          functionName: "transferWithAuthorization",
          args: [
            authorizationData.from as `0x${string}`,
            authorizationData.to as `0x${string}`,
            BigInt(authorization.value),
            BigInt(authorization.validAfter),
            BigInt(authorization.validBefore),
            authorization.nonce as `0x${string}`,
            v,
            r,
            s,
          ],
          gas: 200000n,
          gasPrice: gasPriceWithBuffer,
        });
        
        console.log(`✅ USDC transfer authorization executed: ${authHash}`);
        console.log(`   Waiting for confirmation...`);
        
        const authReceipt = await publicClient.waitForTransactionReceipt({ 
          hash: authHash,
          confirmations: 1,
          timeout: 60_000,
        });
        
        if (authReceipt.status !== "success") {
          throw new Error(`USDC transfer transaction reverted. TX: ${authHash}`);
        }
        
        console.log(`✅ USDC transfer confirmed at block ${authReceipt.blockNumber}`);
        paymentTxHash = authHash;
      } catch (error: any) {
        console.error("❌ transferWithAuthorization failed:", error.message);
        
        let errorDetails = "Failed to execute EIP-3009 transferWithAuthorization. ";
        
        if (error.message?.includes("reverted")) {
          errorDetails += "Transaction was reverted on-chain. Common causes: ";
          errorDetails += "1) Invalid signature, ";
          errorDetails += "2) Nonce already used, ";
          errorDetails += "3) Authorization expired, ";
          errorDetails += "4) Insufficient balance.";
        } else if (error.message?.includes("insufficient funds")) {
          errorDetails += "Server wallet has insufficient ETH for gas fees.";
        }
        
        return res.status(400).json({
          error: "USDC transfer failed",
          message: error.message,
          details: errorDetails,
        });
      }
    } else {
      // Not gasless mode, check other payment methods
      const x402Payment = (req as any).x402Payment;
    
      if (x402Payment && x402Payment.payer) {
        payer = x402Payment.payer as `0x${string}`;
        console.log(`✅ Payment verified via x402 middleware for ${payer}`);
      } else {
        // Check for custom X-PAYMENT header
        const customPayment = req.headers['x-payment'] as string;
        
        if (customPayment) {
          const verification = await verifyCustomPayment(customPayment);
          
          if (verification.valid) {
            payer = verification.payer as `0x${string}`;
            paymentTxHash = verification.txHash;
            console.log(`✅ Custom payment verified for ${payer}`);
          } else {
            payer = req.body.payer as `0x${string}`;
            
            if (!payer) {
              return res.status(400).json({
                error: "Payment verification incomplete",
                message: "X-PAYMENT header exists but payment not verified, and no payer in body",
                details: verification.error,
              });
            }
            
            console.log(`⚠️  Using payer from body: ${payer}`);
          }
        } else {
          payer = req.body.payer as `0x${string}`;
          
          if (!payer) {
            return res.status(400).json({
              error: "Missing payer address",
              message: "Payer must be provided in request body or via x402 payment",
            });
          }
          
          console.log(`💳 Using payer from body: ${payer}`);
        }
      }
    }

    // Generate unique transaction hash for this mint
    const timestamp = Date.now();
    const txHashBytes32 = generateMintTxHash(payer, timestamp);

    // Check if already minted on-chain (safety check)
    const alreadyMinted = await publicClient.readContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "hasMinted",
      args: [txHashBytes32],
    });

    if (alreadyMinted) {
      return res.status(200).json({
        success: true,
        message: "Tokens already minted",
        payer,
      });
    }

    // Add to queue
    const paymentType = isGasless ? "gasless" : (paymentTxHash ? "custom" : "x402");
    const queueId = await queueProcessor.addToQueue(
      payer,
      txHashBytes32,
      paymentTxHash,
      authorizationData,
      paymentType
    );

    // Get queue stats for estimated wait time
    const stats = await queueProcessor.getQueueStats();
    const queuePosition = stats.pending_count;
    const estimatedWaitSeconds = Math.ceil(queuePosition / 50) * 10; // Assuming 50 per batch, 10s interval

    return res.status(200).json({
      success: true,
      message: "Mint request added to queue",
      queueId,
      queuePosition,
      payer,
      estimatedWaitSeconds,
      paymentType,
    });
  } catch (error: any) {
    console.error("❌ Mint error:", error.message);
    
    if (error.message?.includes("Already minted")) {
      return res.status(200).json({
        success: true,
        message: "Tokens already minted",
      });
    }
    
    if (error.message?.includes("Insufficient supply")) {
      return res.status(400).json({
        error: "Maximum supply reached",
        message: "Cannot mint more tokens, supply cap has been reached",
      });
    }
    
    return res.status(500).json({
      error: "Failed to add mint to queue",
      details: error.message,
    });
  }
});

/**
 * Queue status endpoint
 */
app.get("/queue/status", async (req, res) => {
  try {
    const stats = await queueProcessor.getQueueStats();
    const recentBatches = await queueProcessor.getRecentBatches(5);
    
    return res.json({
      stats,
      recentBatches,
      batchInterval: 10,
      maxBatchSize: 50,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to get queue status",
      details: error.message,
    });
  }
});

/**
 * Check status for specific payer
 */
app.get("/queue/payer/:address", async (req, res) => {
  try {
    const address = req.params.address;
    const status = await queueProcessor.getPayerQueueStatus(address);
    
    return res.json({
      payer: address,
      requests: status,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to get payer status",
      details: error.message,
    });
  }
});

/**
 * Check specific queue item
 */
app.get("/queue/item/:queueId", async (req, res) => {
  try {
    const queueId = req.params.queueId;
    const result = await pool.query(
      "SELECT * FROM mint_queue WHERE id = $1",
      [queueId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Queue item not found",
      });
    }
    
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to get queue item",
      details: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network,
    tokenContract: tokenContractAddress,
    payTo: getAddress(payTo),
    protocol: "x402",
    queueEnabled: true,
  });
});

// Info endpoint
app.get("/info", async (req, res) => {
  try {
    const [
      mintAmount, 
      maxSupply, 
      totalSupply, 
      remainingSupply, 
      mintCount, 
      maxMintCount,
      liquidityDeployed
    ] = await Promise.all([
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

    const maxPossibleMints = remainingSupply / mintAmount;
    const mintProgress = Number(mintCount) / Number(maxMintCount) * 100;

    res.json({
      protocol: "x402",
      price: `${requiredPayment} USDC`,
      tokensPerPayment: mintAmount.toString(),
      maxSupply: maxSupply.toString(),
      totalSupply: totalSupply.toString(),
      remainingSupply: remainingSupply.toString(),
      maxPossibleMints: maxPossibleMints.toString(),
      mintCount: mintCount.toString(),
      maxMintCount: maxMintCount.toString(),
      mintProgress: `${mintProgress.toFixed(2)}%`,
      liquidityDeployed,
      network,
      tokenContract: tokenContractAddress,
      payTo: getAddress(payTo),
      queueEnabled: true,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contract info" });
  }
});

const PORT = process.env.PORT || 4021;

// Initialize database and start server
async function startServer() {
  try {
    // Check database connection
    const dbConnected = await checkDatabaseConnection(pool);
    if (!dbConnected) {
      throw new Error("Failed to connect to database");
    }

    // Initialize database schema
    await initDatabase(pool);

    // Start queue processor
    await queueProcessor.start();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 x402 Token Mint Server (Queue Mode) running on port ${PORT}`);
      console.log(`Network: ${network}`);
      console.log(`Token Contract: ${tokenContractAddress}`);
      console.log(`Pay To Address: ${getAddress(payTo)}`);
      console.log(`Server Address: ${account.address}`);
      console.log(`Required Payment: ${requiredPayment} USDC`);
      console.log(`Protocol: x402 (HTTP 402 Payment Required)`);
      console.log(`Queue: ENABLED (batch every 10s)`);
      
      if (network === "base-sepolia") {
        console.log(`Facilitator: Public (https://x402.org/facilitator)`);
      } else {
        console.log(`Facilitator: Coinbase CDP`);
        console.log(`  ✓ CDP API Key ID: ${cdpApiKeyId?.substring(0, 8)}...`);
      }
      
      console.log(`\nEndpoints:`);
      console.log(`  POST /mint - Add mint request to queue 💳`);
      console.log(`  GET /queue/status - Get queue statistics 📊`);
      console.log(`  GET /queue/payer/:address - Check payer's queue status 🔍`);
      console.log(`  GET /queue/item/:queueId - Check specific queue item 🎫`);
      console.log(`  GET /health - Health check`);
      console.log(`  GET /info - Get mint info`);
    });
  } catch (error: any) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  queueProcessor.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  queueProcessor.stop();
  await pool.end();
  process.exit(0);
});

startServer();

