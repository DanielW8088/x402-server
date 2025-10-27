import { config } from "dotenv";
import express from "express";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, decodeEventLog } from "viem";
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
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const app = express();
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
  console.log(`  GET /health - Health check`);
  console.log(`  GET /info - Get mint info`);
  console.log(`\nUsage:`);
  console.log(`  1. Send ${requiredPayment} USDC to ${payTo}`);
  console.log(`  2. POST to /mint with { "paymentTxHash": "0x...", "payer": "0x..." }`);
});

