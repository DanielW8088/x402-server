import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, getAddress, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { Pool } from "pg";
import { 
  deployToken, 
  saveDeployedToken, 
  getToken, 
  getAllTokens,
  updateTokenMintCount,
  TokenDeployConfig 
} from "./services/tokenDeployer";
import { initDatabase } from "./db/init";
import { MintQueueProcessor } from "./queue/processor";

config();

// Environment variables
const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const payTo = process.env.PAY_TO_ADDRESS as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";

// Database configuration
const databaseUrl = process.env.DATABASE_URL;
const useDatabase = !!databaseUrl;

// Validation
if (!serverPrivateKey || !payTo) {
  console.error("Missing required environment variables:");
  console.error("- SERVER_PRIVATE_KEY");
  console.error("- PAY_TO_ADDRESS");
  process.exit(1);
}

// Setup database pool
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
}) as any; // Type assertion to avoid viem version conflicts

const publicClient = createPublicClient({
  chain,
  transport: http(),
}) as any; // Type assertion to avoid viem version conflicts

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

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-PAYMENT'],
}));

app.use(express.json());

// Initialize queue processor (no default token for multi-token mode)
const queueProcessor = new MintQueueProcessor(
  pool,
  walletClient,
  publicClient
);

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
 * POST /api/deploy - Deploy a new token
 */
app.post("/api/deploy", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: "Database not configured",
      message: "Token deployment requires DATABASE_URL to be set",
    });
  }

  try {
    const { name, symbol, mintAmount, maxMintCount, price, paymentToken, deployer } = req.body;

    // Validation
    if (!name || !symbol || !mintAmount || !maxMintCount || !price || !paymentToken || !deployer) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["name", "symbol", "mintAmount", "maxMintCount", "price", "paymentToken", "deployer"],
      });
    }

    console.log(`\n🚀 Deploying new token: ${name} (${symbol})`);
    console.log(`   Deployer: ${deployer}`);
    console.log(`   Mint Amount: ${mintAmount} tokens`);
    console.log(`   Max Mints: ${maxMintCount}`);
    console.log(`   Price: ${price} ${paymentToken}`);

    const deployConfig: TokenDeployConfig = {
      name,
      symbol,
      mintAmount: mintAmount.toString(),
      maxMintCount: parseInt(maxMintCount),
      price: price.toString(),
      paymentToken: paymentToken === 'USDT' ? 'USDT' : 'USDC',
      network,
      deployer,
    };

    // Deploy token
    const deployResult = await deployToken(deployConfig);
    console.log(`✅ Token deployed to ${deployResult.address}`);

    // Save to database
    const savedToken = await saveDeployedToken(pool, deployConfig, deployResult);
    console.log(`✅ Token saved to database`);

    return res.status(200).json({
      success: true,
      token: {
        address: savedToken.address,
        name: savedToken.name,
        symbol: savedToken.symbol,
        deployTxHash: savedToken.deploy_tx_hash,
        blockNumber: savedToken.deploy_block_number,
        mintUrl: `${req.protocol}://${req.get('host')}/mint/${savedToken.address}`,
      },
    });
  } catch (error: any) {
    console.error("❌ Deploy error:", error.message);
    return res.status(500).json({
      error: "Deployment failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/tokens - Get all deployed tokens
 */
app.get("/api/tokens", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: "Database not configured",
    });
  }

  try {
    const { deployer, limit = 50, offset = 0 } = req.query;

    const tokens = await getAllTokens(pool, {
      network,
      deployer: deployer as string,
      isActive: true,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    // Format response
    const formattedTokens = tokens.map(token => ({
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      deployer: token.deployer_address,
      mintAmount: token.mint_amount,
      maxMintCount: token.max_mint_count,
      mintCount: token.mint_count,
      price: token.price,
      paymentToken: token.payment_token_symbol,
      network: token.network,
      liquidityDeployed: token.liquidity_deployed,
      createdAt: token.created_at,
      mintUrl: `/mint/${token.address}`,
    }));

    return res.json({
      tokens: formattedTokens,
      total: formattedTokens.length,
    });
  } catch (error: any) {
    console.error("❌ Error fetching tokens:", error.message);
    return res.status(500).json({
      error: "Failed to fetch tokens",
      message: error.message,
    });
  }
});

/**
 * GET /api/tokens/:address - Get specific token info
 */
app.get("/api/tokens/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const tokenContractAddress = address as `0x${string}`;

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

    return res.json({
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
      payTo: getAddress(payTo),
    });
  } catch (error: any) {
    console.error("❌ Error fetching token info:", error.message);
    return res.status(500).json({
      error: "Failed to fetch token info",
      message: error.message,
    });
  }
});

/**
 * POST /api/mint/:address - Mint tokens (with gasless support)
 */
app.post("/api/mint/:address", async (req, res) => {
  console.log(`\n🎨 POST /api/mint/:address received`);
  
  try {
    const { address: tokenAddress } = req.params;
    const tokenContractAddress = tokenAddress as `0x${string}`;
    
    let payer: `0x${string}`;
    let paymentTxHash: string | undefined;
    let isGasless = false;
    
    // Check if this is a gasless request with EIP-3009 authorization
    const authorization = req.body.authorization;
    
    if (authorization && authorization.signature) {
      // Gasless mode: Use EIP-3009
      console.log(`🆓 Gasless mint request`);
      payer = authorization.from as `0x${string}`;
      isGasless = true;
      
      // Get token info for payment token address
      let paymentTokenAddress: `0x${string}`;
      if (pool) {
        const dbToken = await getToken(pool, tokenAddress);
        if (dbToken) {
          paymentTokenAddress = dbToken.payment_token_address as `0x${string}`;
        } else {
          // Fallback to USDC
          paymentTokenAddress = network === 'base-sepolia' 
            ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
            : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
        }
      } else {
        paymentTokenAddress = network === 'base-sepolia' 
          ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
          : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
      }
      
      // Execute transferWithAuthorization
      try {
        const sig = authorization.signature.startsWith('0x') 
          ? authorization.signature.slice(2) 
          : authorization.signature;
        
        const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
        const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
        let v = parseInt(sig.slice(128, 130), 16);
        
        if (v === 0 || v === 1) v = v + 27;
        
        const gasPrice = await publicClient.getGasPrice();
        const gasPriceWithBuffer = (gasPrice * 150n) / 100n;
        
        const authHash = await walletClient.writeContract({
          address: paymentTokenAddress,
          abi: usdcAbi,
          functionName: "transferWithAuthorization",
          args: [
            getAddress(authorization.from),
            getAddress(authorization.to),
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
        
        console.log(`✅ USDC transfer executed: ${authHash}`);
        
        const authReceipt = await publicClient.waitForTransactionReceipt({ 
          hash: authHash,
          confirmations: 1,
        });
        
        if (authReceipt.status !== "success") {
          throw new Error("USDC transfer reverted");
        }
        
        paymentTxHash = authHash;
      } catch (error: any) {
        console.error("❌ transferWithAuthorization failed:", error.message);
        return res.status(400).json({
          error: "USDC transfer failed",
          message: error.message,
        });
      }
    } else {
      // Regular mode
      payer = req.body.payer as `0x${string}`;
      
      if (!payer) {
        return res.status(400).json({
          error: "Missing payer address",
        });
      }
    }

    // Generate unique transaction hash
    const timestamp = Date.now();
    const txHashBytes32 = generateMintTxHash(payer, timestamp, tokenAddress);

    // Check if already minted on-chain
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

    // Check remaining supply
    const [remainingSupply, mintAmountPerPayment] = await Promise.all([
      publicClient.readContract({
        address: tokenContractAddress,
        abi: tokenAbi,
        functionName: "remainingSupply",
      }),
      publicClient.readContract({
        address: tokenContractAddress,
        abi: tokenAbi,
        functionName: "mintAmount",
      }),
    ]);

    if (remainingSupply < mintAmountPerPayment) {
      return res.status(400).json({
        error: "Maximum supply reached",
      });
    }

    console.log(`📥 Adding to queue: ${payer} for token ${tokenAddress.slice(0, 10)}...`);

    // Add to queue instead of minting directly
    const queueId = await queueProcessor.addToQueue(
      payer,
      txHashBytes32,
      paymentTxHash,
      isGasless ? authorization : undefined,
      isGasless ? "gasless" : "x402",
      tokenAddress
    );

    console.log(`✅ Added to queue: ${queueId}`);

    // Get queue status
    const queueStatus = await queueProcessor.getQueueStatus(queueId);

    const response: any = {
      success: true,
      message: isGasless 
        ? "Added to mint queue (gasless!)" 
        : "Added to mint queue",
      queueId,
      payer,
      status: queueStatus.status,
      queuePosition: queueStatus.queue_position,
      estimatedWaitSeconds: queueStatus.queue_position * 10, // rough estimate
      amount: mintAmountPerPayment.toString(),
    };

    if (paymentTxHash) {
      response.paymentTxHash = paymentTxHash;
    }

    return res.status(200).json(response);
  } catch (error: any) {
    console.error("❌ Mint error:", error.message);
    return res.status(500).json({
      error: "Mint failed",
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
    console.error("❌ Error fetching queue status:", error.message);
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
    console.error("❌ Error fetching queue stats:", error.message);
    return res.status(500).json({
      error: "Failed to fetch queue stats",
      message: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network,
    payTo: getAddress(payTo),
    database: true,
    queueProcessor: "enabled",
  });
});

const PORT = process.env.PORT || 4021;

async function start() {
  // Initialize database
  try {
    await initDatabase(pool);
    console.log("✅ Database initialized");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  }

  // Start queue processor
  await queueProcessor.start();
  console.log("✅ Queue processor started");

  app.listen(PORT, () => {
    console.log(`\n🚀 Multi-Token x402 Server running on port ${PORT}`);
    console.log(`Network: ${network}`);
    console.log(`Pay To Address: ${getAddress(payTo)}`);
    console.log(`Server Address: ${account.address}`);
    console.log(`Database: ✅ Enabled`);
    console.log(`Queue System: ✅ Enabled (batch every 10s)`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/deploy - Deploy new token`);
    console.log(`  GET /api/tokens - List all tokens`);
    console.log(`  GET /api/tokens/:address - Get token info`);
    console.log(`  POST /api/mint/:address - Mint tokens (queued)`);
    console.log(`  GET /api/queue/:queueId - Check queue status`);
    console.log(`  GET /api/queue/stats - Queue statistics`);
    console.log(`  GET /health - Health check`);
  });
}

start().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n📛 SIGTERM received, shutting down gracefully...');
  queueProcessor.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n📛 SIGINT received, shutting down gracefully...');
  queueProcessor.stop();
  await pool.end();
  process.exit(0);
});

