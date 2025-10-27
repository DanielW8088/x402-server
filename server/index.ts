import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { NonceManager } from "./nonceManager";
import { dbUtils } from "./db";
import { TransactionQueue, type MintRequest } from "./txQueue";
import { TransactionMonitor } from "./txMonitor";

config();

// Environment variables
const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;
const tokenContractAddress = process.env.TOKEN_CONTRACT_ADDRESS as `0x${string}`;
const usdcContractAddress = process.env.USDC_CONTRACT_ADDRESS as `0x${string}`;
const payTo = process.env.PAY_TO_ADDRESS as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const requiredPayment = process.env.REQUIRED_PAYMENT_USDC || "1"; // USDC amount

// Validation
if (!serverPrivateKey || !tokenContractAddress || !payTo) {
  console.error("Missing required environment variables:");
  console.error("- SERVER_PRIVATE_KEY (for calling contract as MINTER_ROLE)");
  console.error("- TOKEN_CONTRACT_ADDRESS");
  console.error("- PAY_TO_ADDRESS (where you receive USDC)");
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
  "event LiquidityDeployed(uint256 tokenId, uint128 liquidity)",
  "error MaxSupplyExceeded()",
  "error MaxMintCountExceeded()",
]);

const usdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);

// Initialize nonce manager
const nonceManager = new NonceManager(publicClient as any, account.address);

// Initialize transaction queue and monitor
const txQueue = new TransactionQueue();
const txMonitor = new TransactionMonitor(publicClient as any, walletClient, tokenAbi);

// Start transaction monitor
txMonitor.start();

const app = express();

// Enable CORS for all origins in development
app.use(cors({
  origin: '*', // Allow all origins in development. In production, specify your domain.
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// Track processed transactions to prevent double-minting (in-memory cache for quick checks)
const processedTxs = new Set<string>();

// Mutex lock for gasless mint to prevent concurrent nonce issues
let gaslessMintLock: Promise<void> = Promise.resolve();

/**
 * Execute function with mutex lock
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const previousLock = gaslessMintLock;
  let releaseLock: () => void;
  
  gaslessMintLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock;
    return await fn();
  } finally {
    releaseLock!();
  }
}

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
 * Main mint endpoint
 * Verifies USDC payment and mints tokens to the payer
 * 
 * Request body:
 * {
 *   "paymentTxHash": "0x...",  // USDC transaction hash
 *   "payer": "0x..."           // Payer address
 * }
 */
app.post("/mint", async (req, res) => {
  try {
    const { paymentTxHash, payer } = req.body;

    if (!paymentTxHash || !payer) {
      return res.status(400).json({
        error: "Missing required fields: paymentTxHash and payer",
      });
    }

    const txHashBytes32 = paymentTxHash as `0x${string}`;
    const payerAddress = payer as `0x${string}`;

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
    const gasPriceWithBuffer = gasPrice > 0n ? (gasPrice * 120n) / 100n : 1000000n; // Min 0.001 gwei
    
    console.log(`⛽ Gas price: ${gasPrice.toString()} (buffered: ${gasPriceWithBuffer.toString()})`);

    // Mint tokens to the payer
    console.log(`🎨 Minting to ${payerAddress}...`);
    const hash = await walletClient.writeContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "mint",
      args: [payerAddress, txHashBytes32],
      gas: 200000n, // Explicit gas limit
      gasPrice: gasPriceWithBuffer, // Use buffered gas price to avoid underpriced errors
    });

    console.log(`✅ Mint transaction sent: ${hash}`);
    console.log(`   View on Basescan: https://sepolia.basescan.org/tx/${hash}`);

    // Wait for transaction confirmation with timeout
    console.log(`⏳ Waiting for confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash,
      confirmations: 1,
      timeout: 60_000, // 60 seconds timeout
    });
    
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Mark as processed
    processedTxs.add(paymentTxHash);

    return res.status(200).json({
      success: true,
      message: "Tokens minted successfully",
      payer,
      amount: mintAmountPerPayment.toString(),
      mintTxHash: hash,
      paymentTxHash,
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (error: any) {
    console.error("❌ Mint error:", error.message);
    
    // Check if it's a MaxSupplyExceeded error
    if (error.message?.includes("MaxSupplyExceeded") || error.message?.includes("MaxMintCountExceeded")) {
      return res.status(400).json({
        error: "Maximum supply exceeded",
        message: "Cannot mint more tokens, supply cap has been reached",
      });
    }
    
    // Check if it's a nonce/gas price error
    if (error.message?.includes("replacement transaction underpriced") || 
        error.message?.includes("nonce too low") ||
        error.message?.includes("already known")) {
      return res.status(409).json({
        error: "Transaction pending",
        message: "A transaction is already pending. Please wait a moment and try again.",
        details: "Previous transaction may still be processing",
      });
    }
    
    // Check if already minted
    if (error.message?.includes("AlreadyMinted")) {
      return res.status(400).json({
        error: "Already minted",
        message: "Tokens have already been minted for this payment",
      });
    }
    
    // Check for timeout
    if (error.message?.includes("timeout") || error.name === "TimeoutError") {
      return res.status(504).json({
        error: "Transaction timeout",
        message: "Transaction was sent but confirmation timed out. It may still be processing.",
        tip: "Check the transaction status on Basescan or try again in a minute",
      });
    }
    
    // Check for insufficient funds
    if (error.message?.includes("insufficient funds")) {
      return res.status(400).json({
        error: "Insufficient funds",
        message: "Server does not have enough ETH for gas fees",
        tip: "Please send some ETH to the server address",
      });
    }
    
    return res.status(500).json({
      error: "Failed to mint tokens",
      details: error.message,
      tip: "Check that the server address has MINTER_ROLE and sufficient ETH for gas",
    });
  }
});

/**
 * Process a single gasless mint (called by queue)
 */
async function processGaslessMint(authorization: any) {
  const { from, to, value, validAfter, validBefore, nonce, signature } = authorization;

  if (!from || !to || !value || !validAfter || !validBefore || !nonce || !signature) {
    throw new Error("Invalid authorization format");
  }

  // Validate recipient is the payTo address
  if (to.toLowerCase() !== payTo.toLowerCase()) {
    throw new Error(`Invalid recipient address. Expected: ${payTo}, received: ${to}`);
  }

  // Validate payment amount
  const requiredAmountWei = parseUnits(requiredPayment, 6);
  if (BigInt(value) < requiredAmountWei) {
    throw new Error(`Insufficient payment amount. Required: ${requiredAmountWei.toString()}, received: ${value}`);
  }

  // Check if authorization has been used
  const authUsed = await publicClient.readContract({
    address: usdcContractAddress,
    abi: usdcAbi,
    functionName: "authorizationState",
    args: [from as `0x${string}`, nonce as `0x${string}`],
  });

  if (authUsed) {
    throw new Error("Authorization already used");
  }

  // Split signature into v, r, s
  const sig = signature as `0x${string}`;
  const r = sig.slice(0, 66) as `0x${string}`;
  const s = `0x${sig.slice(66, 130)}` as `0x${string}`;
  let v = parseInt(sig.slice(130, 132), 16);

  // Normalize v value: some wallets return 0/1, USDC expects 27/28
  if (v < 27) {
    v += 27;
    console.log(`   ⚠️  Normalized v from ${v - 27} to ${v}`);
  }

  console.log(`💳 Processing gasless USDC transfer...`);
  console.log(`   From: ${from}`);
  console.log(`   To: ${to}`);
  console.log(`   Amount: ${value} (${formatUnits(BigInt(value), 6)} USDC)`);
  console.log(`   ValidAfter: ${validAfter}`);
  console.log(`   ValidBefore: ${validBefore} (${new Date(Number(validBefore) * 1000).toISOString()})`);
  console.log(`   Nonce: ${nonce}`);
  console.log(`   Signature: ${sig}`);
  console.log(`   Signature length: ${sig.length}`);
  console.log(`   v: ${v}, r: ${r.slice(0, 20)}..., s: ${s.slice(0, 20)}...`);

  // Validate signature format
  if (sig.length !== 132) {
    throw new Error(`Invalid signature format. Signature must be 132 characters (including 0x), got ${sig.length}`);
  }

  // Acquire nonce for USDC transfer
  const { nonce: txNonce, release: releaseTransferNonce } = await nonceManager.acquireNonce();
  
  let transferHash: `0x${string}`;
  let transferGasPrice: bigint;
  try {
    // Get gas price with buffer for USDC transfer
    transferGasPrice = await publicClient.getGasPrice();
    const transferGasPriceBuffered = transferGasPrice > 0n ? (transferGasPrice * 150n) / 100n : 1000000n; // 1.5x buffer
    console.log(`⛽ Gas price: ${transferGasPrice.toString()} (buffered: ${transferGasPriceBuffered.toString()})`);
    console.log(`   Using nonce: ${txNonce}`);

    // Execute transferWithAuthorization
    console.log(`   Executing transferWithAuthorization...`);
    const transferArgs = [
      from as `0x${string}`,
      to as `0x${string}`,
      BigInt(value),
      BigInt(validAfter),
      BigInt(validBefore),
      nonce as `0x${string}`,
      v,
      r,
      s,
    ] as const;
    
    transferHash = await walletClient.writeContract({
      address: usdcContractAddress,
      abi: usdcAbi,
      functionName: "transferWithAuthorization",
      args: transferArgs,
      gas: 150000n,
      gasPrice: transferGasPriceBuffered,
      nonce: txNonce,
    });

    // Track transaction in monitor for auto gas acceleration
    txMonitor.trackTransaction(
      transferHash,
      txNonce,
      transferGasPriceBuffered,
      150000n,
      usdcContractAddress,
      'transferWithAuthorization',
      transferArgs as any
    );

    // Record pending transaction in database
    dbUtils.recordPendingTx(txNonce, transferHash, account.address, usdcContractAddress, 'usdc_transfer');
  } catch (error) {
    releaseTransferNonce();
    throw error;
  }

  console.log(`✅ USDC transfer submitted: ${transferHash}`);
  console.log(`   Waiting for confirmation (monitor will auto-accelerate if needed)...`);

  // Wait for USDC transfer confirmation (monitor handles gas acceleration)
  let transferReceipt;
  try {
    transferReceipt = await publicClient.waitForTransactionReceipt({ 
      hash: transferHash,
      confirmations: 1,
      timeout: 120_000, // Increased timeout since monitor handles acceleration
    });
    
    // Release nonce after confirmation
    releaseTransferNonce();
    
    // Refresh nonce from chain
    await nonceManager.refreshNonce();
  } catch (receiptError: any) {
    console.error(`❌ Failed to get transfer receipt:`, receiptError.message);
    releaseTransferNonce();
    dbUtils.updateTxStatus(transferHash, 'failed', receiptError.message);
    throw new Error(`Failed to confirm USDC transfer: ${receiptError.message}`);
  }

  if (transferReceipt.status !== "success") {
    console.error(`❌ USDC transfer failed (reverted)`);
    console.error(`   Transaction hash: ${transferHash}`);
    console.error(`   View on Basescan: https://sepolia.basescan.org/tx/${transferHash}`);
    
    // Update database
    dbUtils.updateTxStatus(transferHash, 'failed', 'Transaction reverted');
    
    throw new Error("USDC transfer failed (reverted). Check Basescan for revert reason.");
  }

  // Update database with success
  dbUtils.updateTxStatus(transferHash, 'confirmed');
  console.log(`✅ USDC transfer confirmed at block ${transferReceipt.blockNumber}`);

  // Use the transfer txHash for minting (to prevent double-minting)
  const txHashBytes32 = transferHash as `0x${string}`;
  const payerAddress = from as `0x${string}`;

  // Check if already minted in DB
  const existingPayment = dbUtils.isPaymentProcessed(transferHash);
  if (existingPayment) {
    return {
      success: true,
      message: "Tokens already minted for this payment",
      payer: from,
      paymentTxHash: transferHash,
      mintTxHash: existingPayment.mint_tx_hash,
      gasless: true,
    };
  }

  // Check if already minted in-memory cache
  if (processedTxs.has(transferHash)) {
    return {
      success: true,
      message: "Tokens already minted for this payment",
      payer: from,
      paymentTxHash: transferHash,
      gasless: true,
    };
  }

  const alreadyMinted = await publicClient.readContract({
    address: tokenContractAddress,
    abi: tokenAbi,
    functionName: "hasMinted",
    args: [txHashBytes32],
  });

  if (alreadyMinted) {
    processedTxs.add(transferHash);
    return {
      success: true,
      message: "Tokens already minted for this payment",
      payer: from,
      paymentTxHash: transferHash,
      gasless: true,
    };
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
    throw new Error(`Maximum supply reached. Remaining: ${remainingSupply.toString()}`);
  }

  // Acquire nonce for mint transaction
  const { nonce: mintNonce, release: releaseMintNonce } = await nonceManager.acquireNonce();
  
  let mintHash: `0x${string}`;
  try {
    // Get gas price with buffer for mint
    const mintGasPrice = await publicClient.getGasPrice();
    const mintGasPriceBuffered = mintGasPrice > 0n ? (mintGasPrice * 150n) / 100n : 1000000n; // 1.5x buffer
    console.log(`⛽ Mint gas price: ${mintGasPrice.toString()} (buffered: ${mintGasPriceBuffered.toString()})`);
    console.log(`   Using nonce: ${mintNonce}`);

    // Mint tokens
    console.log(`🎨 Minting tokens to ${payerAddress}...`);
    const mintArgs = [payerAddress, txHashBytes32] as const;
    
    mintHash = await walletClient.writeContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "mint",
      args: mintArgs,
      gas: 200000n,
      gasPrice: mintGasPriceBuffered,
      nonce: mintNonce,
    });

    // Track transaction in monitor for auto gas acceleration
    txMonitor.trackTransaction(
      mintHash,
      mintNonce,
      mintGasPriceBuffered,
      200000n,
      tokenContractAddress,
      'mint',
      mintArgs as any
    );

    // Record pending transaction in database
    dbUtils.recordPendingTx(mintNonce, mintHash, account.address, tokenContractAddress, 'mint');
    
    console.log(`✅ Mint transaction sent: ${mintHash}`);
  } catch (error) {
    releaseMintNonce();
    throw error;
  }

  // Wait for mint confirmation (monitor handles gas acceleration)
  let mintReceipt;
  try {
    mintReceipt = await publicClient.waitForTransactionReceipt({ 
      hash: mintHash,
      confirmations: 1,
      timeout: 120_000, // Increased timeout
    });
    
    // Release nonce after confirmation
    releaseMintNonce();
    
    // Refresh nonce from chain
    await nonceManager.refreshNonce();
    
    // Update database
    dbUtils.updateTxStatus(mintHash, 'confirmed');
  } catch (error: any) {
    releaseMintNonce();
    dbUtils.updateTxStatus(mintHash, 'failed', error.message);
    throw error;
  }

  console.log(`✅ Mint confirmed at block ${mintReceipt.blockNumber}`);

  // Mark as processed in memory and database
  processedTxs.add(transferHash);
  dbUtils.recordProcessedPayment(
    transferHash,
    payerAddress,
    mintHash,
    mintAmountPerPayment.toString()
  );

  return {
    success: true,
    message: "Tokens minted successfully (gasless!)",
    payer: from,
    amount: mintAmountPerPayment.toString(),
    mintTxHash: mintHash,
    paymentTxHash: transferHash,
    blockNumber: mintReceipt.blockNumber.toString(),
    gasless: true,
  };
}

/**
 * Gasless mint endpoint using EIP-3009
 * Adds request to queue and returns request ID for status tracking
 */
app.post("/mint-gasless", async (req, res) => {
  try {
    const { authorization } = req.body;

    if (!authorization) {
      return res.status(400).json({
        error: "Missing authorization",
      });
    }

    // Basic validation
    const { from, to, value, validAfter, validBefore, nonce, signature } = authorization;
    if (!from || !to || !value || !validAfter || !validBefore || !nonce || !signature) {
      return res.status(400).json({
        error: "Invalid authorization format",
      });
    }

    // Add to queue (returns immediately)
    const requestId = txQueue.addRequest(authorization);
    const queuePosition = txQueue.getQueueLength();

    console.log(`📥 Queued mint request ${requestId} (position: ${queuePosition})`);

    return res.status(202).json({
      success: true,
      message: "Request queued for processing",
      requestId,
      queuePosition,
      estimatedWaitSeconds: queuePosition * 15,
      statusEndpoint: `/mint-status/${requestId}`,
    });
  } catch (error: any) {
    console.error("❌ Failed to queue mint request:", error.message);
    return res.status(500).json({
      error: "Failed to queue request",
      details: error.message,
    });
  }
});

/**
 * Check status of a queued mint request
 */
app.get("/mint-status/:requestId", (req, res) => {
  const { requestId } = req.params;
  const request = txQueue.getStatus(requestId);

  if (!request) {
    return res.status(404).json({
      error: "Request not found",
      message: "Request ID not found or has expired (requests expire after 5 minutes)",
    });
  }

  const response: any = {
    id: request.id,
    status: request.status,
    queuePosition: txQueue.getPosition(request.id),
    retries: request.retries,
    timestamp: request.timestamp,
    waitingTimeMs: Date.now() - request.timestamp,
  };

  if (request.status === 'completed' && request.result) {
    response.result = request.result;
  }

  if (request.status === 'failed' && request.error) {
    response.error = request.error;
  }

  if (request.txHash) {
    response.txHash = request.txHash;
  }

  if (request.mintTxHash) {
    response.mintTxHash = request.mintTxHash;
  }

  return res.json(response);
});

// Health check endpoint (no payment required)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network,
    tokenContract: tokenContractAddress,
    payTo,
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
      price: "1 USDC",
      tokensPerPayment: mintAmount.toString(),
      maxSupply: maxSupply.toString(),
      totalSupply: totalSupply.toString(),
      remainingSupply: remainingSupply.toString(),
      maxPossibleMints: maxPossibleMints.toString(),
      mintCount: mintCount.toString(),
      maxMintCount: maxMintCount.toString(),
      mintProgress: `${mintProgress.toFixed(2)}%`,
      liquidityDeployed,
      liquidityDeployTrigger: `After ${maxMintCount.toString()} mints`,
      network,
      tokenContract: tokenContractAddress,
      payTo,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contract info" });
  }
});

// Handle queue processing
txQueue.on('process', async (request: MintRequest, resolve: any, reject: any) => {
  try {
    const result = await processGaslessMint(request.authorization);
    request.txHash = result.paymentTxHash;
    request.mintTxHash = result.mintTxHash;
    resolve(result);
  } catch (error) {
    reject(error);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  txMonitor.stop();
  txQueue.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  txMonitor.stop();
  txQueue.stop();
  process.exit(0);
});

const PORT = process.env.PORT || 4021;

app.listen(PORT, () => {
  console.log(`🚀 Token Mint Server running on port ${PORT}`);
  console.log(`Network: ${network}`);
  console.log(`Token Contract: ${tokenContractAddress}`);
  console.log(`Pay To Address: ${payTo}`);
  console.log(`Server Address: ${account.address}`);
  console.log(`Required Payment: ${requiredPayment} USDC`);
  console.log(`\n📊 System Status:`);
  console.log(`  - Transaction Monitor: ACTIVE`);
  console.log(`  - Request Queue: ACTIVE`);
  console.log(`  - Gas Acceleration: 5s threshold, 1.2x multiplier, max 5 attempts`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /mint - Mint tokens after USDC payment`);
  console.log(`  POST /mint-gasless - Queue gasless mint (returns requestId) 🆓`);
  console.log(`  GET /mint-status/:requestId - Check mint request status`);
  console.log(`  GET /health - Health check`);
  console.log(`  GET /info - Get mint info`);
  console.log(`\nUsage (Traditional):`);
  console.log(`  1. Send ${requiredPayment} USDC to ${payTo}`);
  console.log(`  2. POST to /mint with { "paymentTxHash": "0x...", "payer": "0x..." }`);
  console.log(`\nUsage (Gasless + Queue):`);
  console.log(`  1. Sign EIP-3009 authorization`);
  console.log(`  2. POST to /mint-gasless → Get requestId`);
  console.log(`  3. Poll GET /mint-status/:requestId`);
  console.log(`  4. ✨ Pay ZERO gas fees!`);
});

