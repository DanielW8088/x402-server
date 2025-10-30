import { config } from "dotenv";
import axios from "axios";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

config();

// Environment variables
const serverUrl = process.env.SERVER_URL || "http://localhost:4021";
const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const tokenAddress = process.env.TOKEN_ADDRESS as `0x${string}`;

// Validation
if (!privateKey) {
  console.error("❌ Missing PRIVATE_KEY in .env");
  process.exit(1);
}

if (!tokenAddress) {
  console.error("❌ Missing TOKEN_ADDRESS in .env");
  console.error("💡 Set TOKEN_ADDRESS to the token contract you want to mint");
  process.exit(1);
}

// Setup chain and account
const chain = network === "base-sepolia" ? baseSepolia : base;
const account = privateKeyToAccount(privateKey);

// USDC addresses
const USDC_ADDRESS = network === "base-sepolia"
  ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`
  : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

// Setup clients
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
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/**
 * Get token info from server
 */
async function getTokenInfo() {
  try {
    const response = await axios.get(`${serverUrl}/api/tokens/${tokenAddress}`);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Failed to get token info for ${tokenAddress}`);
    throw error;
  }
}

/**
 * Check USDC balance
 */
async function checkUSDCBalance(): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  return balance as bigint;
}

/**
 * Transfer USDC to token contract
 */
async function transferUSDC(amount: bigint): Promise<`0x${string}`> {
  console.log(`\n💸 Transferring ${formatUnits(amount, 6)} USDC...`);
  console.log(`   From: ${account.address}`);
  console.log(`   To: ${tokenAddress}`);
  
  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: usdcAbi,
    functionName: "transfer",
    args: [tokenAddress, amount],
  });
  
  console.log(`   TX Hash: ${hash}`);
  console.log(`   Waiting for confirmation...`);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (receipt.status === "success") {
    console.log(`   ✅ Transfer confirmed in block ${receipt.blockNumber}`);
  } else {
    throw new Error("Transfer failed");
  }
  
  return hash;
}

/**
 * Request mint from server with payment txHash
 */
async function requestMint(paymentTxHash: `0x${string}`) {
  console.log(`\n🎨 Requesting mint from server...`);
  console.log(`   Payment TX: ${paymentTxHash}`);
  
  try {
    const response = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
      payer: account.address,
      paymentTxHash: paymentTxHash,
    });
    
    return response.data;
  } catch (error: any) {
    if (error.response) {
      console.error(`   Server error (${error.response.status}):`, error.response.data);
    }
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("💰 x402 Token Mint Client (Direct USDC Payment)");
  console.log("================================================\n");
  console.log(`Network: ${network}`);
  console.log(`Your address: ${account.address}`);
  console.log(`Server: ${serverUrl}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`USDC: ${USDC_ADDRESS}`);
  console.log(`Payment method: Direct transfer (you pay gas)\n`);

  try {
    // 1. Get token info
    console.log("📋 Step 1: Getting token info...");
    const tokenInfo = await getTokenInfo();
    console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`   Price: ${tokenInfo.price}`);
    console.log(`   Tokens per mint: ${formatUnits(BigInt(tokenInfo.tokensPerMint), 18)}`);
    
    if (tokenInfo.remainingSupply) {
      const remaining = formatUnits(BigInt(tokenInfo.remainingSupply), 18);
      console.log(`   Remaining supply: ${remaining}`);
    }
    
    if (tokenInfo.mintProgress) {
      console.log(`   Mint progress: ${tokenInfo.mintProgress}`);
    }

    // 2. Check USDC balance
    console.log(`\n💵 Step 2: Checking USDC balance...`);
    const balance = await checkUSDCBalance();
    const balanceFormatted = formatUnits(balance, 6);
    console.log(`   Your USDC balance: ${balanceFormatted} USDC`);
    
    // Parse price from token info (e.g., "1 USDC" -> 1000000)
    const priceMatch = tokenInfo.price.match(/^([\d.]+)/);
    const priceAmount = priceMatch ? parseFloat(priceMatch[1]) : 1;
    const paymentAmount = parseUnits(priceAmount.toString(), 6);
    
    if (balance < paymentAmount) {
      console.error(`\n❌ Insufficient USDC balance`);
      console.error(`   Required: ${formatUnits(paymentAmount, 6)} USDC`);
      console.error(`   You have: ${balanceFormatted} USDC`);
      process.exit(1);
    }
    
    console.log(`   ✅ Sufficient balance for payment: ${formatUnits(paymentAmount, 6)} USDC`);

    // 3. Transfer USDC
    console.log(`\n💸 Step 3: Sending USDC payment...`);
    console.log(`   Amount: ${formatUnits(paymentAmount, 6)} USDC`);
    console.log(`   ⚠️  You will pay gas fees for this transaction`);
    
    const paymentTxHash = await transferUSDC(paymentAmount);

    // 4. Request mint
    console.log(`\n🎨 Step 4: Requesting mint...`);
    const mintResult = await requestMint(paymentTxHash);

    // 5. Display results
    console.log(`\n${'='.repeat(50)}`);
    console.log("✨ SUCCESS!");
    console.log("====================================");
    
    // Handle both immediate mints and queued mints
    if (mintResult.queueId) {
      // Queued response
      console.log(`Payment TX: ${paymentTxHash}`);
      console.log(`Queue ID: ${mintResult.queueId}`);
      console.log(`Status: ${mintResult.status}`);
      console.log(`Position: ${mintResult.position || 'N/A'}`);
      console.log(`\n💡 Check status: ${serverUrl}/api/queue/${mintResult.queueId}`);
    } else {
      // Immediate mint response
      console.log(`Payment TX: ${paymentTxHash}`);
      console.log(`Payer: ${mintResult.payer}`);
      if (mintResult.amount) {
        console.log(`Amount: ${formatUnits(BigInt(mintResult.amount), 18)} tokens`);
      }
      if (mintResult.mintTxHash) {
        console.log(`Mint TX: ${mintResult.mintTxHash}`);
      }
      if (mintResult.blockNumber) {
        console.log(`Block: ${mintResult.blockNumber}`);
      }
      if (mintResult.timestamp) {
        console.log(`Timestamp: ${new Date(mintResult.timestamp).toISOString()}`);
      }
    }
    
    console.log("\n💡 How it worked:");
    console.log("   1. You transferred USDC to token contract");
    console.log("   2. You paid gas fees for the transfer");
    console.log("   3. Server detected the payment");
    console.log("   4. Server minted tokens to your address!");
    
    console.log("\n🎉 All done!");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    
    if (error.response) {
      console.error(`\nServer response (${error.response.status}):`, 
        JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.cause) {
      console.error("\nCause:", error.cause);
    }
    
    if (error.message?.includes("insufficient funds")) {
      console.error("\n💡 Tips:");
      console.error("   - Make sure you have enough ETH for gas");
      console.error("   - Make sure you have enough USDC for payment");
    }
    
    process.exit(1);
  }
}

main();

