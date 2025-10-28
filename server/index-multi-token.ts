import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { readFileSync } from "fs";
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
} from "./services/tokenDeployer.js";
import { initDatabase } from "./db/init.js";
import { MintQueueProcessor } from "./queue/processor.js";

config();

// Environment variables
const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const excessRecipient = process.env.EXCESS_RECIPIENT_ADDRESS as `0x${string}`; // Address to receive excess USDC from LP deployment
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";

// Database configuration
const databaseUrl = process.env.DATABASE_URL;
const useDatabase = !!databaseUrl;

// Validation
const missingVars: string[] = [];
if (!serverPrivateKey) missingVars.push("SERVER_PRIVATE_KEY");
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
  console.warn("⚠️  EXCESS_RECIPIENT_ADDRESS not set. Excess USDC will be sent to token deployer by default.");
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
    console.log("🔐 Using SSL certificates for database connection");
    return {
      rejectUnauthorized: true,
      ca: sslCA ? readFileSync(sslCA).toString() : undefined,
      cert: sslCert ? readFileSync(sslCert).toString() : undefined,
      key: sslKey ? readFileSync(sslKey).toString() : undefined,
    };
  }
  
  // Otherwise use default SSL with relaxed verification
  console.log("🔓 Using SSL with relaxed verification for database connection");
  return {
    rejectUnauthorized: false
  };
})() : false;

if (!dbSslEnabled && isRemoteDB) {
  console.warn("⚠️  SSL disabled for remote database connection (DB_SSL_ENABLED=false)");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: sslConfig,
});

// Viem setup
const chain = network === "base-sepolia" ? baseSepolia : base;
const account = privateKeyToAccount(serverPrivateKey);

// RPC URL configuration
const rpcUrl = network === "base-sepolia" 
  ? (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org")
  : (process.env.BASE_RPC_URL || "https://mainnet.base.org");

console.log(`🌐 Using RPC: ${rpcUrl}`);

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl),
}) as any; // Type assertion to avoid viem version conflicts

const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
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
 * GET /api/deploy-address - Get deployment service address
 */
app.get("/api/deploy-address", async (req, res) => {
  try {
    return res.status(200).json({
      deployAddress: account.address,
    });
  } catch (error: any) {
    console.error("❌ Error getting deploy address:", error.message);
    return res.status(500).json({
      error: "Failed to get deploy address",
      message: error.message,
    });
  }
});

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
    const { name, symbol, mintAmount, maxMintCount, price, paymentToken, deployer, authorization, imageUrl, description } = req.body;

    // Validation
    if (!name || !symbol || !mintAmount || !maxMintCount || !price || !paymentToken || !deployer) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["name", "symbol", "mintAmount", "maxMintCount", "price", "paymentToken", "deployer"],
      });
    }

    // Validate authorization for deployment fee payment
    if (!authorization || !authorization.signature) {
      return res.status(400).json({
        error: "Missing payment authorization",
        message: "Deployment requires 1 USDC payment authorization",
      });
    }

    // Validate minimum constraints
    const mintAmountNum = parseFloat(mintAmount);
    const maxMintCountNum = parseInt(maxMintCount);
    const priceNum = parseFloat(price);

    if (mintAmountNum < 1) {
      return res.status(400).json({
        error: "Invalid mintAmount",
        message: "mintAmount must be at least 1",
      });
    }

    if (maxMintCountNum < 10) {
      return res.status(400).json({
        error: "Invalid maxMintCount",
        message: "maxMintCount must be at least 10",
      });
    }

    if (priceNum < 1) {
      return res.status(400).json({
        error: "Invalid price",
        message: "price must be at least 1",
      });
    }

    console.log(`\n🚀 Deploying new token: ${name} (${symbol})`);
    console.log(`   Deployer: ${deployer}`);
    console.log(`   Mint Amount: ${mintAmount} tokens`);
    console.log(`   Max Mints: ${maxMintCount}`);
    console.log(`   Price: ${price} ${paymentToken}`);
    console.log(`   Excess Recipient: ${excessRecipient || deployer}`);
    console.log(`   💡 USDC should be sent to the token contract address (will be shown after deployment)`);

    // Process deployment fee payment
    console.log(`\n💰 Processing deployment fee (1 USDC)...`);
    
    const usdcAddress = network === 'base-sepolia' 
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;

    try {
      // Verify authorization is to our address and for correct amount
      if (getAddress(authorization.to) !== getAddress(account.address)) {
        return res.status(400).json({
          error: "Invalid payment recipient",
          message: `Payment must be sent to ${account.address}`,
        });
      }

      if (BigInt(authorization.value) !== DEPLOY_FEE_USDC) {
        return res.status(400).json({
          error: "Invalid payment amount",
          message: `Payment must be exactly 10 USDC (${DEPLOY_FEE_USDC.toString()} wei)`,
        });
      }

      // Execute transferWithAuthorization
      const sig = authorization.signature.startsWith('0x') 
        ? authorization.signature.slice(2) 
        : authorization.signature;
      
      const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
      const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
      let v = parseInt(sig.slice(128, 130), 16);
      
      if (v === 0 || v === 1) v = v + 27;
      
      const gasPrice = await publicClient.getGasPrice();
      const gasPriceWithBuffer = (gasPrice * 150n) / 100n;
      
      console.log(`   Executing transferWithAuthorization from ${authorization.from}...`);
      
      const paymentHash = await walletClient.writeContract({
        address: usdcAddress,
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
      
      console.log(`   ✅ Payment transaction: ${paymentHash}`);
      
      const paymentReceipt = await publicClient.waitForTransactionReceipt({ 
        hash: paymentHash,
        confirmations: 1,
      });
      
      if (paymentReceipt.status !== "success") {
        throw new Error("Payment transaction reverted");
      }
      
      console.log(`   ✅ Payment confirmed! Proceeding with deployment...`);
    } catch (error: any) {
      console.error("❌ Payment failed:", error.message);
      return res.status(400).json({
        error: "Payment failed",
        message: error.message,
      });
    }

    const deployConfig: TokenDeployConfig = {
      name,
      symbol,
      mintAmount: mintAmount.toString(),
      maxMintCount: parseInt(maxMintCount),
      price: price.toString(),
      paymentToken: paymentToken === 'USDT' ? 'USDT' : 'USDC',
      network,
      deployer,
      excessRecipient: excessRecipient, // Pass the excess recipient
      imageUrl: imageUrl || undefined,
      description: description || undefined,
    };

    // Deploy token
    const deployResult = await deployToken(deployConfig);
    console.log(`✅ Token deployed to ${deployResult.address}`);

    // Save to database
    const savedToken = await saveDeployedToken(pool, deployConfig, deployResult);
    console.log(`✅ Token saved to database`);

    // Calculate required vs total USDC
    const pricePerMintUSDC = BigInt(price) * BigInt(10 ** 6);
    const mintAmountWei = BigInt(mintAmount) * BigInt(10 ** 18);
    const totalUserMint = mintAmountWei * BigInt(maxMintCount);
    const poolSeedAmount = totalUserMint / BigInt(4);
    const requiredUSDC = (poolSeedAmount * pricePerMintUSDC) / mintAmountWei;
    const totalUSDC = pricePerMintUSDC * BigInt(maxMintCount);
    const excessUSDC = totalUSDC - requiredUSDC;

    return res.status(200).json({
      success: true,
      token: {
        address: savedToken.address,
        name: savedToken.name,
        symbol: savedToken.symbol,
        deployTxHash: savedToken.deploy_tx_hash,
        blockNumber: savedToken.deploy_block_number,
        mintUrl: `${req.protocol}://${req.get('host')}/mint/${savedToken.address}`,
        paymentInfo: {
          paymentAddress: savedToken.address, // USDC should be sent to token contract
          requiredUSDC: (Number(requiredUSDC) / 1e6).toFixed(2),
          totalUSDC: (Number(totalUSDC) / 1e6).toFixed(2),
          excessUSDC: (Number(excessUSDC) / 1e6).toFixed(2),
          excessRecipient: excessRecipient || deployer,
        },
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

    // Calculate 24h USDC volume for each token
    const volumeQuery = await pool.query(`
      SELECT 
        token_address,
        COUNT(*) as mint_count_24h
      FROM mint_history
      WHERE completed_at > NOW() - INTERVAL '24 hours'
      GROUP BY token_address
    `);

    const volumeMap = new Map<string, number>();
    volumeQuery.rows.forEach(row => {
      if (row.token_address) {
        volumeMap.set(row.token_address.toLowerCase(), parseInt(row.mint_count_24h));
      }
    });

    // Fetch live on-chain data for each token
    const formattedTokens = await Promise.all(tokens.map(async (token) => {
      try {
        // Get live mintCount from chain
        const mintCount = await publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: tokenAbi,
          functionName: "mintCount",
        });

        // Try to get liquidityDeployed, fall back to DB if not available (old contracts)
        let liquidityDeployed: boolean;
        try {
          liquidityDeployed = await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: tokenAbi,
            functionName: "liquidityDeployed",
          }) as boolean;
        } catch (lpErr) {
          // Old contract without liquidityDeployed function, use DB value
          liquidityDeployed = token.liquidity_deployed;
        }

        // Calculate 24h USDC volume
        const mintCount24h = token.address ? (volumeMap.get(token.address.toLowerCase()) || 0) : 0;
        // Extract price number from "1 USDC" format
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
          mintCount: Number(mintCount), // Live data from chain
          mintCount24h, // Mints in last 24h
          volume24hUSDC, // USDC volume in last 24h
          price: token.price,
          paymentToken: token.payment_token_symbol,
          network: token.network,
          liquidityDeployed: liquidityDeployed, // Live or DB data
          createdAt: token.created_at,
          mintUrl: `/mint/${token.address}`,
        };
      } catch (err) {
        // Fallback to database data if chain read fails
        console.error(`⚠️  Using DB data for ${token.address} (chain read failed)`);
        
        const mintCount24h = token.address ? (volumeMap.get(token.address.toLowerCase()) || 0) : 0;
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
          mintCount: token.mint_count, // Fallback to DB data
          mintCount24h,
          volume24hUSDC,
          price: token.price,
          paymentToken: token.payment_token_symbol,
          network: token.network,
          liquidityDeployed: token.liquidity_deployed, // Fallback to DB data
          createdAt: token.created_at,
          mintUrl: `/mint/${token.address}`,
        };
      }
    }));

    // Sort by 24h USDC volume (descending)
    formattedTokens.sort((a, b) => b.volume24hUSDC - a.volume24hUSDC);

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
      paymentAddress: address, // USDC should be sent to token contract
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
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    network,
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

  // Get actual queue config from database
  let queueConfigDisplay = "enabled";
  try {
    const configResult = await pool.query(`
      SELECT value FROM system_settings WHERE key = 'batch_interval_seconds'
    `);
    if (configResult.rows.length > 0) {
      const interval = parseInt(configResult.rows[0].value);
      queueConfigDisplay = `✅ Enabled (batch every ${interval}s)`;
    }
  } catch (e) {
    queueConfigDisplay = "✅ Enabled";
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Multi-Token x402 Server running on port ${PORT}`);
    console.log(`Network: ${network}`);
    console.log(`Excess Recipient: ${excessRecipient ? getAddress(excessRecipient) : 'Not configured (will use deployer)'}`);
    console.log(`Server Address: ${account.address}`);
    console.log(`Database: ✅ Enabled`);
    console.log(`Queue System: ${queueConfigDisplay}`);
    console.log(`\n💡 LP Deployment: Run standalone service with 'npm run lp-deployer'`);
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

