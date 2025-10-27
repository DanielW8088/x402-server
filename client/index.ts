import { config } from "dotenv";
import axios from "axios";
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits, keccak256, encodeAbiParameters, concat, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";

config();

// Environment variables
const serverUrl = process.env.SERVER_URL || "http://localhost:4021";
const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const usdcContractAddress = process.env.USDC_CONTRACT_ADDRESS as `0x${string}`;
const paymentAmount = process.env.PAYMENT_AMOUNT_USDC || "1"; // USDC amount
const useGasless = process.env.USE_GASLESS === "true"; // Use EIP-3009 gasless transfer

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

// USDC ABI with EIP-3009 support
const usdcAbi = parseAbi([
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

/**
 * Generate random nonce for EIP-3009
 */
function generateNonce(): `0x${string}` {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Sign EIP-3009 transferWithAuthorization
 */
async function signTransferAuthorization(
  to: `0x${string}`,
  amount: string
) {
  console.log(`🔏 Signing EIP-3009 authorization (no gas needed)...`);

  const amountWei = parseUnits(amount, 6); // USDC has 6 decimals
  const nonce = generateNonce();
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // Valid for 1 hour

  // Get USDC domain separator
  const domainSeparator = await publicClient.readContract({
    address: usdcContractAddress,
    abi: usdcAbi,
    functionName: "DOMAIN_SEPARATOR",
  });

  // EIP-3009 typehash (per EIP-3009 spec)
  const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
    toHex("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
  );

  // Encode struct hash
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [TRANSFER_WITH_AUTHORIZATION_TYPEHASH, account.address, to, amountWei, validAfter, validBefore, nonce]
    )
  );

  // EIP-712 digest: 0x1901 ‖ domainSeparator ‖ structHash
  const digest = keccak256(
    concat([
      "0x1901",
      domainSeparator,
      structHash
    ])
  );

  // Sign
  const signature = await account.sign({ hash: digest });

  console.log(`   ✅ Authorization signed`);
  console.log(`   Nonce: ${nonce}`);

  return {
    from: account.address,
    to,
    value: amountWei.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    signature,
  };
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
 * Call server to mint tokens (traditional flow with payment tx hash)
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
 * Call server to mint tokens with gasless EIP-3009 payment
 */
async function requestMintGasless(authorization: any) {
  console.log(`\n🎫 Requesting gasless mint from server...`);
  console.log(`   This may take up to 60 seconds...`);

  const response = await axios.post(
    `${serverUrl}/mint-gasless`, 
    {
      authorization,
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
  console.log(`Server: ${serverUrl}`);
  console.log(`Mode: ${useGasless ? "🆓 GASLESS (EIP-3009)" : "💰 Traditional"}\n`);

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

    let mintResult;

    if (useGasless) {
      // Gasless flow: Sign EIP-3009 authorization
      console.log(`\n🆓 Step 2: Creating gasless authorization (NO GAS!)...`);
      
      // Check USDC balance first
      const balance = await publicClient.readContract({
        address: usdcContractAddress,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [account.address],
      });
      
      const amountWei = parseUnits(paymentAmount, 6);
      const balanceFormatted = formatUnits(balance, 6);
      console.log(`   Your USDC balance: ${balanceFormatted} USDC`);
      
      if (balance < amountWei) {
        throw new Error(
          `Insufficient USDC balance. You have ${balanceFormatted} USDC but need ${paymentAmount} USDC`
        );
      }

      const authorization = await signTransferAuthorization(payToAddress, paymentAmount);
      
      // 3. Request gasless mint from server
      console.log(`\n🎨 Step 3: Minting tokens (server pays gas)...`);
      mintResult = await requestMintGasless(authorization);
    } else {
      // Traditional flow: Send USDC payment
      console.log(`\n💰 Step 2: Sending ${paymentAmount} USDC payment...`);
      const { hash: paymentTxHash } = await sendUSDCPayment(payToAddress, paymentAmount);

      // 3. Request mint from server
      console.log(`\n🎨 Step 3: Minting tokens...`);
      mintResult = await requestMint(paymentTxHash, account.address);
    }

    // 4. Display results
    console.log("\n✨ SUCCESS! Tokens minted!");
    console.log("============================");
    console.log(`Payer: ${mintResult.payer}`);
    console.log(`Amount: ${formatUnits(BigInt(mintResult.amount), 18)} tokens`);
    if (mintResult.paymentTxHash) {
      console.log(`Payment TX: ${mintResult.paymentTxHash}`);
    }
    console.log(`Mint TX: ${mintResult.mintTxHash}`);
    console.log(`Block: ${mintResult.blockNumber}`);
    
    if (useGasless) {
      console.log("\n💡 You paid ZERO gas fees! Server paid for everything.");
    }
    
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
