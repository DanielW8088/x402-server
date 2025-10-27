import { config } from "dotenv";
import axios from "axios";
import { createWalletClient, createPublicClient, http, parseAbi, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

config();

// Environment variables
const serverUrl = process.env.SERVER_URL || "http://localhost:4021";
const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";

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
]);

/**
 * Parse x402 payment instructions from 402 response
 */
function parseX402Instructions(response402: any) {
  const body = response402.data;
  
  if (!body || !body.accepts || body.accepts.length === 0) {
    throw new Error("Invalid 402 response format");
  }
  
  // Get first payment option
  const paymentOption = body.accepts[0];
  
  return {
    network: paymentOption.network,
    payTo: paymentOption.payTo as `0x${string}`,
    maxAmountRequired: paymentOption.maxAmountRequired,
    asset: paymentOption.asset as `0x${string}`,
    resource: paymentOption.resource,
    description: paymentOption.description,
  };
}

/**
 * Send USDC payment
 */
async function sendUSDCPayment(to: `0x${string}`, asset: `0x${string}`, amount: string) {
  console.log(`💸 Sending USDC payment...`);
  console.log(`   To: ${to}`);
  console.log(`   Amount: ${formatUnits(BigInt(amount), 6)} USDC`);
  
  // Check balance
  const balance = await publicClient.readContract({
    address: asset,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  
  const balanceFormatted = formatUnits(balance, 6);
  console.log(`   Your balance: ${balanceFormatted} USDC`);
  
  if (balance < BigInt(amount)) {
    throw new Error(`Insufficient USDC balance. You have ${balanceFormatted} USDC but need ${formatUnits(BigInt(amount), 6)} USDC`);
  }
  
  // Send USDC
  const hash = await walletClient.writeContract({
    address: asset,
    abi: usdcAbi,
    functionName: "transfer",
    args: [to, BigInt(amount)],
  });
  
  console.log(`   Transaction hash: ${hash}`);
  console.log(`   Waiting for confirmation...`);
  
  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status !== "success") {
    throw new Error("USDC transfer failed");
  }
  
  console.log(`   ✅ USDC transfer confirmed at block ${receipt.blockNumber}`);
  
  return hash;
}

/**
 * Create X-PAYMENT header payload
 * 
 * For x402 protocol, the payment proof typically includes:
 * - Transaction hash of the payment
 * - Payer address
 * - Timestamp
 */
function createPaymentProof(paymentTxHash: string, payer: string): string {
  const proof = {
    type: "transaction",
    txHash: paymentTxHash,
    payer: payer,
    timestamp: Date.now(),
  };
  
  // Encode as base64 JSON
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}

/**
 * Make x402 paid request
 */
async function makeX402Request(
  url: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any
): Promise<any> {
  try {
    console.log(`\n📡 Step 1: Requesting ${method} ${url}...`);
    
    // First request - will get 402
    try {
      const response = await axios({
        method,
        url,
        data: body,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // If we get 2xx without payment, endpoint is free
      console.log(`   ✅ Request succeeded without payment`);
      return response.data;
    } catch (error: any) {
      // We expect a 402 Payment Required response
      if (error.response?.status !== 402) {
        throw error;
      }
      
      console.log(`   💳 Payment required (HTTP 402)`);
      
      // Step 2: Parse payment instructions
      const instructions = parseX402Instructions(error.response);
      
      console.log(`\n📋 Payment instructions:`);
      console.log(`   Network: ${instructions.network}`);
      console.log(`   Pay to: ${instructions.payTo}`);
      console.log(`   Amount: ${formatUnits(BigInt(instructions.maxAmountRequired), 6)} USDC`);
      console.log(`   Asset: ${instructions.asset}`);
      console.log(`   Description: ${instructions.description}`);
      
      // Step 3: Execute payment
      console.log(`\n💰 Step 2: Executing payment...`);
      const paymentTxHash = await sendUSDCPayment(
        instructions.payTo,
        instructions.asset,
        instructions.maxAmountRequired
      );
      
      // Step 4: Create payment proof
      console.log(`\n🔏 Step 3: Creating payment proof...`);
      const paymentProof = createPaymentProof(paymentTxHash, account.address);
      console.log(`   ✅ Payment proof created`);
      
      // Step 5: Retry request with payment
      console.log(`\n📡 Step 4: Retrying request with payment proof...`);
      const paidResponse = await axios({
        method,
        url,
        data: body,
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT': paymentProof,
        },
        timeout: 90_000,
      });
      
      console.log(`   ✅ Payment accepted!`);
      return paidResponse.data;
    }
  } catch (error: any) {
    if (error.response) {
      console.error(`\n❌ Request failed: ${error.response.status} ${error.response.statusText}`);
      console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

/**
 * Get server info
 */
async function getServerInfo() {
  try {
    const response = await axios.get(`${serverUrl}/info`);
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      const healthResponse = await axios.get(`${serverUrl}/health`);
      return healthResponse.data;
    }
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 x402 Token Mint Client (Working Version)");
  console.log("============================================\n");
  console.log(`Network: ${network}`);
  console.log(`Your address: ${account.address}`);
  console.log(`Server: ${serverUrl}`);
  console.log(`Protocol: x402 (HTTP 402 Payment Required)\n`);

  try {
    // 1. Get server info (free endpoint)
    console.log("📋 Getting server info...");
    const serverInfo = await getServerInfo();
    console.log(`   Protocol: ${serverInfo.protocol || 'unknown'}`);
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
    
    if (serverInfo.price) {
      console.log(`   Price: ${serverInfo.price}`);
    }

    // 2. Request mint with x402 payment
    console.log(`\n🎨 Minting tokens via x402 protocol...`);
    console.log(`${'='.repeat(50)}`);
    
    const mintResult = await makeX402Request(
      `${serverUrl}/mint`,
      'POST',
      {
        payer: account.address,
      }
    );

    // 3. Display results
    console.log(`\n${'='.repeat(50)}`);
    console.log("✨ SUCCESS! Tokens minted via x402!");
    console.log("====================================");
    console.log(`Payer: ${mintResult.payer}`);
    console.log(`Amount: ${formatUnits(BigInt(mintResult.amount), 18)} tokens`);
    console.log(`Mint TX: ${mintResult.mintTxHash}`);
    console.log(`Block: ${mintResult.blockNumber}`);
    
    if (mintResult.timestamp) {
      console.log(`Timestamp: ${new Date(mintResult.timestamp).toISOString()}`);
    }
    
    console.log("\n💡 How it worked:");
    console.log("   1. Client requested /mint");
    console.log("   2. Server responded with 402 Payment Required");
    console.log("   3. Client sent USDC payment");
    console.log("   4. Client retried with X-PAYMENT header");
    console.log("   5. Server verified payment and minted tokens!");
    
    console.log("\n🎉 x402 protocol completed successfully!");

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

