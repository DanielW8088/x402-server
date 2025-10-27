import { config } from "dotenv";
import axios from "axios";
import { createWalletClient, http, formatUnits, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

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
  console.log("🚀 x402 Token Mint Client (Coinbase x402-fetch)");
  console.log("================================================\n");
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

    // 2. Setup x402 fetch with automatic payment handling
    console.log(`\n🎨 Step 2: Minting tokens via x402...`);
    console.log(`${'='.repeat(50)}\n`);
    
    // Wrap fetch with x402 payment handling
    // Use walletClient which contains the account
    // maxValue: 1.5 USDC (1500000 in 6 decimals)
    const fetchWithPayment = wrapFetchWithPayment(
      fetch, 
      walletClient as any, // Type workaround for viem/x402 compatibility
      BigInt(1_500_000) // 1.5 USDC max
    );

    // Make the mint request
    // x402-fetch will automatically:
    // 1. Detect 402 response
    // 2. Parse payment requirements
    // 3. Verify payment amount is within allowed maximum
    // 4. Create payment proof using wallet client
    // 5. Retry with X-PAYMENT header
    console.log(`   Sending request...`);
    const response = await fetchWithPayment(`${serverUrl}/mint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payer: account.address,
      }),
    });

    console.log(`   Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`   Error body:`, errorText);
      throw new Error(`Request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const mintResult: any = await response.json();

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
    const paymentResponseHeader = response.headers.get("x-payment-response");
    if (paymentResponseHeader) {
      console.log(`\n💳 Payment details:`);
      try {
        const paymentResponse = decodeXPaymentResponse(paymentResponseHeader);
        console.log(`   Payment verified: ✅`);
        console.log(`   Payment info:`, JSON.stringify(paymentResponse, null, 2));
      } catch (e) {
        console.log(`   Payment response: ${paymentResponseHeader}`);
      }
    }
    
    console.log("\n💡 How x402-fetch worked:");
    console.log("   1. Client requested /mint");
    console.log("   2. x402-fetch detected 402 Payment Required");
    console.log("   3. x402-fetch parsed payment requirements");
    console.log("   4. x402-fetch created payment proof with wallet");
    console.log("   5. x402-fetch retried with X-PAYMENT header");
    console.log("   6. Server verified and minted tokens!");
    
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
    
    if (error.message?.includes("payment")) {
      console.error("\n💡 Payment tips:");
      console.error("   - Make sure you have USDC in your wallet");
      console.error("   - Check that payment amount is acceptable");
      console.error("   - Verify your wallet has gas for signatures");
    }
    
    process.exit(1);
  }
}

main();

