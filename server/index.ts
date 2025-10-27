import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, decodeEventLog, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";

config();

// Environment variables
const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const tokenContractAddress = process.env.TOKEN_CONTRACT_ADDRESS as `0x${string}`;
const usdcContractAddress = process.env.USDC_CONTRACT_ADDRESS as `0x${string}`;
const payTo = process.env.PAY_TO_ADDRESS as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const requiredPayment = process.env.REQUIRED_PAYMENT_USDC || "1"; // USDC amount

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

// Track processed transactions
const processedTxs = new Set<string>();

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
 * Custom middleware to handle our simplified x402 payment before the standard middleware
 * This allows us to bypass the x402-express middleware when we have a custom X-PAYMENT header
 */
app.use((req, res, next) => {
  // Check if this is a POST to /mint with our custom X-PAYMENT header
  if (req.method === 'POST' && req.path === '/mint' && req.headers['x-payment']) {
    // Mark this request to bypass x402 middleware
    (req as any).skipX402Middleware = true;
  }
  next();
});

/**
 * Configure facilitator based on network
 * - Testnet: Use public facilitator (no API keys needed)
 * - Mainnet: Use Coinbase CDP facilitator (requires API keys)
 */
const facilitatorConfig = network === "base-sepolia" 
  ? { url: "https://x402.org/facilitator" }  // Public facilitator for testnet
  : facilitator;  // CDP facilitator for mainnet (requires CDP_API_KEY_ID and CDP_API_KEY_SECRET)

/**
 * x402 Payment Middleware Configuration
 * 
 * This middleware intercepts requests to /mint and requires payment
 * before allowing access. The facilitator handles payment verification.
 * 
 * Note: Requests with our custom X-PAYMENT header will be marked to skip this middleware
 */
app.use((req, res, next) => {
  // Skip x402 middleware if we have our custom payment
  if ((req as any).skipX402Middleware) {
    return next();
  }
  
  // Apply x402 middleware
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
              payer: { type: "string" },
              amount: { type: "string", description: "Amount of tokens minted" },
              mintTxHash: { type: "string", description: "Transaction hash of the mint" },
              blockNumber: { type: "string" },
              timestamp: { type: "number" }
            }
          }
        }
      }
    },
    facilitatorConfig
  )(req, res, next);
});

/**
 * Generate a unique transaction hash for minting
 * Since x402 payment is off-chain, we need to create a unique identifier
 */
function generateMintTxHash(payer: string, timestamp: number): `0x${string}` {
  const data = `${payer}-${timestamp}`;
  // Use keccak256 to generate a proper 32-byte hash
  const hash = keccak256(toHex(data));
  return hash as `0x${string}`;
}

/**
 * Verify custom X-PAYMENT header (our simplified x402 implementation)
 */
async function verifyCustomPayment(paymentHeader: string): Promise<{
  valid: boolean;
  txHash?: string;
  payer?: string;
  error?: string;
}> {
  try {
    // Decode base64 payment proof
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
 * Main mint endpoint (Protected by x402 payment middleware OR custom payment)
 * 
 * This endpoint supports two payment verification methods:
 * 1. x402 middleware (standard x402 protocol)
 * 2. Custom X-PAYMENT header with transaction hash
 * 
 * After payment is verified, this handler:
 * 1. Checks remaining supply
 * 2. Mints tokens to the payer
 * 3. Returns mint transaction details
 */
app.post("/mint", async (req, res) => {
  console.log(`\n🎨 POST /mint received`);
  console.log(`   Headers:`, Object.keys(req.headers));
  console.log(`   Body:`, req.body);
  console.log(`   x402Payment:`, (req as any).x402Payment);
  
  try {
    let payer: `0x${string}`;
    let paymentTxHash: string | undefined;
    
    // First check if x402 middleware already verified payment
    const x402Payment = (req as any).x402Payment;
    
    if (x402Payment && x402Payment.payer) {
      // x402-express middleware verified the payment
      payer = x402Payment.payer as `0x${string}`;
      console.log(`✅ Payment verified via x402 middleware for ${payer}`);
      console.log(`   Payment details:`, x402Payment);
    } else {
      // Check for custom X-PAYMENT header (manual USDC transfer implementation)
      const customPayment = req.headers['x-payment'] as string;
      
      if (customPayment) {
        // Try to verify as custom payment (type: "transaction")
        console.log(`🔍 Checking custom payment format...`);
        const verification = await verifyCustomPayment(customPayment);
        
        if (verification.valid) {
          payer = verification.payer as `0x${string}`;
          paymentTxHash = verification.txHash;
          console.log(`✅ Custom payment verified for ${payer}`);
          console.log(`   Payment TX: ${paymentTxHash}`);
        } else {
          // Not a valid custom payment, but X-PAYMENT exists
          // This means x402 middleware should have handled it but didn't
          console.log(`⚠️  X-PAYMENT header present but not verified`);
          console.log(`   Verification error:`, verification.error);
          
          // Fall back to body payer (x402 middleware passed through)
          payer = req.body.payer as `0x${string}`;
          
          if (!payer) {
            return res.status(400).json({
              error: "Payment verification incomplete",
              message: "X-PAYMENT header exists but payment not verified, and no payer in body",
              details: verification.error,
            });
          }
          
          console.log(`⚠️  Using payer from body (x402 middleware passed): ${payer}`);
        }
      } else {
        // No X-PAYMENT header, use body payer
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

    // Generate unique transaction hash for this mint
    const timestamp = Date.now();
    const txHashBytes32 = generateMintTxHash(payer, timestamp);

    // Check if already minted (safety check)
    if (processedTxs.has(txHashBytes32)) {
      return res.status(200).json({
        success: true,
        message: "Tokens already minted",
        payer,
      });
    }

    const alreadyMinted = await publicClient.readContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "hasMinted",
      args: [txHashBytes32],
    });

    if (alreadyMinted) {
      processedTxs.add(txHashBytes32);
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
        remainingSupply: remainingSupply.toString(),
      });
    }

    // Get gas price with buffer
    const gasPrice = await publicClient.getGasPrice();
    const gasPriceWithBuffer = gasPrice > 0n ? (gasPrice * 120n) / 100n : 1000000n;
    
    console.log(`🎨 Minting to ${payer}...`);

    // Mint tokens
    const hash = await walletClient.writeContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "mint",
      args: [payer, txHashBytes32],
      gas: 200000n,
      gasPrice: gasPriceWithBuffer,
    });

    console.log(`✅ Mint transaction sent: ${hash}`);
    console.log(`   View on Basescan: https://${network === 'base-sepolia' ? 'sepolia.' : ''}basescan.org/tx/${hash}`);

    // Wait for confirmation
    console.log(`⏳ Waiting for confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash,
      confirmations: 1,
      timeout: 60_000,
    });
    
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Mark as processed
    processedTxs.add(txHashBytes32);

    return res.status(200).json({
      success: true,
      message: "Tokens minted successfully via x402 payment",
      payer,
      amount: mintAmountPerPayment.toString(),
      mintTxHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      timestamp,
    });
  } catch (error: any) {
    console.error("❌ Mint error:", error.message);
    
    if (error.message?.includes("MaxSupplyExceeded") || error.message?.includes("MaxMintCountExceeded")) {
      return res.status(400).json({
        error: "Maximum supply exceeded",
        message: "Cannot mint more tokens, supply cap has been reached",
      });
    }
    
    if (error.message?.includes("timeout") || error.name === "TimeoutError") {
      return res.status(504).json({
        error: "Transaction timeout",
        message: "Transaction was sent but confirmation timed out",
      });
    }
    
    if (error.message?.includes("insufficient funds")) {
      return res.status(400).json({
        error: "Insufficient funds",
        message: "Server does not have enough ETH for gas fees",
      });
    }
    
    return res.status(500).json({
      error: "Failed to mint tokens",
      details: error.message,
    });
  }
});

/**
 * Direct mint endpoint (NOT protected by x402, for traditional clients)
 * 
 * This endpoint accepts traditional USDC payment via paymentTxHash.
 * Used for testing with traditional CLI clients.
 * 
 * Request body:
 * {
 *   "paymentTxHash": "0x...",  // USDC transaction hash
 *   "payer": "0x..."           // Payer address
 * }
 */
app.post("/mint-direct", async (req, res) => {
  try {
    const { paymentTxHash, payer } = req.body;

    if (!paymentTxHash || !payer) {
      return res.status(400).json({
        error: "Missing required fields: paymentTxHash and payer",
      });
    }

    const txHashBytes32 = paymentTxHash as `0x${string}`;
    const payerAddress = payer as `0x${string}`;

    console.log(`💰 Traditional mint request for ${payerAddress}`);
    console.log(`   Payment TX: ${paymentTxHash}`);

    // Check if already processed
    if (processedTxs.has(paymentTxHash)) {
      return res.status(200).json({
        success: true,
        message: "Tokens already minted for this payment",
        payer,
        txHash: paymentTxHash,
      });
    }

    // Check if already minted on-chain
    const alreadyMinted = await publicClient.readContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "hasMinted",
      args: [txHashBytes32],
    });

    if (alreadyMinted) {
      processedTxs.add(paymentTxHash);
      return res.status(200).json({
        success: true,
        message: "Tokens already minted for this payment",
        payer,
        txHash: paymentTxHash,
      });
    }

    // Verify USDC payment if USDC contract address is provided
    if (usdcContractAddress) {
      const requiredAmountWei = parseUnits(requiredPayment, 6); // USDC has 6 decimals
      await verifyUSDCPayment(txHashBytes32, payerAddress, requiredAmountWei);
    }

    // Check remaining supply before minting
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
        remainingSupply: remainingSupply.toString(),
        message: "Cannot mint more tokens, supply cap has been reached",
      });
    }

    // Get gas price with buffer to avoid underpriced errors
    const gasPrice = await publicClient.getGasPrice();
    const gasPriceWithBuffer = gasPrice > 0n ? (gasPrice * 120n) / 100n : 1000000n;
    
    console.log(`⛽ Gas price: ${gasPrice.toString()} (buffered: ${gasPriceWithBuffer.toString()})`);

    // Mint tokens to the payer
    console.log(`🎨 Minting to ${payerAddress}...`);
    const hash = await walletClient.writeContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "mint",
      args: [payerAddress, txHashBytes32],
      gas: 200000n,
      gasPrice: gasPriceWithBuffer,
    });

    console.log(`✅ Mint transaction sent: ${hash}`);
    console.log(`   View on Basescan: https://${network === 'base-sepolia' ? 'sepolia.' : ''}basescan.org/tx/${hash}`);

    // Wait for transaction confirmation with timeout
    console.log(`⏳ Waiting for confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash,
      confirmations: 1,
      timeout: 60_000,
    });
    
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Mark as processed
    processedTxs.add(paymentTxHash);

    return res.status(200).json({
      success: true,
      message: "Tokens minted successfully (traditional payment)",
      payer,
      amount: mintAmountPerPayment.toString(),
      mintTxHash: hash,
      paymentTxHash,
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (error: any) {
    console.error("❌ Mint error:", error.message);
    
    if (error.message?.includes("MaxSupplyExceeded") || error.message?.includes("MaxMintCountExceeded")) {
      return res.status(400).json({
        error: "Maximum supply exceeded",
        message: "Cannot mint more tokens, supply cap has been reached",
      });
    }
    
    if (error.message?.includes("timeout") || error.name === "TimeoutError") {
      return res.status(504).json({
        error: "Transaction timeout",
        message: "Transaction was sent but confirmation timed out",
      });
    }
    
    if (error.message?.includes("insufficient funds")) {
      return res.status(400).json({
        error: "Insufficient funds",
        message: "Server does not have enough ETH for gas fees",
      });
    }

    if (error.message?.includes("Valid USDC payment not found")) {
      return res.status(400).json({
        error: "Invalid payment",
        message: "USDC payment verification failed",
        details: error.message,
      });
    }
    
    return res.status(500).json({
      error: "Failed to mint tokens",
      details: error.message,
    });
  }
});

// Health check endpoint (no payment required)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network,
    tokenContract: tokenContractAddress,
    payTo,
    protocol: "x402",
  });
});

// Info endpoint (no payment required)
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
      payTo,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contract info" });
  }
});

const PORT = process.env.PORT || 4021;

app.listen(PORT, () => {
  console.log(`🚀 x402 Token Mint Server running on port ${PORT}`);
  console.log(`Network: ${network}`);
  console.log(`Token Contract: ${tokenContractAddress}`);
  console.log(`Pay To Address: ${payTo}`);
  console.log(`Server Address: ${account.address}`);
  console.log(`Required Payment: ${requiredPayment} USDC`);
  console.log(`Protocol: x402 (HTTP 402 Payment Required)`);
  
  // Show facilitator configuration
  if (network === "base-sepolia") {
    console.log(`Facilitator: Public (https://x402.org/facilitator)`);
    console.log(`  ℹ️  Testnet mode - no CDP API keys required`);
  } else {
    console.log(`Facilitator: Coinbase CDP`);
    console.log(`  ✓ CDP API Key ID: ${cdpApiKeyId?.substring(0, 8)}...`);
    console.log(`  ℹ️  Mainnet mode - using Coinbase Developer Platform`);
    console.log(`  📊 Your endpoint will be listed in x402 Bazaar`);
  }
  
  console.log(`\nEndpoints:`);
  console.log(`  POST /mint - Mint tokens (requires x402 payment) 💳`);
  console.log(`  POST /mint-direct - Mint tokens (traditional USDC payment) 💰`);
  console.log(`  GET /health - Health check`);
  console.log(`  GET /info - Get mint info`);
  console.log(`\nUsage (x402 protocol):`);
  console.log(`  1. Request POST /mint`);
  console.log(`  2. Server responds with 402 Payment Required + instructions`);
  console.log(`  3. Client completes payment via x402 protocol`);
  console.log(`  4. Client retries POST /mint with X-PAYMENT header`);
  console.log(`  5. ✨ Server verifies payment and mints tokens!`);
  console.log(`\nUsage (traditional):`);
  console.log(`  1. Send ${requiredPayment} USDC to ${payTo}`);
  console.log(`  2. POST to /mint-direct with { "paymentTxHash": "0x...", "payer": "0x..." }`);
  console.log(`  3. ✨ Server verifies payment and mints tokens!`);
});

