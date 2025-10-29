import { config } from "dotenv";
import axios from "axios";
import { createWalletClient, createPublicClient, http, formatUnits, parseAbi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { randomBytes } from "crypto";

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

// RPC URL configuration
const rpcUrl = network === "base-sepolia" 
  ? (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org")
  : (process.env.BASE_RPC_URL || "https://mainnet.base.org");

// Create wallet client
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl),
});

const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

// USDC ABI
const usdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
]);

/**
 * Get token info (free endpoint)
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
 * Create EIP-3009 authorization signature for USDC transferWithAuthorization
 */
async function createTransferAuthorization(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  validAfter: bigint = 0n,
  validBefore: bigint = BigInt(Math.floor(Date.now() / 1000) + 3600) // 1 hour validity
): Promise<any> {
  // Generate random nonce
  const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  
  // USDC domain (EIP-712)
  // CRITICAL: Base Sepolia USDC name is "USDC", Base Mainnet is "USD Coin"
  const usdcName = network === 'base-sepolia' ? 'USDC' : 'USD Coin';
  const domain = {
    name: usdcName,
    version: '2',
    chainId: chain.id,
    verifyingContract: USDC_ADDRESS,
  };

  // EIP-712 typed data
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  const message = {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  // Sign typed data
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  return {
    from: getAddress(from),
    to: getAddress(to),
    value: value.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    signature,
  };
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Token Mint Client (Traditional EIP-3009)");
  console.log("============================================\n");
  console.log(`Network: ${network}`);
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Your address: ${account.address}`);
  console.log(`Server: ${serverUrl}`);
  console.log(`Token: ${tokenAddress}`);
  console.log(`Protocol: EIP-3009 (Gasless USDC)\n`);

  try {
    // 1. Get token info
    console.log("📋 Step 1: Getting token info...");
    const tokenInfo = await getTokenInfo();
    console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`   Address: ${tokenInfo.address}`);
    console.log(`   Payment to: ${tokenInfo.paymentAddress}`);
    
    if (tokenInfo.tokensPerMint) {
      const tokensPerMint = formatUnits(BigInt(tokenInfo.tokensPerMint), 18);
      console.log(`   Tokens per mint: ${tokensPerMint}`);
    }
    
    if (tokenInfo.remainingSupply) {
      const remaining = formatUnits(BigInt(tokenInfo.remainingSupply), 18);
      console.log(`   Remaining supply: ${remaining}`);
    }
    
    if (tokenInfo.price) {
      console.log(`   Price: ${tokenInfo.price}`);
    }
    
    if (tokenInfo.mintProgress) {
      console.log(`   Mint progress: ${tokenInfo.mintProgress}`);
    }

    // 2. Parse price and create authorization
    console.log(`\n💳 Step 2: Creating EIP-3009 payment authorization...`);
    
    // Parse price from "1 USDC" format
    const priceMatch = tokenInfo.price.match(/[\d.]+/);
    const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 1;
    const paymentAmount = BigInt(Math.floor(pricePerMint * 1e6)); // USDC has 6 decimals
    
    console.log(`   Amount: ${formatUnits(paymentAmount, 6)} USDC`);
    console.log(`   From: ${account.address}`);
    console.log(`   To: ${tokenInfo.paymentAddress}`);
    
    // Check USDC balance
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [account.address],
    }) as bigint;
    
    console.log(`   Your USDC balance: ${formatUnits(balance, 6)} USDC`);
    
    if (balance < paymentAmount) {
      throw new Error(`Insufficient USDC balance. Need ${formatUnits(paymentAmount, 6)} USDC but have ${formatUnits(balance, 6)} USDC`);
    }
    
    // Create authorization signature
    console.log(`   Signing payment authorization...`);
    const authorization = await createTransferAuthorization(
      account.address,
      tokenInfo.paymentAddress as `0x${string}`,
      paymentAmount
    );
    console.log(`   ✅ Authorization signed`);

    // 3. Send mint request with authorization
    console.log(`\n🎨 Step 3: Minting tokens with traditional payment...`);
    console.log(`${'='.repeat(50)}\n`);
    
    const response = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
      payer: account.address,
      authorization: authorization,
    });

    const mintResult = response.data;

    // 4. Display results
    console.log(`\n${'='.repeat(50)}`);
    console.log("✨ SUCCESS! Tokens minted via EIP-3009!");
    console.log("========================================");
    
    // Handle both immediate mints and queued mints
    if (mintResult.queueId) {
      // Queued response
      console.log(`Queue ID: ${mintResult.queueId}`);
      console.log(`Status: ${mintResult.status}`);
      console.log(`Position: ${mintResult.queuePosition || 'N/A'}`);
      console.log(`Payment mode: ${mintResult.paymentMode}`);
      if (mintResult.paymentTxHash) {
        console.log(`Payment TX: ${mintResult.paymentTxHash}`);
      }
      console.log(`\n💡 Check status: ${serverUrl}/api/queue/${mintResult.queueId}`);
    } else {
      // Immediate mint response
      console.log(`Payer: ${mintResult.payer}`);
      if (mintResult.amount) {
        console.log(`Amount: ${formatUnits(BigInt(mintResult.amount), 18)} tokens`);
      }
      if (mintResult.paymentTxHash) {
        console.log(`Payment TX: ${mintResult.paymentTxHash}`);
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
    
    console.log("\n💡 How EIP-3009 worked:");
    console.log("   1. Client fetched token info and price");
    console.log("   2. Client signed EIP-3009 authorization (no gas!)");
    console.log("   3. Client sent authorization to server");
    console.log("   4. Server verified and executed USDC transfer");
    console.log("   5. Server queued/minted tokens to your address!");
    console.log("\n   ✅ You only signed - no gas fees paid!");
    
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
    
    console.error("\n💡 Tips:");
    console.error("   - Make sure you have USDC in your wallet");
    console.error("   - EIP-3009 is gasless - you only sign, server pays gas");
    console.error("   - Check token info matches expected payment");
    
    process.exit(1);
  }
}

main();

