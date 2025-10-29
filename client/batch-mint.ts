import { config } from "dotenv";
import Database from "better-sqlite3";
import axios from "axios";
import { 
  createWalletClient, 
  http, 
  formatUnits, 
  parseUnits,
  createPublicClient,
  parseAbi,
  getAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import * as readline from "readline";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { randomBytes } from "crypto";

config();

// Environment variables
const serverUrl = process.env.SERVER_URL || "http://localhost:4021";
const mnemonic = process.env.MNEMONIC as string;
const network = (process.env.NETWORK || "base-sepolia") as "base-sepolia" | "base";
const tokenAddress = process.env.TOKEN_ADDRESS as `0x${string}`;

// USDC contract addresses
const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet USDC
};

// Validation
if (!mnemonic) {
  console.error("❌ Missing MNEMONIC in .env");
  process.exit(1);
}

if (!tokenAddress) {
  console.error("❌ Missing TOKEN_ADDRESS in .env");
  process.exit(1);
}

const chain = network === "base-sepolia" ? baseSepolia : base;
const usdcAddress = USDC_ADDRESSES[network];

// RPC URL configuration
const rpcUrl = network === "base-sepolia" 
  ? (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org")
  : (process.env.BASE_RPC_URL || "https://mainnet.base.org");

// USDC ABI
const USDC_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
]);

// Database setup
const db = new Database("wallets.db");

// Create table
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
  console.log(`\n📝 Generating ${count} wallets from mnemonic...`);
  
  const insert = db.prepare(
    "INSERT OR IGNORE INTO wallets (address_index, address, private_key) VALUES (?, ?, ?)"
  );

  const insertMany = db.transaction((wallets: any[]) => {
    for (const wallet of wallets) {
      insert.run(wallet.addressIndex, wallet.address, wallet.privateKey);
    }
  });

  const wallets = [];
  
  // Derive HD key from mnemonic
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
    
    wallets.push({
      addressIndex: i,
      address: account.address,
      privateKey: privateKey,
    });

    if (i % 100 === 0 && i > 0) {
      console.log(`   Generated ${i}/${count} wallets...`);
    }
  }

  insertMany(wallets);
  console.log(`✅ Generated and saved ${count} wallets to database`);
}

/**
 * Fetch USDC balances for all wallets
 */
async function fetchAllBalances() {
  console.log("\n💰 Fetching USDC balances...");
  
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const wallets = db.prepare("SELECT id, address FROM wallets").all() as any[];
  console.log(`   Found ${wallets.length} wallets in database`);

  const update = db.prepare(
    "UPDATE wallets SET usdc_balance = ?, last_balance_update = ? WHERE id = ?"
  );

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    
    try {
      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [wallet.address as `0x${string}`],
      });

      const balanceStr = balance.toString();
      const timestamp = Math.floor(Date.now() / 1000);
      update.run(balanceStr, timestamp, wallet.id);

      if (i % 50 === 0) {
        console.log(`   Updated ${i + 1}/${wallets.length} balances...`);
      }
    } catch (error: any) {
      console.error(`   Failed to fetch balance for wallet ${wallet.id}: ${error.message}`);
    }
  }

  console.log(`✅ Updated balances for ${wallets.length} wallets`);
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
 * Create EIP-3009 authorization signature for USDC transferWithAuthorization
 */
async function createTransferAuthorization(
  walletClient: any,
  account: any,
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
 * Check token price and payment info
 */
async function checkTokenPrice() {
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
      
      // Parse price if in format like "1000000 USDC"
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
    console.error(`   ❌ Failed to get token info: ${error.message}`);
  }
}

/**
 * Test traditional EIP-3009 payment flow with a single mint
 */
async function testTraditionalFlow(walletId: number) {
  console.log("\n🧪 Testing Traditional EIP-3009 Payment Flow:");
  console.log(`   Using wallet ID: ${walletId}`);
  
  const wallet = db.prepare("SELECT address, private_key FROM wallets WHERE id = ?").get(walletId) as any;
  if (!wallet) {
    console.error("❌ Wallet not found");
    return;
  }

  console.log(`   Wallet address: ${wallet.address}`);
  
  try {
    // Create account
    const account = privateKeyToAccount(wallet.private_key as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    console.log("\n   Step 1: Fetching token info...");
    const response = await axios.get(`${serverUrl}/api/tokens/${tokenAddress}`);
    const tokenInfo = response.data;
    
    console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
    console.log(`   Price: ${tokenInfo.price}`);
    console.log(`   Payment address: ${tokenInfo.paymentAddress}`);

    console.log("\n   Step 2: Creating EIP-3009 authorization...");
    
    // Parse price
    const priceMatch = tokenInfo.price.match(/[\d.]+/);
    const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 1;
    const paymentAmount = BigInt(Math.floor(pricePerMint * 1e6)); // USDC 6 decimals
    
    console.log(`   Payment amount: ${formatUnits(paymentAmount, 6)} USDC`);
    
    // Create authorization
    const authorization = await createTransferAuthorization(
      walletClient,
      account,
      account.address,
      tokenInfo.paymentAddress as `0x${string}`,
      paymentAmount
    );
    
    console.log(`   ✅ Authorization created`);

    console.log("\n   Step 3: Sending mint request with authorization...");
    const mintResponse = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
      payer: account.address,
      authorization: authorization,
    });

    console.log(`   Response status: ${mintResponse.status}`);
    console.log(`   ✅ SUCCESS!`);
    console.log(`   Result:`, JSON.stringify(mintResponse.data, null, 2));

  } catch (error: any) {
    console.error(`\n   ❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`   Response (${error.response.status}):`, error.response.data);
    }
  }
}

/**
 * Compare wallet balances (before and after)
 */
async function compareBalances(walletIds: number[]) {
  console.log("\n🔍 Balance Comparison:");
  
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  for (const id of walletIds) {
    const wallet = db.prepare("SELECT address, usdc_balance FROM wallets WHERE id = ?").get(id) as any;
    if (!wallet) continue;

    try {
      const dbBalance = BigInt(wallet.usdc_balance || 0);
      const chainBalance = await publicClient.readContract({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [wallet.address as `0x${string}`],
      });

      const dbBalanceFormatted = formatUnits(dbBalance, 6);
      const chainBalanceFormatted = formatUnits(chainBalance, 6);
      const diff = chainBalance - dbBalance;
      
      console.log(`\n   Wallet #${id} (${wallet.address.slice(0, 10)}...)`);
      console.log(`   DB Balance:    ${dbBalanceFormatted} USDC`);
      console.log(`   Chain Balance: ${chainBalanceFormatted} USDC`);
      
      if (diff !== 0n) {
        const diffFormatted = formatUnits(diff > 0 ? diff : -diff, 6);
        console.log(`   Difference:    ${diff > 0 ? '+' : '-'}${diffFormatted} USDC`);
      } else {
        console.log(`   ✅ Balances match`);
      }
    } catch (error: any) {
      console.error(`   ❌ Failed to check wallet ${id}: ${error.message}`);
    }
  }
}

/**
 * List wallets with filters
 */
function listWallets(options: { limit?: number; offset?: number; minBalance?: string } = {}) {
  let query = "SELECT id, address, usdc_balance FROM wallets";
  const params: any[] = [];

  if (options.minBalance) {
    query += " WHERE CAST(usdc_balance AS INTEGER) >= ?";
    params.push(options.minBalance);
  }

  query += " ORDER BY id";

  if (options.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
    
    if (options.offset) {
      query += " OFFSET ?";
      params.push(options.offset);
    }
  }

  const wallets = db.prepare(query).all(...params) as any[];
  
  console.log("\n📋 Wallets:");
  console.log("ID".padEnd(6) + "Address".padEnd(44) + "USDC Balance");
  console.log("-".repeat(70));
  
  for (const wallet of wallets) {
    const balance = formatUnits(BigInt(wallet.usdc_balance || 0), 6);
    console.log(
      wallet.id.toString().padEnd(6) +
      wallet.address.padEnd(44) +
      balance.padEnd(10) + " USDC"
    );
  }
}

/**
 * Concurrent batch mint tokens with automatic wallet rotation
 * Uses database balance only (no automatic refresh)
 */
async function batchMintConcurrent(
  startId: number,
  endId: number,
  totalMints: number,
  concurrency: number = 10,
  delayMs: number = 1000,
  minUsdcBalance: string = "100000" // 0.1 USDC minimum
) {
  console.log(`\n🚀 Concurrent Batch Mint Configuration:`);
  console.log(`   Wallet IDs: ${startId} to ${endId}`);
  console.log(`   Total mints: ${totalMints}`);
  console.log(`   Concurrent workers: ${concurrency}`);
  console.log(`   Delay between mints: ${delayMs}ms`);
  console.log(`   Min USDC balance: ${formatUnits(BigInt(minUsdcBalance), 6)} USDC`);
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   Network: ${network}`);
  
  // Get token price to calculate max mints per wallet
  console.log(`\n📋 Fetching token price...`);
  const tokenInfoResponse = await axios.get(`${serverUrl}/api/tokens/${tokenAddress}`);
  const tokenInfo = tokenInfoResponse.data;
  const priceMatch = tokenInfo.price.match(/[\d.]+/);
  const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 1;
  const pricePerMintWei = BigInt(Math.floor(pricePerMint * 1e6)); // USDC 6 decimals
  
  console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
  console.log(`   Price per mint: ${pricePerMint} USDC`);
  console.log(`   Payment address: ${tokenInfo.paymentAddress}`);

  // Get all wallets and calculate max mints for each
  const allWallets = db.prepare(
    "SELECT id, address_index, address, private_key, usdc_balance FROM wallets WHERE id >= ? AND id <= ? ORDER BY id"
  ).all(startId, endId) as any[];

  if (allWallets.length === 0) {
    console.error("❌ No wallets found in specified range");
    return;
  }

  // Calculate max mints per wallet based on database balance
  const walletsWithMintInfo = allWallets.map(w => {
    const balance = BigInt(w.usdc_balance || 0);
    const maxMints = balance > 0n ? Number(balance / pricePerMintWei) : 0;
    return {
      ...w,
      balance,
      maxMints,
      currentMints: 0, // Track how many times this wallet has minted
    };
  });

  // Filter out wallets with 0 balance
  const availableWallets = walletsWithMintInfo.filter(w => w.maxMints > 0);

  console.log(`\n📊 Wallet Balance Summary:`);
  console.log(`   Total wallets in range: ${allWallets.length}`);
  console.log(`   Wallets with balance > 0: ${availableWallets.length}`);
  console.log(`   Wallets with balance = 0: ${allWallets.length - availableWallets.length} (skipped)`);
  
  // Show top 10 wallets
  console.log(`\n   Top wallets by balance:`);
  const sortedByBalance = [...availableWallets].sort((a, b) => Number(b.balance - a.balance));
  for (let i = 0; i < Math.min(10, sortedByBalance.length); i++) {
    const w = sortedByBalance[i];
    console.log(`   #${w.id}: ${formatUnits(w.balance, 6)} USDC → max ${w.maxMints} mints`);
  }
  
  if (availableWallets.length === 0) {
    console.error("\n❌ No wallets with balance > 0");
    console.error("💡 Run 'npm run batch fetch-balances' to update wallet balances");
    return;
  }
  
  // Calculate total possible mints
  const totalPossibleMints = availableWallets.reduce((sum, w) => sum + w.maxMints, 0);
  console.log(`\n   Total possible mints: ${totalPossibleMints}`);
  
  if (totalMints > totalPossibleMints) {
    console.warn(`\n⚠️  Warning: Requested ${totalMints} mints but only ${totalPossibleMints} possible`);
    console.warn(`   Will mint ${totalPossibleMints} times instead`);
  }

  // Confirm
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("\n⚠️  Continue with concurrent batch mint? (yes/no): ", resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== "yes") {
    console.log("❌ Cancelled");
    return;
  }

  console.log("\n🎨 Starting concurrent batch mint...");
  console.log("=".repeat(70));

  // Shared state
  const state = {
    successCount: 0,
    failCount: 0,
    completedMints: 0,
    walletFailCounts: new Map<number, number>(),
  };

  // Assign wallets to workers (each worker gets exclusive wallets)
  const walletsPerWorker = Math.ceil(availableWallets.length / concurrency);
  const workerWallets: typeof availableWallets[] = [];
  
  for (let i = 0; i < concurrency; i++) {
    const start = i * walletsPerWorker;
    const end = Math.min((i + 1) * walletsPerWorker, availableWallets.length);
    workerWallets.push(availableWallets.slice(start, end));
  }

  console.log(`\n📦 Worker wallet allocation:`);
  for (let i = 0; i < workerWallets.length; i++) {
    if (workerWallets[i].length > 0) {
      const maxMintsForWorker = workerWallets[i].reduce((sum, w) => sum + w.maxMints, 0);
      console.log(`   Worker ${i}: ${workerWallets[i].length} wallets, max ${maxMintsForWorker} mints`);
    }
  }

  // Create worker pool
  const workers: Promise<void>[] = [];
  
  for (let workerId = 0; workerId < concurrency; workerId++) {
    const myWallets = workerWallets[workerId];
    if (!myWallets || myWallets.length === 0) {
      console.log(`   Worker ${workerId}: No wallets assigned, skipping`);
      continue;
    }

    const worker = async () => {
      let walletIndex = 0;
      const exhaustedWallets = new Set<number>();

      while (state.completedMints < totalMints) {
        // All my wallets exhausted?
        if (exhaustedWallets.size >= myWallets.length) {
          console.log(`\n⚠️  Worker ${workerId}: All assigned wallets exhausted`);
          break;
        }

        // Get next wallet (circular rotation within my wallets)
        if (walletIndex >= myWallets.length) {
          walletIndex = 0;
        }

        const wallet = myWallets[walletIndex];
        walletIndex++;

        // Skip exhausted wallets
        if (exhaustedWallets.has(wallet.id)) {
          continue;
        }

        // Skip if wallet has too many failures
        const walletFailCount = state.walletFailCounts.get(wallet.id) || 0;
        if (walletFailCount >= 3) {
          console.log(`\n⚠️  Worker ${workerId}: Wallet #${wallet.id} - too many failures, skipping`);
          exhaustedWallets.add(wallet.id);
          continue;
        }

        // Check if wallet reached max mints
        if (wallet.currentMints >= wallet.maxMints) {
          console.log(`\n✅ Worker ${workerId}: Wallet #${wallet.id} - reached max mints (${wallet.maxMints})`);
          exhaustedWallets.add(wallet.id);
          continue;
        }

        try {
          const remainingMints = wallet.maxMints - wallet.currentMints;
          console.log(`\n💼 Worker ${workerId}: Wallet #${wallet.id} (${wallet.address.slice(0, 10)}...)`);
          console.log(`   Balance: ${formatUnits(wallet.balance, 6)} USDC`);
          console.log(`   Mints: ${wallet.currentMints}/${wallet.maxMints} (${remainingMints} remaining)`);
          
          // Create account from stored private key
          const account = privateKeyToAccount(wallet.private_key as `0x${string}`);
          
          const walletClient = createWalletClient({
            account,
            chain,
            transport: http(rpcUrl),
          });

          console.log(`   💳 Creating EIP-3009 authorization...`);
          
          // Create authorization (reuse token info from earlier)
          const authorization = await createTransferAuthorization(
            walletClient,
            account,
            account.address,
            tokenInfo.paymentAddress as `0x${string}`,
            pricePerMintWei
          );
          
          console.log(`   📤 Sending mint request...`);
          
          const response = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
            payer: account.address,
            authorization: authorization,
          });
          
          console.log(`   📨 Response status: ${response.status}`);

          const result = response.data;
          if (result.queueId) {
            console.log(`   ✅ Worker ${workerId}: Queued ${result.queueId}`);
          } else {
            console.log(`   ✅ Worker ${workerId}: Minted ${result.mintTxHash?.slice(0, 10) || 'success'}`);
          }
          
          // Increment wallet's mint count
          wallet.currentMints++;
          state.successCount++;
          
          // Check if wallet is now exhausted
          if (wallet.currentMints >= wallet.maxMints) {
            console.log(`   🎯 Worker ${workerId}: Wallet #${wallet.id} - all mints used (${wallet.maxMints}/${wallet.maxMints})`);
            exhaustedWallets.add(wallet.id);
          }

          state.completedMints++;
          console.log(`   📊 Progress: ${state.completedMints}/${totalMints} (${state.successCount} success, ${state.failCount} failed)`);

          // Delay between mints
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }

        } catch (error: any) {
          if (error.response) {
            console.error(`   ❌ Worker ${workerId}: Error - ${error.response.status} - ${JSON.stringify(error.response.data)}`);
          } else {
            console.error(`   ❌ Worker ${workerId}: Error - ${error.message}`);
          }
          state.failCount++;
          state.walletFailCounts.set(wallet.id, (state.walletFailCounts.get(wallet.id) || 0) + 1);
          state.completedMints++;
        }
      }
    };

    workers.push(worker());
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  console.log("\n" + "=".repeat(70));
  console.log("✨ Concurrent batch mint completed!");
  console.log(`   Success: ${state.successCount}`);
  console.log(`   Failed: ${state.failCount}`);
  console.log(`   Total: ${state.completedMints}`);
  
  const usedWallets = availableWallets.filter(w => w.currentMints > 0);
  const exhaustedCount = availableWallets.filter(w => w.currentMints >= w.maxMints).length;
  
  console.log(`   Wallets used: ${usedWallets.length}`);
  console.log(`   Wallets exhausted: ${exhaustedCount}`);
  
  // Show wallet usage summary
  console.log(`\n📊 Wallet Usage Summary:`);
  for (const w of usedWallets) {
    const percentage = (w.currentMints / w.maxMints * 100).toFixed(1);
    console.log(`   #${w.id}: ${w.currentMints}/${w.maxMints} mints (${percentage}%)`);
  }
}

/**
 * Fetch balances for specific wallet IDs
 */
async function fetchWalletBalances(walletIds: number[]) {
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const update = db.prepare(
    "UPDATE wallets SET usdc_balance = ?, last_balance_update = ? WHERE id = ?"
  );

  for (const id of walletIds) {
    const wallet = db.prepare("SELECT address FROM wallets WHERE id = ?").get(id) as any;
    if (!wallet) continue;

    try {
      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [wallet.address as `0x${string}`],
      });

      const timestamp = Math.floor(Date.now() / 1000);
      update.run(balance.toString(), timestamp, id);
    } catch (error: any) {
      console.error(`   Failed to fetch balance for wallet ${id}: ${error.message}`);
    }
  }
}

/**
 * Batch mint tokens (sequential version)
 * Uses database balance only (no automatic refresh)
 */
async function batchMint(
  startId: number,
  endId: number,
  times: number,
  delayMs: number = 1000
) {
  console.log(`\n🚀 Batch Mint Configuration:`);
  console.log(`   Wallet IDs: ${startId} to ${endId}`);
  console.log(`   Mints per wallet: ${times} (requested)`);
  console.log(`   Delay between mints: ${delayMs}ms`);
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   Network: ${network}`);
  
  // Get token price to calculate max mints per wallet
  console.log(`\n📋 Fetching token price...`);
  const tokenInfoResponse = await axios.get(`${serverUrl}/api/tokens/${tokenAddress}`);
  const tokenInfo = tokenInfoResponse.data;
  const priceMatch = tokenInfo.price.match(/[\d.]+/);
  const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 1;
  const pricePerMintWei = BigInt(Math.floor(pricePerMint * 1e6)); // USDC 6 decimals
  
  console.log(`   Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
  console.log(`   Price per mint: ${pricePerMint} USDC`);

  // Get wallets in range
  const wallets = db.prepare(
    "SELECT id, address_index, address, private_key, usdc_balance FROM wallets WHERE id >= ? AND id <= ? ORDER BY id"
  ).all(startId, endId) as any[];

  if (wallets.length === 0) {
    console.error("❌ No wallets found in specified range");
    return;
  }

  // Calculate max mints for each wallet
  const walletsWithInfo = wallets.map(w => {
    const balance = BigInt(w.usdc_balance || 0);
    const maxMints = balance > 0n ? Number(balance / pricePerMintWei) : 0;
    return { ...w, balance, maxMints };
  });

  // Filter out zero balance wallets
  const availableWallets = walletsWithInfo.filter(w => w.maxMints > 0);

  console.log(`\n📊 Wallet Summary:`);
  console.log(`   Total wallets: ${wallets.length}`);
  console.log(`   Wallets with balance: ${availableWallets.length}`);
  console.log(`   Wallets with zero balance: ${wallets.length - availableWallets.length} (will skip)`);
  
  if (availableWallets.length === 0) {
    console.error("\n❌ No wallets with balance > 0");
    console.error("💡 Run 'npm run batch fetch-balances' to update wallet balances");
    return;
  }
  
  // Show wallet details
  console.log(`\n   Wallets to use:`);
  for (const w of availableWallets) {
    const actualMints = Math.min(times, w.maxMints);
    const status = actualMints < times ? ` (limited by balance)` : '';
    console.log(`   #${w.id}: ${formatUnits(w.balance, 6)} USDC → ${actualMints}/${times} mints${status}`);
  }
  
  // Confirm
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("\n⚠️  Continue with batch mint? (yes/no): ", resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== "yes") {
    console.log("❌ Cancelled");
    return;
  }

  console.log("\n🎨 Starting batch mint...");
  console.log("=".repeat(70));

  let successCount = 0;
  let failCount = 0;

  for (const wallet of availableWallets) {
    // Calculate actual mints (limited by balance)
    const actualMints = Math.min(times, wallet.maxMints);
    
    console.log(`\n📍 Wallet #${wallet.id} (${wallet.address})`);
    console.log(`   Balance: ${formatUnits(wallet.balance, 6)} USDC`);
    console.log(`   Max mints: ${wallet.maxMints}`);
    console.log(`   Will mint: ${actualMints} times`);

    // Skip if zero balance (shouldn't happen after filter, but safety check)
    if (actualMints === 0) {
      console.log(`   ⏭️  Skipping (zero balance)`);
      continue;
    }

    // Create account from stored private key
    const account = privateKeyToAccount(wallet.private_key as `0x${string}`);
    
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    // Mint actualMints times (limited by balance)
    for (let i = 1; i <= actualMints; i++) {
      try {
        console.log(`   Mint ${i}/${actualMints}...`);
        
        // Create authorization for each mint
        const authorization = await createTransferAuthorization(
          walletClient,
          account,
          account.address,
          tokenInfo.paymentAddress as `0x${string}`,
          pricePerMintWei
        );
        
        const response = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
          payer: account.address,
          authorization: authorization,
        });

        const result = response.data;
        if (result.queueId) {
          console.log(`   ✅ Queued: ${result.queueId}`);
        } else {
          console.log(`   ✅ Minted: ${result.mintTxHash || 'success'}`);
        }
        successCount++;

        // Wait between mints
        if (i < actualMints || wallet.id < availableWallets[availableWallets.length - 1].id) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error: any) {
        if (error.response) {
          console.error(`   ❌ Failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else {
          console.error(`   ❌ Error: ${error.message}`);
        }
        failCount++;
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("✨ Batch mint completed!");
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total: ${successCount + failCount}`);
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
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Token: ${tokenAddress}`);

  if (!command) {
    console.log("\nCommands:");
    console.log("  generate [count]           Generate wallets (default: 1000)");
    console.log("  fetch-balances            Fetch USDC balances for all wallets");
    console.log("  stats                     Show wallet statistics");
    console.log("  list [limit] [offset]     List wallets");
    console.log("  check-price               Check token price and payment info");
    console.log("  test-trad <wallet_id>     Test traditional EIP-3009 flow with one wallet");
    console.log("  compare <id1> <id2> ...   Compare DB vs chain balances");
    console.log("  mint <start> <end> <times> [delay]  Sequential batch mint");
    console.log("                            start: start wallet ID");
    console.log("                            end: end wallet ID");
    console.log("                            times: mints per wallet");
    console.log("                            delay: ms between mints (default: 1000)");
    console.log("  concurrent <start> <end> <total> [workers] [delay]  Concurrent mint");
    console.log("                            start: start wallet ID");
    console.log("                            end: end wallet ID");
    console.log("                            total: total number of mints");
    console.log("                            workers: concurrent workers (default: 10)");
    console.log("                            delay: ms between mints (default: 1000)");
    console.log("\nExample:");
    console.log("  npm run batch generate 1000");
    console.log("  npm run batch fetch-balances");
    console.log("  npm run batch check-price");
    console.log("  npm run batch test-trad 1");
    console.log("  npm run batch compare 1 2 3");
    console.log("  npm run batch mint 1 10 5 2000");
    console.log("  npm run batch concurrent 1 100 1000 10 1000");
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
        await fetchAllBalances();
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

      case "test-trad": {
        const walletId = parseInt(args[1]);
        if (isNaN(walletId)) {
          console.error("❌ Please provide a wallet ID");
          console.error("Usage: test-trad <wallet_id>");
          process.exit(1);
        }
        await testTraditionalFlow(walletId);
        break;
      }

      case "compare": {
        const walletIds = args.slice(1).map(id => parseInt(id)).filter(id => !isNaN(id));
        if (walletIds.length === 0) {
          console.error("❌ Please provide wallet IDs to compare");
          console.error("Usage: compare <id1> <id2> ...");
          process.exit(1);
        }
        await compareBalances(walletIds);
        break;
      }

      case "list": {
        const limit = args[1] ? parseInt(args[1]) : undefined;
        const offset = args[2] ? parseInt(args[2]) : undefined;
        listWallets({ limit, offset });
        break;
      }

      case "mint": {
        const startId = parseInt(args[1]);
        const endId = parseInt(args[2]);
        const times = parseInt(args[3]);
        const delay = args[4] ? parseInt(args[4]) : 1000;

        if (isNaN(startId) || isNaN(endId) || isNaN(times)) {
          console.error("❌ Invalid parameters for mint command");
          console.error("Usage: mint <start_id> <end_id> <times> [delay_ms]");
          process.exit(1);
        }

        if (startId < 1 || endId < startId) {
          console.error("❌ Invalid ID range");
          process.exit(1);
        }

        await batchMint(startId, endId, times, delay);
        break;
      }

      case "concurrent": {
        const startId = parseInt(args[1]);
        const endId = parseInt(args[2]);
        const totalMints = parseInt(args[3]);
        const workers = args[4] ? parseInt(args[4]) : 10;
        const delay = args[5] ? parseInt(args[5]) : 1000;

        if (isNaN(startId) || isNaN(endId) || isNaN(totalMints)) {
          console.error("❌ Invalid parameters for concurrent command");
          console.error("Usage: concurrent <start_id> <end_id> <total_mints> [workers] [delay_ms]");
          process.exit(1);
        }

        if (startId < 1 || endId < startId) {
          console.error("❌ Invalid ID range");
          process.exit(1);
        }

        if (workers < 1 || workers > 50) {
          console.error("❌ Workers must be between 1 and 50");
          process.exit(1);
        }

        await batchMintConcurrent(startId, endId, totalMints, workers, delay);
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

