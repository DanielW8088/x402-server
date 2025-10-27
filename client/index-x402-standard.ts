import { config } from "dotenv";
import axios from "axios";
import { createWalletClient, http, formatUnits, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { withPaymentInterceptor } from "x402-axios";

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

// Setup chain and account
const chain = network === "base-sepolia" ? baseSepolia : base;
const account = privateKeyToAccount(privateKey);

// Create wallet client for x402
// Create wallet client with public actions for x402
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(),
}).extend(publicActions);

/**
 * Get server info (free endpoint)
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
  console.log("🚀 x402 Token Mint Client (Coinbase Standard)");
  console.log("==============================================\n");
  console.log(`Network: ${network}`);
  console.log(`Your address: ${account.address}`);
  console.log(`Server: ${serverUrl}`);
  console.log(`Protocol: x402 (Coinbase Official)\n`);

  try {
    // 1. Get server info
    console.log("📋 Step 1: Getting server info...");
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

    // 2. Setup x402 axios with automatic payment handling
    console.log(`\n🎨 Step 2: Minting tokens via x402...`);
    console.log(`${'='.repeat(50)}\n`);
    
    // Create axios instance with x402 payment interceptor
    // Use walletClient which contains the account
    // This automatically handles 402 responses
    const axiosClient = axios.create();
    const axiosWithPayment = withPaymentInterceptor(axiosClient, walletClient as any); // Type workaround

    // Make the mint request
    // x402 will automatically:
    // 1. Detect 402 response
    // 2. Parse payment requirements
    // 3. Create payment proof
    // 4. Retry with X-PAYMENT header
    const response = await axiosWithPayment.post(`${serverUrl}/mint`, {
      payer: account.address,
    });

    const mintResult = response.data;

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
    
    // Check for payment response header
    const paymentResponse = response.headers['x-payment-response'];
    if (paymentResponse) {
      console.log(`\n💳 Payment details:`);
      try {
        const paymentInfo = JSON.parse(
          Buffer.from(paymentResponse, 'base64').toString()
        );
        console.log(`   Payment verified: ✅`);
        if (paymentInfo.txHash) {
          console.log(`   Payment TX: ${paymentInfo.txHash}`);
        }
      } catch (e) {
        console.log(`   Payment response: ${paymentResponse}`);
      }
    }
    
    console.log("\n💡 How x402 worked:");
    console.log("   1. Client requested /mint");
    console.log("   2. x402 detected 402 Payment Required");
    console.log("   3. x402 automatically created payment proof");
    console.log("   4. x402 retried with X-PAYMENT header");
    console.log("   5. Server verified and minted tokens!");
    
    console.log("\n🎉 All done!");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    
    if (error.response) {
      console.error(`\nServer response (${error.response.status}):`, 
        JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.message?.includes("payment")) {
      console.error("\n💡 Payment tips:");
      console.error("   - Make sure you have USDC in your wallet");
      console.error("   - Check that maxPaymentAmount is sufficient");
      console.error("   - Verify your wallet has gas for signatures");
    }
    
    process.exit(1);
  }
}

main();

