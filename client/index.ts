import { config } from "dotenv";
import axios from "axios";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

config();

// Environment variables
const serverUrl = process.env.SERVER_URL || "http://localhost:4021";
const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const usdcContractAddress = process.env.USDC_CONTRACT_ADDRESS as `0x${string}`;
const paymentAmount = process.env.PAYMENT_AMOUNT_USDC || "1"; // USDC amount

// Validation
if (!privateKey) {
  console.error("❌ Missing PRIVATE_KEY in .env");
  process.exit(1);
}

// Setup
const chain = network === "base-sepolia" ? baseSepolia : base;
const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
});

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

// USDC ABI
const usdcAbi = parseAbi([
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

/**
 * Get server info
 */
async function getServerInfo() {
  try {
    const response = await axios.get(`${serverUrl}/info`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      // /info endpoint might not exist, try /health
      const healthResponse = await axios.get(`${serverUrl}/health`);
      return healthResponse.data;
    }
    throw error;
  }
}

/**
 * Send USDC payment
 */
async function sendUSDCPayment(toAddress: `0x${string}`, amount: string) {
  console.log(`💸 Sending ${amount} USDC to ${toAddress}...`);

  // Check USDC balance
  const balance = await publicClient.readContract({
    address: usdcContractAddress,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });

  const amountWei = parseUnits(amount, 6); // USDC has 6 decimals
  const balanceFormatted = formatUnits(balance, 6);

  console.log(`   Your USDC balance: ${balanceFormatted} USDC`);

  if (balance < amountWei) {
    throw new Error(
      `Insufficient USDC balance. You have ${balanceFormatted} USDC but need ${amount} USDC`
    );
  }

  // Send USDC
  const hash = await walletClient.writeContract({
    address: usdcContractAddress,
    abi: usdcAbi,
    functionName: "transfer",
    args: [toAddress, amountWei],
  });

  console.log(`   Transaction hash: ${hash}`);
  console.log(`   Waiting for confirmation...`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status !== "success") {
    throw new Error("USDC transfer failed");
  }

  console.log(`   ✅ USDC transfer confirmed at block ${receipt.blockNumber}`);

  return { hash, receipt };
}

/**
 * Call server to mint tokens
 */
async function requestMint(paymentTxHash: string, payer: string) {
  console.log(`\n🎫 Requesting token mint from server...`);
  console.log(`   This may take up to 60 seconds...`);

  const response = await axios.post(
    `${serverUrl}/mint`, 
    {
      paymentTxHash,
      payer,
    },
    {
      timeout: 90_000, // 90 seconds timeout
    }
  );

  return response.data;
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Token Mint Client");
  console.log("====================\n");
  console.log(`Network: ${network}`);
  console.log(`Your address: ${account.address}`);
  console.log(`Server: ${serverUrl}\n`);

  try {
    // 1. Get server info
    console.log("📋 Step 1: Getting server info...");
    const serverInfo = await getServerInfo();
    console.log(`   Token contract: ${serverInfo.tokenContract}`);
    console.log(`   Pay to address: ${serverInfo.payTo}`);
    
    if (serverInfo.tokensPerPayment) {
      const tokensPerPayment = formatUnits(BigInt(serverInfo.tokensPerPayment), 18);
      console.log(`   Tokens per payment: ${tokensPerPayment}`);
    }
    
    if (serverInfo.remainingSupply) {
      const remaining = formatUnits(BigInt(serverInfo.remainingSupply), 18);
      console.log(`   Remaining supply: ${remaining}`);
    }

    const payToAddress = serverInfo.payTo as `0x${string}`;

    // 2. Check if USDC address is configured
    if (!usdcContractAddress) {
      console.log("\n⚠️  USDC_CONTRACT_ADDRESS not configured in .env");
      console.log("   Please manually send USDC and provide the transaction hash.");
      console.log(`\n   Send ${paymentAmount} USDC to: ${payToAddress}`);
      console.log(`   Then run: curl -X POST ${serverUrl}/mint -H "Content-Type: application/json" -d '{"paymentTxHash": "0x...", "payer": "${account.address}"}'`);
      return;
    }

    // 3. Send USDC payment
    console.log(`\n💰 Step 2: Sending ${paymentAmount} USDC payment...`);
    const { hash: paymentTxHash } = await sendUSDCPayment(payToAddress, paymentAmount);

    // 4. Request mint from server
    console.log(`\n🎨 Step 3: Minting tokens...`);
    const mintResult = await requestMint(paymentTxHash, account.address);

    // 5. Display results
    console.log("\n✨ SUCCESS! Tokens minted!");
    console.log("============================");
    console.log(`Payer: ${mintResult.payer}`);
    console.log(`Amount: ${formatUnits(BigInt(mintResult.amount), 18)} tokens`);
    console.log(`Payment TX: ${mintResult.paymentTxHash}`);
    console.log(`Mint TX: ${mintResult.mintTxHash}`);
    console.log(`Block: ${mintResult.blockNumber}`);
    console.log("\n🎉 All done!");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    
    if (error.response) {
      console.error("Server response:", error.response.data);
    }
    
    if (error.message?.includes("Insufficient USDC")) {
      console.error("\n💡 Tip: Get USDC from a faucet or DEX");
      if (network === "base-sepolia") {
        console.error("   Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e");
      }
    }
    
    process.exit(1);
  }
}

main();
