import { config } from "dotenv";
import Database from "better-sqlite3";
import axios from "axios";
import { 
  createWalletClient, 
  http, 
  formatUnits, 
  createPublicClient,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import * as readline from "readline";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

config();

// Environment variables
const serverUrl = process.env.SERVER_URL || "http://localhost:4021";
const mnemonic = process.env.MNEMONIC;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const tokenAddress = process.env.TOKEN_ADDRESS;
const encryptionPassword = process.env.ENCRYPTION_PASSWORD as string;

// USDC contract addresses
const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// Validation
if (!encryptionPassword) {
  console.error("❌ Missing ENCRYPTION_PASSWORD in .env");
  process.exit(1);
}

const chain = network === "base-sepolia" ? baseSepolia : base;
const usdcAddress = USDC_ADDRESSES[network];

// RPC URL configuration
function getRpcUrls(): string[] {
  const urls: string[] = [];
  
  if (network === "base-sepolia") {
    if (process.env.BASE_SEPOLIA_RPC_URL) urls.push(process.env.BASE_SEPOLIA_RPC_URL);
    if (process.env.BASE_SEPOLIA_RPC_URL_2) urls.push(process.env.BASE_SEPOLIA_RPC_URL_2);
    if (process.env.BASE_SEPOLIA_RPC_URL_3) urls.push(process.env.BASE_SEPOLIA_RPC_URL_3);
    if (urls.length === 0) urls.push("https://sepolia.base.org");
  } else {
    if (process.env.BASE_RPC_URL) urls.push(process.env.BASE_RPC_URL);
    if (process.env.BASE_RPC_URL_2) urls.push(process.env.BASE_RPC_URL_2);
    if (process.env.BASE_RPC_URL_3) urls.push(process.env.BASE_RPC_URL_3);
    if (urls.length === 0) urls.push("https://mainnet.base.org");
  }
  
  return urls;
}

const rpcUrls = getRpcUrls();
const rpcUrl = rpcUrls[0];

// USDC ABI
const USDC_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
]);

// Encryption/Decryption utilities
const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function encryptPrivateKey(privateKey: string, password: string): string {
  const key = scryptSync(password, 'salt', KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPrivateKey(encryptedData: string, password: string): string {
  const key = scryptSync(password, 'salt', KEY_LENGTH);
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Database setup
const db = new Database("wallets.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address_index INTEGER NOT NULL UNIQUE,
    address TEXT NOT NULL UNIQUE,
    private_key TEXT NOT NULL,
    usdc_balance TEXT DEFAULT '0',
    last_balance_update INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

/**
 * Generate wallets from mnemonic
 */
async function generateWallets(count: number = 1000) {
  if (!mnemonic) {
    console.error("❌ Missing MNEMONIC in .env");
    process.exit(1);
  }
  
  console.log(`\n📝 Generating ${count} wallets from mnemonic...`);
  console.log("   ⚠️  Private keys will be encrypted and stored in database");
  
  const insert = db.prepare(
    "INSERT OR IGNORE INTO wallets (address_index, address, private_key) VALUES (?, ?, ?)"
  );

  const insertMany = db.transaction((wallets: any[]) => {
    for (const wallet of wallets) {
      insert.run(wallet.addressIndex, wallet.address, wallet.privateKey);
    }
  });

  const wallets = [];
  const seed = mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  
  for (let i = 0; i < count; i++) {
    const path = `m/44'/60'/0'/0/${i}`;
    const childKey = hdKey.derive(path);
    
    if (!childKey.privateKey) {
      throw new Error(`Failed to derive private key for index ${i}`);
    }
    
    const privateKey = `0x${Buffer.from(childKey.privateKey).toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const encryptedPrivateKey = encryptPrivateKey(privateKey, encryptionPassword);
    
    wallets.push({
      addressIndex: i,
      address: account.address,
      privateKey: encryptedPrivateKey,
    });

    if (i % 100 === 0 && i > 0) {
      console.log(`   Generated ${i}/${count} wallets...`);
    }
  }

  insertMany(wallets);
  console.log(`✅ Generated and saved ${count} wallets to database`);
}

/**
 * Fetch USDC balances for all wallets with concurrent batch processing
 */
async function fetchAllBalances(batchSize: number = 20, delayMs: number = 100) {
  console.log("\n💰 Fetching USDC balances (Concurrent Mode)...");
  console.log(`   Using ${rpcUrls.length} RPC endpoint(s)`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Delay: ${delayMs}ms`);

  const wallets = db.prepare("SELECT id, address FROM wallets").all() as any[];
  console.log(`   Found ${wallets.length} wallets\n`);

  const update = db.prepare(
    "UPDATE wallets SET usdc_balance = ?, last_balance_update = ? WHERE id = ?"
  );

  let currentRpcIndex = 0;
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  const fetchWalletBalance = async (wallet: any): Promise<{ wallet: any; balance?: bigint; error?: any }> => {
    let lastError: any;
    
    for (let attempt = 0; attempt < Math.min(3, rpcUrls.length); attempt++) {
      try {
        const rpcUrl = rpcUrls[(currentRpcIndex + attempt) % rpcUrls.length];
        const publicClient = createPublicClient({
          chain,
          transport: http(rpcUrl, {
            timeout: 30000,
            retryCount: 1,
          }),
        });

        const balance = await publicClient.readContract({
          address: usdcAddress,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [wallet.address as `0x${string}`],
        });

        return { wallet, balance };
      } catch (error: any) {
        lastError = error;
        
        if (error.message?.includes('429') || error.status === 429) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        if (attempt < Math.min(2, rpcUrls.length - 1)) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    return { wallet, error: lastError };
  };

  for (let i = 0; i < wallets.length; i += batchSize) {
    const batch = wallets.slice(i, Math.min(i + batchSize, wallets.length));
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(wallets.length / batchSize);
    
    console.log(`📦 Batch ${batchNum}/${totalBatches} (wallets ${i + 1}-${Math.min(i + batchSize, wallets.length)})...`);

    const results = await Promise.allSettled(
      batch.map((wallet, idx) => {
        return new Promise(resolve => 
          setTimeout(
            () => fetchWalletBalance(wallet).then(resolve),
            idx * delayMs
          )
        );
      })
    );

    const timestamp = Math.floor(Date.now() / 1000);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const data = result.value as { wallet: any; balance?: bigint; error?: any };
        if (data.balance !== undefined) {
          update.run(data.balance.toString(), timestamp, data.wallet.id);
          successCount++;
        } else {
          console.error(`   ❌ Wallet ${data.wallet.id}: ${data.error?.message || data.error}`);
          failCount++;
        }
      } else {
        console.error(`   ❌ Request failed: ${result.reason}`);
        failCount++;
      }
    }

    currentRpcIndex = (currentRpcIndex + 1) % rpcUrls.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = ((successCount + failCount) / (Date.now() - startTime) * 1000).toFixed(1);
    const progress = ((successCount + failCount) / wallets.length * 100).toFixed(1);
    console.log(`   📊 Progress: ${successCount + failCount}/${wallets.length} (${progress}%) - ${successCount} ✅ ${failCount} ❌ - ${elapsed}s - ${rate} req/s\n`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgRate = ((successCount + failCount) / (Date.now() - startTime) * 1000).toFixed(1);

  console.log(`✅ Completed!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Time: ${totalTime}s`);
  console.log(`   Average rate: ${avgRate} req/s`);
}

/**
 * Show wallet statistics
 */
function showStats() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN usdc_balance > '0' THEN 1 END) as with_balance,
      SUM(CAST(usdc_balance AS INTEGER)) as total_balance
    FROM wallets
  `).get() as any;

  console.log("\n📊 Wallet Statistics:");
  console.log(`   Total wallets: ${stats.total}`);
  console.log(`   Wallets with USDC: ${stats.with_balance}`);
  console.log(`   Total USDC: ${formatUnits(BigInt(stats.total_balance || 0), 6)} USDC`);
}

/**
 * Create EIP-3009 authorization for x402 payment
 */
async function createTransferAuthorization(
  walletClient: any,
  account: any,
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  validAfter: bigint = 0n,
  validBefore: bigint = BigInt(Math.floor(Date.now() / 1000) + 3600)
): Promise<any> {
  const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  
  // USDC domain (EIP-712)
  const usdcName = network === 'base-sepolia' ? 'USDC' : 'USD Coin';
  const domain = {
    name: usdcName,
    version: '2',
    chainId: chain.id,
    verifyingContract: usdcAddress,
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
    from: from,
    to: to,
    value: value.toString(),
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    signature,
  };
}

/**
 * Mint with x402 payment flow
 */
async function mintWithX402(
  walletClient: any,
  account: any,
  tokenAddress: string,
  quantity: number = 1
): Promise<any> {
  try {
    console.log(`   Step 1: Initial request to get 402 response...`);
    
    // Step 1: Make initial request without payment (will get 402)
    let response402: any;
    try {
      await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
        quantity,
      });
      throw new Error("Expected 402 response but got success");
    } catch (error: any) {
      if (error.response?.status === 402) {
        response402 = error.response;
        console.log(`   ✅ Received 402 Payment Required`);
      } else {
        throw error;
      }
    }

    // Step 2: Parse payment requirements from 402 response body
    const x402Response = response402.data;
    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      throw new Error("No payment requirements in 402 response");
    }

    const paymentRequirements = x402Response.accepts[0]; // Use first payment option

    console.log(`   Step 2: Creating x402 payment authorization...`);
    console.log(`   Amount: ${formatUnits(BigInt(paymentRequirements.maxAmountRequired || 0), 6)} USDC`);
    console.log(`   Pay to: ${paymentRequirements.payTo}`);

    // Step 3: Create EIP-3009 authorization
    const authorization = await createTransferAuthorization(
      walletClient,
      account,
      account.address,
      paymentRequirements.payTo as `0x${string}`,
      BigInt(paymentRequirements.maxAmountRequired)
    );

    console.log(`   ✅ Authorization created`);

    // Step 4: Construct x402 payment payload
    // Extract signature from authorization (x402 format expects it separately)
    const { signature, ...authWithoutSignature } = authorization;
    
    const paymentPayload = {
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network, // REQUIRED: Must match payment requirements
      value: paymentRequirements.maxAmountRequired,
      resource: paymentRequirements.resource,
      payload: {
        authorization: authWithoutSignature, // Authorization without signature
        signature: signature // Signature at payload root level
      }
    };

    console.log(`   📦 Payment payload:`);
    console.log(`      - scheme: ${paymentPayload.scheme}`);
    console.log(`      - network: ${paymentPayload.network}`);
    console.log(`      - value: ${paymentPayload.value}`);
    console.log(`      - resource: ${paymentPayload.resource}`);

    // Step 5: Encode payment payload to base64 for X-PAYMENT header
    const paymentPayloadBase64 = Buffer.from(
      JSON.stringify(paymentPayload)
    ).toString('base64');

    console.log(`   Step 3: Sending mint request with payment...`);

    // Step 6: Retry request with X-PAYMENT header
    const finalResponse = await axios.post(
      `${serverUrl}/api/mint/${tokenAddress}`,
      { quantity },
      {
        headers: {
          'X-PAYMENT': paymentPayloadBase64,
        },
      }
    );

    console.log(`   ✅ Mint successful!`);
    return finalResponse.data;

  } catch (error: any) {
    console.error(`   ❌ Mint failed: ${error.message}`);
    if (error.response?.data) {
      console.error(`   Response:`, error.response.data);
    }
    throw error;
  }
}

/**
 * Check token price and payment info
 */
async function checkTokenPrice() {
  if (!tokenAddress) {
    console.error("❌ Missing TOKEN_ADDRESS in .env");
    process.exit(1);
  }
  
  console.log("\n💰 Token Price Info:");
  console.log(`   Server: ${serverUrl}`);
  console.log(`   Token: ${tokenAddress}`);
  
  try {
    const response = await axios.get(`${serverUrl}/api/tokens/${tokenAddress}`);
    const tokenInfo = response.data;
    
    console.log(`\n   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`   Payment Address: ${tokenInfo.paymentAddress}`);
    
    if (tokenInfo.price) {
      console.log(`   Price: ${tokenInfo.price}`);
      
      const priceMatch = tokenInfo.price.match(/(\d+(\.\d+)?)/);
      if (priceMatch) {
        const priceValue = parseFloat(priceMatch[1]);
        if (priceValue === 0) {
          console.log(`   ⚠️  Price is 0 - This is a FREE token!`);
        } else {
          console.log(`   💵 Price per mint: ${priceValue} USDC`);
        }
      }
    } else {
      console.log(`   ⚠️  No price info - might be FREE`);
    }
    
    if (tokenInfo.tokensPerMint) {
      const tokensPerMint = formatUnits(BigInt(tokenInfo.tokensPerMint), 18);
      console.log(`   Tokens per mint: ${tokensPerMint}`);
    }
    
    if (tokenInfo.remainingSupply) {
      const remaining = formatUnits(BigInt(tokenInfo.remainingSupply), 18);
      console.log(`   Remaining supply: ${remaining}`);
    }
    
  } catch (error: any) {
    console.error(`\n   ❌ Failed to get token info`);
    if (error.response?.status === 404) {
      console.error(`   Token not found: ${tokenAddress}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

/**
 * Test x402 payment flow with a single mint
 */
async function testX402Flow(walletId: number) {
  if (!tokenAddress) {
    console.error("❌ Missing TOKEN_ADDRESS in .env");
    process.exit(1);
  }
  
  console.log("\n🧪 Testing x402 Payment Flow:");
  console.log(`   Using wallet ID: ${walletId}`);
  
  const wallet = db.prepare("SELECT address, private_key FROM wallets WHERE id = ?").get(walletId) as any;
  if (!wallet) {
    console.error("❌ Wallet not found");
    return;
  }

  console.log(`   Wallet address: ${wallet.address}`);
  
  try {
    const decryptedPrivateKey = decryptPrivateKey(wallet.private_key, encryptionPassword) as `0x${string}`;
    const account = privateKeyToAccount(decryptedPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    const result = await mintWithX402(walletClient, account, tokenAddress, 1);
    
    console.log(`\n   ✅ SUCCESS!`);
    console.log(`   Result:`, JSON.stringify(result, null, 2));

  } catch (error: any) {
    console.error(`\n   ❌ Error: ${error.message}`);
  }
}

/**
 * Concurrent batch mint with x402 payment
 */
async function batchMintConcurrent(
  startIndex: number,
  endIndex: number,
  totalMints: number,
  concurrency: number = 10,
  delayMs: number = 1000,
  quantityPerMint: number = 10
) {
  if (!tokenAddress) {
    console.error("❌ Missing TOKEN_ADDRESS in .env");
    process.exit(1);
  }
  
  console.log(`\n🚀 x402 Concurrent Batch Mint Configuration:`);
  console.log(`   Wallet range: ${startIndex} to ${endIndex}`);
  console.log(`   Total mint requests: ${totalMints}`);
  console.log(`   Quantity per mint: ${quantityPerMint}x`);
  console.log(`   Concurrent workers: ${concurrency}`);
  console.log(`   Delay: ${delayMs}ms`);
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   Network: ${network}`);
  console.log(`   Payment: x402 (via facilitator)`);
  
  // Get token price
  console.log(`\n📋 Fetching token info...`);
  
  let tokenInfo: any;
  try {
    const response = await axios.get(`${serverUrl}/api/tokens/${tokenAddress}`);
    tokenInfo = response.data;
  } catch (error: any) {
    console.error(`\n❌ Failed to fetch token info`);
    process.exit(1);
  }
  
  const priceMatch = tokenInfo.price.match(/[\d.]+/);
  const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 1;
  const pricePerMintWei = BigInt(Math.floor(pricePerMint * 1e6));
  
  console.log(`   ✅ Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
  console.log(`   Price per mint: ${pricePerMint} USDC`);

  // Get all wallets
  const allWallets = db.prepare(
    "SELECT id, address_index, address, private_key, usdc_balance FROM wallets WHERE address_index >= ? AND address_index <= ? ORDER BY address_index"
  ).all(startIndex, endIndex) as any[];

  if (allWallets.length === 0) {
    console.error("❌ No wallets found in range");
    return;
  }

  const pricePerRequest = pricePerMintWei * BigInt(quantityPerMint);
  
  const walletsWithMintInfo = allWallets.map(w => {
    const balance = BigInt(w.usdc_balance || 0);
    const maxFullMints = balance > 0n ? Number(balance / pricePerRequest) : 0;
    const maxTokens = balance > 0n ? Number(balance / pricePerMintWei) : 0;
    
    return {
      ...w,
      balance,
      maxMints: maxFullMints,
      maxTokens,
      currentMints: 0,
      mintedTokens: 0,
    };
  });

  const availableWallets = walletsWithMintInfo.filter(w => w.maxTokens > 0);

  console.log(`\n📊 Wallet Balance Summary:`);
  console.log(`   Total wallets: ${allWallets.length}`);
  console.log(`   With balance: ${availableWallets.length}`);
  console.log(`   Zero balance: ${allWallets.length - availableWallets.length} (skipped)`);
  
  if (availableWallets.length === 0) {
    console.error("\n❌ No wallets with balance");
    console.error("💡 Run 'npm run x402 fetch-balances' first");
    return;
  }
  
  const totalPossibleTokens = availableWallets.reduce((sum, w) => sum + w.maxTokens, 0);
  console.log(`\n   Total tokens available: ${totalPossibleTokens}`);
  console.log(`   Estimated requests: ~${Math.ceil(totalPossibleTokens / quantityPerMint)}`);

  // Confirm
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("\n⚠️  Continue with x402 batch mint? (yes/no): ", resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== "yes") {
    console.log("❌ Cancelled");
    return;
  }

  console.log("\n🎨 Starting x402 concurrent batch mint...");
  console.log("=".repeat(70));

  // Shared state
  const state = {
    successCount: 0,
    failCount: 0,
    completedMints: 0,
    walletFailCounts: new Map<number, number>(),
  };

  // Assign wallets to workers
  const walletsPerWorker = Math.ceil(availableWallets.length / concurrency);
  const workerWallets: typeof availableWallets[] = [];
  
  for (let i = 0; i < concurrency; i++) {
    const start = i * walletsPerWorker;
    const end = Math.min((i + 1) * walletsPerWorker, availableWallets.length);
    workerWallets.push(availableWallets.slice(start, end));
  }

  console.log(`\n📦 Worker allocation:`);
  for (let i = 0; i < workerWallets.length; i++) {
    if (workerWallets[i].length > 0) {
      const maxMints = workerWallets[i].reduce((sum, w) => sum + w.maxMints, 0);
      console.log(`   Worker ${i}: ${workerWallets[i].length} wallets, max ${maxMints} mints`);
    }
  }

  // Create workers
  const workers: Promise<void>[] = [];
  
  for (let workerId = 0; workerId < concurrency; workerId++) {
    const myWallets = workerWallets[workerId];
    if (!myWallets || myWallets.length === 0) continue;

    const worker = async () => {
      let walletIndex = 0;
      const exhaustedWallets = new Set<number>();

      while (state.completedMints < totalMints) {
        if (exhaustedWallets.size >= myWallets.length) {
          console.log(`\n⚠️  Worker ${workerId}: All wallets exhausted`);
          break;
        }

        if (walletIndex >= myWallets.length) {
          walletIndex = 0;
        }

        const wallet = myWallets[walletIndex];
        walletIndex++;

        if (exhaustedWallets.has(wallet.id)) continue;

        const walletFailCount = state.walletFailCounts.get(wallet.id) || 0;
        if (walletFailCount >= 3) {
          console.log(`\n⚠️  Worker ${workerId}: Wallet #${wallet.id} - too many failures`);
          exhaustedWallets.add(wallet.id);
          continue;
        }

        const remainingTokens = wallet.maxTokens - wallet.mintedTokens;
        
        if (remainingTokens <= 0) {
          exhaustedWallets.add(wallet.id);
          continue;
        }

        try {
          const actualQuantity = Math.min(quantityPerMint, remainingTokens);
          const actualPrice = pricePerMintWei * BigInt(actualQuantity);
          
          console.log(`\n💼 Worker ${workerId}: Wallet #${wallet.id}`);
          console.log(`   Address: ${wallet.address}`);
          console.log(`   Balance: ${formatUnits(wallet.balance, 6)} USDC`);
          console.log(`   Progress: ${wallet.mintedTokens}/${wallet.maxTokens} tokens`);
          console.log(`   This mint: ${actualQuantity}x (${formatUnits(actualPrice, 6)} USDC)`);
          
          const decryptedPrivateKey = decryptPrivateKey(wallet.private_key, encryptionPassword) as `0x${string}`;
          const account = privateKeyToAccount(decryptedPrivateKey);
          const walletClient = createWalletClient({
            account,
            chain,
            transport: http(rpcUrl),
          });

          const result = await mintWithX402(walletClient, account, tokenAddress, actualQuantity);
          
          if (result.queueId) {
            console.log(`   ✅ Worker ${workerId}: Queued ${result.queueId}`);
          } else {
            console.log(`   ✅ Worker ${workerId}: Success`);
          }
          
          wallet.currentMints++;
          wallet.mintedTokens += actualQuantity;
          state.successCount++;
          
          if (wallet.maxTokens - wallet.mintedTokens <= 0) {
            console.log(`   🎯 Worker ${workerId}: Wallet #${wallet.id} exhausted`);
            exhaustedWallets.add(wallet.id);
          }

          state.completedMints++;
          console.log(`   📊 Progress: ${state.completedMints}/${totalMints} (${state.successCount} ✅, ${state.failCount} ❌)`);

          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }

        } catch (error: any) {
          console.error(`   ❌ Worker ${workerId}: ${error.message}`);
          state.failCount++;
          state.walletFailCounts.set(wallet.id, (state.walletFailCounts.get(wallet.id) || 0) + 1);
          state.completedMints++;
        }
      }
    };

    workers.push(worker());
  }

  // Wait for all workers
  await Promise.all(workers);

  console.log("\n" + "=".repeat(70));
  console.log("✨ x402 concurrent batch mint completed!");
  console.log(`   Successful: ${state.successCount}`);
  console.log(`   Failed: ${state.failCount}`);
  console.log(`   Total: ${state.completedMints}`);
  
  const totalTokensMinted = availableWallets.reduce((sum, w) => sum + w.mintedTokens, 0);
  console.log(`   Tokens minted: ${totalTokensMinted}`);
  
  const usedWallets = availableWallets.filter(w => w.currentMints > 0);
  console.log(`   Wallets used: ${usedWallets.length}`);
}

/**
 * Parse named arguments
 */
function parseArgs(args: string[], schema: { [key: string]: number }): { [key: string]: number } {
  const result: { [key: string]: number } = {};
  const keys = Object.keys(schema);
  
  if (args[0]?.startsWith('--')) {
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.replace(/^--/, '');
      const value = args[i + 1];
      
      if (key && value !== undefined) {
        const parsed = parseInt(value);
        if (!isNaN(parsed)) {
          result[key] = parsed;
        }
      }
    }
  } else {
    keys.forEach((key, index) => {
      const value = args[index];
      if (value !== undefined) {
        const parsed = parseInt(value);
        if (!isNaN(parsed)) {
          result[key] = parsed;
        }
      }
    });
  }
  
  keys.forEach(key => {
    if (result[key] === undefined && schema[key] !== undefined) {
      result[key] = schema[key];
    }
  });
  
  return result;
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log("🔧 x402 Batch Mint Tool");
  console.log("=".repeat(50));
  console.log(`Network: ${network}`);
  console.log(`Payment: x402 (via facilitator)`);
  if (tokenAddress) {
    console.log(`Token: ${tokenAddress}`);
  }

  if (!command) {
    console.log("\nCommands:");
    console.log("  generate [count]          Generate wallets (default: 1000)");
    console.log("  fetch-balances [batch] [delay]  Fetch USDC balances (concurrent)");
    console.log("  stats                     Show wallet statistics");
    console.log("  check-price               Check token price");
    console.log("  test <wallet_id>          Test x402 flow with one wallet");
    console.log("\n  concurrent [OPTIONS]      Concurrent batch mint with x402 ⚡");
    console.log("    Named Parameters:");
    console.log("      --start <n>           Starting wallet index (required)");
    console.log("      --end <n>             Ending wallet index (required)");
    console.log("      --total <n>           Total mint requests (required)");
    console.log("      --workers <n>         Concurrent workers (default: 10)");
    console.log("      --delay <ms>          Delay between requests (default: 1000)");
    console.log("      --quantity <n>        Tokens per mint (default: 10)");
    console.log("\n💡 Examples:");
    console.log("  npm run x402 generate 1000");
    console.log("  npm run x402 fetch-balances");
    console.log("  npm run x402 check-price");
    console.log("  npm run x402 test 1");
    console.log("  npm run x402 concurrent --start 0 --end 999 --total 1000 --workers 10 --quantity 10");
    return;
  }

  try {
    switch (command) {
      case "generate": {
        const count = parseInt(args[1]) || 1000;
        await generateWallets(count);
        showStats();
        break;
      }

      case "fetch-balances": {
        const batchSize = args[1] ? parseInt(args[1]) : 20;
        const delayMs = args[2] ? parseInt(args[2]) : 100;
        await fetchAllBalances(batchSize, delayMs);
        showStats();
        break;
      }

      case "stats": {
        showStats();
        break;
      }

      case "check-price": {
        await checkTokenPrice();
        break;
      }

      case "test": {
        const walletId = parseInt(args[1]);
        if (isNaN(walletId)) {
          console.error("❌ Please provide a wallet ID");
          process.exit(1);
        }
        await testX402Flow(walletId);
        break;
      }

      case "concurrent": {
        const params = parseArgs(args.slice(1), {
          start: NaN,
          end: NaN,
          total: NaN,
          workers: 10,
          delay: 1000,
          quantity: 10,
        });

        const { start, end, total, workers, delay, quantity } = params;

        if (isNaN(start) || isNaN(end) || isNaN(total)) {
          console.error("❌ Invalid parameters");
          console.error("\nUsage:");
          console.error("  concurrent --start 0 --end 999 --total 1000 --workers 10 --quantity 10");
          process.exit(1);
        }

        await batchMintConcurrent(start, end, total, workers, delay, quantity);
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();

