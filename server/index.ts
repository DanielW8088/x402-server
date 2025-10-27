import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

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

const app = express();

// Enable CORS for all origins in development
app.use(cors({
  origin: '*', // Allow all origins in development. In production, specify your domain.
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// Track processed transactions to prevent double-minting
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
 * Gasless mint endpoint using EIP-3009
 * User signs an authorization, server executes the USDC transfer and mints tokens
 * 
 * Request body:
 * {
 *   "authorization": {
 *     "from": "0x...",
 *     "to": "0x...",
 *     "value": "1000000",
 *     "validAfter": "0",
 *     "validBefore": "1234567890",
 *     "nonce": "0x...",
 *     "signature": "0x..."
 *   }
 * }
 */
app.post("/mint-gasless", async (req, res) => {
  try {
    const { authorization } = req.body;

    if (!authorization) {
      return res.status(400).json({
        error: "Missing authorization",
      });
    }

    const { from, to, value, validAfter, validBefore, nonce, signature } = authorization;

    if (!from || !to || !value || !validAfter || !validBefore || !nonce || !signature) {
      return res.status(400).json({
        error: "Invalid authorization format",
      });
    }

    // Validate recipient is the payTo address
    if (to.toLowerCase() !== payTo.toLowerCase()) {
      return res.status(400).json({
        error: "Invalid recipient address",
        expected: payTo,
        received: to,
      });
    }

    // Validate payment amount
    const requiredAmountWei = parseUnits(requiredPayment, 6);
    if (BigInt(value) < requiredAmountWei) {
      return res.status(400).json({
        error: "Insufficient payment amount",
        required: requiredAmountWei.toString(),
        received: value,
      });
    }

    // Check if authorization has been used
    const authUsed = await publicClient.readContract({
      address: usdcContractAddress,
      abi: usdcAbi,
      functionName: "authorizationState",
      args: [from as `0x${string}`, nonce as `0x${string}`],
    });

    if (authUsed) {
      return res.status(400).json({
        error: "Authorization already used",
        nonce,
      });
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
      console.error(`❌ Invalid signature length: ${sig.length} (expected 132)`);
      return res.status(400).json({
        error: "Invalid signature format",
        details: `Signature must be 132 characters (including 0x), got ${sig.length}`,
      });
    }

    // Get gas price with buffer for USDC transfer
    const transferGasPrice = await publicClient.getGasPrice();
    const transferGasPriceBuffered = transferGasPrice > 0n ? (transferGasPrice * 130n) / 100n : 1000000n; // 1.3x buffer
    console.log(`⛽ Gas price: ${transferGasPrice.toString()} (buffered: ${transferGasPriceBuffered.toString()})`);

    // Execute transferWithAuthorization
    console.log(`   Executing transferWithAuthorization...`);
    const transferHash = await walletClient.writeContract({
      address: usdcContractAddress,
      abi: usdcAbi,
      functionName: "transferWithAuthorization",
      args: [
        from as `0x${string}`,
        to as `0x${string}`,
        BigInt(value),
        BigInt(validAfter),
        BigInt(validBefore),
        nonce as `0x${string}`,
        v,
        r,
        s,
      ],
      gas: 150000n,
      gasPrice: transferGasPriceBuffered, // Use buffered gas price
    });

    console.log(`✅ USDC transfer submitted: ${transferHash}`);
    console.log(`   Waiting for confirmation (timeout: 60s)...`);

    // Wait for USDC transfer confirmation
    let transferReceipt;
    try {
      transferReceipt = await publicClient.waitForTransactionReceipt({ 
        hash: transferHash,
        confirmations: 1,
        timeout: 60_000,
      });
    } catch (receiptError: any) {
      console.error(`❌ Failed to get transfer receipt:`, receiptError.message);
      return res.status(500).json({
        error: "Failed to confirm USDC transfer",
        txHash: transferHash,
        details: receiptError.message,
        tip: "Transaction may still be processing. Check Basescan for status.",
      });
    }

    if (transferReceipt.status !== "success") {
      console.error(`❌ USDC transfer failed (reverted)`);
      console.error(`   Transaction hash: ${transferHash}`);
      console.error(`   View on Basescan: https://sepolia.basescan.org/tx/${transferHash}`);
      
      // Try to get revert reason
      let revertReason = "Unknown";
      try {
        const tx = await publicClient.getTransaction({ hash: transferHash });
        console.error(`   Transaction details:`, {
          from: tx.from,
          to: tx.to,
          value: tx.value,
          gas: tx.gas,
          gasPrice: tx.gasPrice,
        });
      } catch (e) {
        console.error(`   Could not fetch transaction details`);
      }
      
      return res.status(500).json({
        error: "USDC transfer failed (reverted)",
        txHash: transferHash,
        status: transferReceipt.status,
        basescanUrl: `https://sepolia.basescan.org/tx/${transferHash}`,
        tip: "Check the transaction on Basescan for the revert reason. Common causes: invalid signature, nonce already used, or authorization expired.",
      });
    }

    console.log(`✅ USDC transfer confirmed at block ${transferReceipt.blockNumber}`);

    // Use the transfer txHash for minting (to prevent double-minting)
    const txHashBytes32 = transferHash as `0x${string}`;
    const payerAddress = from as `0x${string}`;

    // Check if already minted
    if (processedTxs.has(transferHash)) {
      return res.status(200).json({
        success: true,
        message: "Tokens already minted for this payment",
        payer: from,
        paymentTxHash: transferHash,
      });
    }

    const alreadyMinted = await publicClient.readContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "hasMinted",
      args: [txHashBytes32],
    });

    if (alreadyMinted) {
      processedTxs.add(transferHash);
      return res.status(200).json({
        success: true,
        message: "Tokens already minted for this payment",
        payer: from,
        paymentTxHash: transferHash,
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

    // Get gas price with buffer for mint
    const mintGasPrice = await publicClient.getGasPrice();
    const mintGasPriceBuffered = mintGasPrice > 0n ? (mintGasPrice * 130n) / 100n : 1000000n; // 1.3x buffer for gasless
    console.log(`⛽ Mint gas price: ${mintGasPrice.toString()} (buffered: ${mintGasPriceBuffered.toString()})`);

    // Mint tokens
    console.log(`🎨 Minting tokens to ${payerAddress}...`);
    const mintHash = await walletClient.writeContract({
      address: tokenContractAddress,
      abi: tokenAbi,
      functionName: "mint",
      args: [payerAddress, txHashBytes32],
      gas: 200000n,
      gasPrice: mintGasPriceBuffered, // Use buffered gas price
    });

    console.log(`✅ Mint transaction sent: ${mintHash}`);

    // Wait for mint confirmation
    const mintReceipt = await publicClient.waitForTransactionReceipt({ 
      hash: mintHash,
      confirmations: 1,
      timeout: 60_000,
    });

    console.log(`✅ Mint confirmed at block ${mintReceipt.blockNumber}`);

    // Mark as processed
    processedTxs.add(transferHash);

    return res.status(200).json({
      success: true,
      message: "Tokens minted successfully (gasless!)",
      payer: from,
      amount: mintAmountPerPayment.toString(),
      mintTxHash: mintHash,
      paymentTxHash: transferHash,
      blockNumber: mintReceipt.blockNumber.toString(),
      gasless: true,
    });

  } catch (error: any) {
    console.error("❌ Gasless mint error:", error.message);
    console.error("   Full error:", error);
    
    if (error.message?.includes("MaxSupplyExceeded") || error.message?.includes("MaxMintCountExceeded")) {
      return res.status(400).json({
        error: "Maximum supply exceeded",
      });
    }

    if (error.message?.includes("InvalidSignature") || error.message?.includes("InvalidSigner")) {
      return res.status(400).json({
        error: "Invalid signature",
        message: "The provided signature is invalid",
      });
    }

    if (error.message?.includes("AuthorizationExpired")) {
      return res.status(400).json({
        error: "Authorization expired",
        message: "The authorization has expired",
      });
    }

    if (error.message?.includes("AuthorizationStateInvalid") || error.message?.includes("authorization is used or canceled")) {
      return res.status(400).json({
        error: "Authorization already used or canceled",
      });
    }

    if (error.message?.includes("insufficient funds")) {
      return res.status(400).json({
        error: "Insufficient funds",
        message: "Server does not have enough ETH for gas fees",
      });
    }

    return res.status(500).json({
      error: "Failed to process gasless mint",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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

const PORT = process.env.PORT || 4021;

app.listen(PORT, () => {
  console.log(`🚀 Token Mint Server running on port ${PORT}`);
  console.log(`Network: ${network}`);
  console.log(`Token Contract: ${tokenContractAddress}`);
  console.log(`Pay To Address: ${payTo}`);
  console.log(`Server Address: ${account.address}`);
  console.log(`Required Payment: ${requiredPayment} USDC`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /mint - Mint tokens after USDC payment`);
  console.log(`  POST /mint-gasless - Gasless mint using EIP-3009 🆓`);
  console.log(`  GET /health - Health check`);
  console.log(`  GET /info - Get mint info`);
  console.log(`\nUsage (Traditional):`);
  console.log(`  1. Send ${requiredPayment} USDC to ${payTo}`);
  console.log(`  2. POST to /mint with { "paymentTxHash": "0x...", "payer": "0x..." }`);
  console.log(`\nUsage (Gasless):`);
  console.log(`  1. Sign EIP-3009 authorization`);
  console.log(`  2. POST to /mint-gasless with { "authorization": {...} }`);
  console.log(`  3. ✨ Pay ZERO gas fees!`);
});

