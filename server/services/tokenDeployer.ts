import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { privateKeyToAccount } from 'viem/accounts';

const execAsync = promisify(exec);

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Escape string for safe use in JavaScript code
 * Prevents code injection attacks
 */
function escapeJavaScriptString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')  // Backslash
    .replace(/"/g, '\\"')    // Double quote
    .replace(/'/g, "\\'")    // Single quote
    .replace(/\n/g, '\\n')   // Newline
    .replace(/\r/g, '\\r')   // Carriage return
    .replace(/\t/g, '\\t')   // Tab
    .replace(/\$/g, '\\$')   // Dollar sign (template literals)
    .replace(/`/g, '\\`');   // Backtick (template literals)
}

/**
 * Calculate square root of a BigInt using Newton's method
 */
function sqrt(value: bigint): bigint {
  if (value < 0n) {
    throw new Error('Square root of negative numbers is not supported');
  }
  if (value < 2n) {
    return value;
  }

  function newtonIteration(n: bigint, x0: bigint): bigint {
    const x1 = ((n / x0) + x0) >> 1n;
    if (x0 === x1 || x0 === (x1 - 1n)) {
      return x0;
    }
    return newtonIteration(n, x1);
  }

  return newtonIteration(value, 1n);
}

export interface TokenDeployConfig {
  name: string;
  symbol: string;
  mintAmount: string; // in tokens (e.g., "10000"), minimum 1
  maxMintCount: number; // minimum 10
  price: string; // e.g., "1"
  paymentToken: 'USDC' | 'USDT';
  network: 'base-sepolia' | 'base';
  deployer: string;
  excessRecipient?: string; // Address to receive excess USDC (defaults to deployer)
  imageUrl?: string; // Token logo URL
  description?: string; // Token description
}

interface DeployResult {
  address: string;
  txHash: string;
  blockNumber: number;
}

// Network configurations (Simplified)
const NETWORK_CONFIG: Record<string, {
  usdc: string;
  usdt?: string;
}> = {
  'base-sepolia': {
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'base': {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
};

/**
 * Deploy a new X402 token
 */
export async function deployToken(config: TokenDeployConfig): Promise<DeployResult> {
  const networkConfig = NETWORK_CONFIG[config.network];
  if (!networkConfig) {
    throw new Error(`Unsupported network: ${config.network}`);
  }

  // Validate minimum constraints
  const mintAmountNum = parseFloat(config.mintAmount);
  if (mintAmountNum < 1) {
    throw new Error(`mintAmount must be at least 1, got ${config.mintAmount}`);
  }
  if (config.maxMintCount < 10) {
    throw new Error(`maxMintCount must be at least 10, got ${config.maxMintCount}`);
  }

  // Determine payment token address
  const paymentTokenAddress = config.paymentToken === 'USDC' 
    ? networkConfig.usdc 
    : networkConfig.usdt || networkConfig.usdc;

  // Excess recipient (defaults to deployer if not specified)
  const excessRecipient = config.excessRecipient || config.deployer;

  // Get LP deployer address from environment
  const lpDeployerPrivateKey = process.env.LP_DEPLOYER_PRIVATE_KEY as string;
  if (!lpDeployerPrivateKey) {
    throw new Error('LP_DEPLOYER_PRIVATE_KEY environment variable required');
  }
  
  // Derive LP deployer address from private key
  const lpAccount = privateKeyToAccount(lpDeployerPrivateKey as `0x${string}`);
  const lpDeployerAddress = lpAccount.address;

  // Get minter private key for granting MINTER_ROLE
  const minterPrivateKey = process.env.MINTER_PRIVATE_KEY as string;
  if (!minterPrivateKey) {
    throw new Error('MINTER_PRIVATE_KEY environment variable required');
  }
  
  // Derive minter address from private key
  const minterAccount = privateKeyToAccount(minterPrivateKey as `0x${string}`);
  const minterAddress = minterAccount.address;

  console.log(`💼 LP Deployer: ${lpDeployerAddress}`);
  console.log(`🔐 Minter Address: ${minterAddress}`);

  // Calculate amounts
  // Total supply calculation:
  // - User mintable = tokenPerMint * maxMintCount (80% of total supply)
  // - LP pool reserve = 20% of total supply = (user mintable) / 4
  // Token now uses 6 decimals (same as USDC)
  const TOKEN_DECIMALS = 6;
  const mintAmountWei = BigInt(config.mintAmount) * BigInt(10 ** TOKEN_DECIMALS);
  const totalUserMint = mintAmountWei * BigInt(config.maxMintCount);
  const poolSeedAmount = totalUserMint / BigInt(4); // 20% for LP pool (user mint is 80%)
  
  // Price per mint in USDC (with 6 decimals)
  const pricePerMintUSDC = BigInt(config.price) * BigInt(10 ** 6);
  
  // Calculate required USDC for LP (based on mint price)
  // Required = poolSeedAmount * pricePerMint / mintAmount
  const requiredPaymentForLP = (poolSeedAmount * pricePerMintUSDC) / mintAmountWei;
  
  // Total USDC that will be collected from all mints
  const totalUSDCRevenue = pricePerMintUSDC * BigInt(config.maxMintCount);
  
  // Excess USDC that will be sent to excessRecipient
  const excessUSDC = totalUSDCRevenue - requiredPaymentForLP;

  // Calculate sqrtPrice based on actual token economics
  // Price per token = pricePerMint / mintAmount
  // Example: 1 USDC buys 1000 tokens -> 0.001 USDC per token
  
  // In wei terms (Token uses 6 decimals, same as USDC):
  // 1 token = 1e6 wei (6 decimals)
  // pricePerToken = pricePerMintUSDC (1e6 wei) / mintAmountWei (1e6 wei)
  // = pricePerMintUSDC * 1e6 / mintAmountWei (in USDC wei per token wei)
  
  const pricePerTokenInUSDCWei = (pricePerMintUSDC * BigInt(10 ** TOKEN_DECIMALS)) / mintAmountWei;
  
  // Scenario 1: USDC is token0, Token is token1
  // price = token1_wei / token0_wei = 1e6 / pricePerTokenInUSDCWei
  const price1 = (BigInt(10 ** TOKEN_DECIMALS) * BigInt(2 ** 96)) / pricePerTokenInUSDCWei;
  const sqrtPricePaymentFirst = sqrt(price1).toString();
  
  // Scenario 2: Token is token0, USDC is token1  
  // price = token1_wei / token0_wei = pricePerTokenInUSDCWei / 1e6
  const price2 = (pricePerTokenInUSDCWei * BigInt(2 ** 96)) / BigInt(10 ** TOKEN_DECIMALS);
  const sqrtPriceTokenFirst = sqrt(price2).toString();
  
  console.log(`💡 Calculated sqrtPrices for ${config.price} USDC per ${config.mintAmount} tokens:`);
  console.log(`   sqrtPricePaymentFirst: ${sqrtPricePaymentFirst}`);
  console.log(`   sqrtPriceTokenFirst: ${sqrtPriceTokenFirst}`);

  // Generate deployment script (Simplified)
  // Use CONTRACTS_DIR env var if set, otherwise use relative path
  const contractsDir = process.env.CONTRACTS_DIR || join(__dirname, '../../../contracts');
  
  // Use unique filename to avoid concurrent deployment conflicts
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);
  const deployScriptPath = join(contractsDir, `scripts/deployToken-${timestamp}-${randomId}.js`);
  
  console.log(`📝 Writing deployment script to: ${deployScriptPath}`);
  
  const deployScript = `
const hre = require("hardhat");

async function main() {
    const TOKEN_NAME = "${escapeJavaScriptString(config.name)}";
    const TOKEN_SYMBOL = "${escapeJavaScriptString(config.symbol)}";
    const MINT_AMOUNT = "${mintAmountWei.toString()}";
    const MAX_MINT_COUNT = ${config.maxMintCount};
    
    const PAYMENT_TOKEN = "${paymentTokenAddress}";
    const PRICE_PER_MINT = "${pricePerMintUSDC.toString()}";
    const POOL_SEED_AMOUNT = "${poolSeedAmount.toString()}";
    const EXCESS_RECIPIENT = "${excessRecipient}";
    const LP_DEPLOYER = "${lpDeployerAddress}";
    const MINTER_ADDRESS = "${minterAddress}";

    console.log("Deploying X402Token:", TOKEN_NAME);
    console.log("LP Deployer:", LP_DEPLOYER);
    console.log("Minter Address:", MINTER_ADDRESS);
    
    const X402Token = await hre.ethers.getContractFactory("X402Token");
    const token = await X402Token.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        MINT_AMOUNT,
        MAX_MINT_COUNT,
        PAYMENT_TOKEN,
        PRICE_PER_MINT,
        POOL_SEED_AMOUNT,
        EXCESS_RECIPIENT,
        LP_DEPLOYER
    );

    await token.waitForDeployment();
    const address = await token.getAddress();
    
    console.log("Token deployed to:", address);
    
    // Wait for confirmations
    const receipt = await token.deploymentTransaction().wait(3);
    console.log("Deployment confirmed in block:", receipt.blockNumber);
    
    // Grant MINTER_ROLE to minter address (not server address)
    console.log("\\n🔐 Granting MINTER_ROLE to minter address...");
    const MINTER_ROLE = await token.MINTER_ROLE();
    
    // Check if already has role
    const hasRole = await token.hasRole(MINTER_ROLE, MINTER_ADDRESS);
    if (hasRole) {
        console.log("✅ Minter already has MINTER_ROLE");
    } else {
        const grantTx = await token.grantRole(MINTER_ROLE, MINTER_ADDRESS);
        console.log("Grant role tx:", grantTx.hash);
        console.log("⏳ Waiting for confirmation...");
        await grantTx.wait(2); // Wait for 2 confirmations
        console.log("✅ MINTER_ROLE transaction confirmed");
    }
    
    // Verify role with retry logic
    console.log("🔍 Verifying role...");
    let hasRoleAfter = false;
    for (let i = 0; i < 3; i++) {
        hasRoleAfter = await token.hasRole(MINTER_ROLE, MINTER_ADDRESS);
        if (hasRoleAfter) {
            console.log("✅ MINTER_ROLE verified successfully");
            break;
        }
        if (i < 2) {
            console.log(\`   Retry \${i + 1}/2 - waiting 2 seconds...\`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    if (!hasRoleAfter) {
        console.error("⚠️  Warning: Role verification failed, but transaction was confirmed.");
        console.error("   This may be due to RPC node sync delay.");
        console.error("   The deployment was successful. Role can be verified manually.");
        // Don't throw error - deployment was successful
    }
    
    // Output JSON for parsing
    console.log("DEPLOY_RESULT:", JSON.stringify({
        address: address,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
    }));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
`;

  writeFileSync(deployScriptPath, deployScript);

  try {
    // Execute deployment (reuse contractsDir from above)
    console.log(`📂 Contracts directory: ${contractsDir}`);
    
    // Map network name to Hardhat config format (base-sepolia -> baseSepolia)
    const hardhatNetwork = config.network === 'base-sepolia' ? 'baseSepolia' : 'base';
    
    // Extract filename from path for execution
    const scriptFilename = deployScriptPath.split('/').pop();
    
    const { stdout, stderr } = await execAsync(
      `cd ${contractsDir} && npx hardhat run scripts/${scriptFilename} --network ${hardhatNetwork}`,
      { timeout: 300000 } // 5 minute timeout
    );

    console.log('Deploy stdout:', stdout);
    if (stderr) console.error('Deploy stderr:', stderr);

    // Parse result from stdout
    const resultMatch = stdout.match(/DEPLOY_RESULT: ({.*})/);
    if (!resultMatch) {
      throw new Error('Failed to parse deployment result');
    }

    const result: DeployResult = JSON.parse(resultMatch[1]);
    
    // Clean up temporary deployment script
    try {
      unlinkSync(deployScriptPath);
      console.log(`🧹 Cleaned up temporary script: ${scriptFilename}`);
    } catch (cleanupError: any) {
      console.warn(`⚠️  Failed to cleanup script file: ${cleanupError.message}`);
    }
    
    return result;
  } catch (error: any) {
    console.error('Deployment error:', error);
    
    // Clean up temporary script even on error
    try {
      unlinkSync(deployScriptPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw new Error(`Token deployment failed: ${error.message}`);
  }
}

/**
 * Save deployed token to database
 */
export async function saveDeployedToken(
  pool: Pool,
  config: TokenDeployConfig,
  deployResult: DeployResult
) {
  const networkConfig = NETWORK_CONFIG[config.network];
  const paymentTokenAddress = config.paymentToken === 'USDC' 
    ? networkConfig.usdc 
    : networkConfig.usdt || networkConfig.usdc;

  // Get LP deployer address from environment
  const lpDeployerPrivateKey = process.env.LP_DEPLOYER_PRIVATE_KEY as string;
  if (!lpDeployerPrivateKey) {
    throw new Error('LP_DEPLOYER_PRIVATE_KEY environment variable required');
  }
  
  // Derive LP deployer address from private key
  const lpAccount = privateKeyToAccount(lpDeployerPrivateKey as `0x${string}`);
  const lpDeployerAddress = lpAccount.address;

  // Excess recipient (defaults to deployer if not specified)
  const excessRecipient = config.excessRecipient || config.deployer;

  const mintAmountWei = BigInt(config.mintAmount) * BigInt(10 ** 18);
  const totalUserMint = mintAmountWei * BigInt(config.maxMintCount);
  const poolSeedAmount = totalUserMint / BigInt(4);
  // Calculate actual max supply: pool seed + user mintable
  const maxSupply = poolSeedAmount + totalUserMint;
  const pricePerMintUSDC = BigInt(config.price) * BigInt(10 ** 6);
  const requiredPayment = (poolSeedAmount * pricePerMintUSDC) / mintAmountWei;

  // Store constructor arguments for verification
  const constructorArgs = {
    name: config.name,
    symbol: config.symbol,
    mintAmount: mintAmountWei.toString(),
    maxMintCount: config.maxMintCount,
    paymentToken: paymentTokenAddress,
    pricePerMint: pricePerMintUSDC.toString(),
    poolSeedAmount: poolSeedAmount.toString(),
    excessRecipient: excessRecipient,
    lpDeployer: lpDeployerAddress
  };

  const query = `
    INSERT INTO deployed_tokens (
      address, name, symbol, deployer_address,
      mint_amount, max_mint_count, price,
      payment_token_address, payment_token_symbol,
      lp_deployer_address,
      payment_seed, pool_seed_amount,
      network, max_supply, total_supply,
      deploy_tx_hash, deploy_block_number,
      logo_url, description,
      constructor_args, compiler_version, optimization_runs, via_ir
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
    )
    RETURNING *
  `;

  const values = [
    deployResult.address.toLowerCase(),
    config.name,
    config.symbol,
    config.deployer.toLowerCase(),
    mintAmountWei.toString(),
    config.maxMintCount,
    `${config.price} ${config.paymentToken}`,
    paymentTokenAddress.toLowerCase(),
    config.paymentToken,
    lpDeployerAddress.toLowerCase(),
    requiredPayment.toString(),
    poolSeedAmount.toString(),
    config.network,
    maxSupply.toString(),
    poolSeedAmount.toString(), // Initial supply (LP seed)
    deployResult.txHash,
    deployResult.blockNumber,
    config.imageUrl || null,
    config.description || null,
    JSON.stringify(constructorArgs),
    '0.8.26',
    200,
    true
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Get token info from database
 */
export async function getToken(pool: Pool, address: string) {
  const query = 'SELECT * FROM deployed_tokens WHERE address = $1';
  const result = await pool.query(query, [address.toLowerCase()]);
  return result.rows[0] || null;
}

/**
 * Get all tokens from database with 24h mint stats
 */
export async function getAllTokens(pool: Pool, options: {
  network?: string;
  deployer?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
} = {}) {
  // Optimized: Join mint_history to get 24h stats in single query
  let query = `
    SELECT 
      t.*,
      COUNT(m.id) FILTER (WHERE m.completed_at > NOW() - INTERVAL '24 hours') as mint_count_24h
    FROM deployed_tokens t
    LEFT JOIN mint_history m ON m.token_address = t.address
    WHERE 1=1
  `;
  const values: any[] = [];
  let paramIndex = 1;

  if (options.network) {
    query += ` AND t.network = $${paramIndex++}`;
    values.push(options.network);
  }

  if (options.deployer) {
    query += ` AND t.deployer_address = $${paramIndex++}`;
    values.push(options.deployer.toLowerCase());
  }

  if (options.isActive !== undefined) {
    query += ` AND t.is_active = $${paramIndex++}`;
    values.push(options.isActive);
  }

  query += ' GROUP BY t.id ORDER BY t.created_at DESC';

  if (options.limit) {
    query += ` LIMIT $${paramIndex++}`;
    values.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${paramIndex++}`;
    values.push(options.offset);
  }

  const result = await pool.query(query, values);
  return result.rows;
}

/**
 * Update token mint count
 */
export async function updateTokenMintCount(pool: Pool, address: string, incrementBy: number = 1) {
  const query = `
    UPDATE deployed_tokens 
    SET mint_count = mint_count + $1
    WHERE address = $2
    RETURNING *
  `;
  const result = await pool.query(query, [incrementBy, address.toLowerCase()]);
  return result.rows[0];
}

/**
 * Update token liquidity deployed status
 */
export async function updateTokenLiquidityDeployed(pool: Pool, address: string) {
  const query = `
    UPDATE deployed_tokens 
    SET liquidity_deployed = true
    WHERE address = $1
    RETURNING *
  `;
  const result = await pool.query(query, [address.toLowerCase()]);
  return result.rows[0];
}

/**
 * Verify a deployed contract on Basescan/Etherscan
 */
export async function verifyContract(
  pool: Pool,
  tokenAddress: string
): Promise<{ success: boolean; guid?: string; error?: string }> {
  // Get token info from database
  const token = await getToken(pool, tokenAddress);
  if (!token) {
    throw new Error(`Token ${tokenAddress} not found in database`);
  }

  if (!token.constructor_args) {
    throw new Error(`Token ${tokenAddress} missing constructor_args - cannot verify`);
  }

  const args = token.constructor_args;
  const contractsDir = process.env.CONTRACTS_DIR || join(__dirname, '../../../contracts');
  const network = token.network === 'base-sepolia' ? 'baseSepolia' : 'base';

  try {
    // Update status to verifying and increment retry count
    await pool.query(
      `UPDATE deployed_tokens 
       SET verification_status = $1, 
           verification_retry_count = verification_retry_count + 1,
           verification_last_attempt = NOW()
       WHERE address = $2`,
      ['verifying', tokenAddress.toLowerCase()]
    );

    console.log(`🔍 Verifying contract ${tokenAddress} on ${network}...`);
    console.log(`   Attempt: ${(token.verification_retry_count || 0) + 1}`);

    // Build verification command with constructor args
    const verifyCmd = `cd ${contractsDir} && npx hardhat verify --network ${network} ${tokenAddress} \
      "${args.name}" \
      "${args.symbol}" \
      "${args.mintAmount}" \
      ${args.maxMintCount} \
      "${args.paymentToken}" \
      "${args.pricePerMint}" \
      "${args.poolSeedAmount}" \
      "${args.excessRecipient}" \
      "${args.lpDeployer}"`;

    console.log('Verification command:', verifyCmd);

    const { stdout, stderr } = await execAsync(verifyCmd, { timeout: 120000 });

    console.log('Verify stdout:', stdout);
    if (stderr) console.log('Verify stderr:', stderr);

    // Check if already verified
    if (stdout.includes('Already Verified')) {
      await pool.query(
        'UPDATE deployed_tokens SET verification_status = $1, verified_at = NOW() WHERE address = $2',
        ['verified', tokenAddress.toLowerCase()]
      );
      return { success: true };
    }

    // Extract verification GUID if present
    const guidMatch = stdout.match(/GUID:\s*([a-zA-Z0-9]+)/i) || 
                      stdout.match(/verification ID:\s*([a-zA-Z0-9]+)/i);
    const guid = guidMatch ? guidMatch[1] : undefined;

    // Check for success
    if (stdout.includes('Successfully verified') || stdout.includes('Contract source code already verified')) {
      await pool.query(
        'UPDATE deployed_tokens SET verification_status = $1, verification_guid = $2, verified_at = NOW() WHERE address = $3',
        ['verified', guid, tokenAddress.toLowerCase()]
      );
      return { success: true, guid };
    }

    // If we got here, verification might be pending
    if (guid) {
      await pool.query(
        'UPDATE deployed_tokens SET verification_status = $1, verification_guid = $2 WHERE address = $3',
        ['verifying', guid, tokenAddress.toLowerCase()]
      );
      return { success: true, guid };
    }

    throw new Error('Verification completed but status unclear');

  } catch (error: any) {
    console.error(`Verification error for ${tokenAddress}:`, error.message);
    
    // Update status to failed and save error
    await pool.query(
      `UPDATE deployed_tokens 
       SET verification_status = $1, 
           verification_error = $2,
           verification_last_attempt = NOW()
       WHERE address = $3`,
      ['failed', error.message, tokenAddress.toLowerCase()]
    );

    return { success: false, error: error.message };
  }
}

/**
 * Get all unverified tokens
 */
export async function getUnverifiedTokens(pool: Pool, network?: string) {
  let query = `
    SELECT * FROM deployed_tokens 
    WHERE verification_status IN ('pending', 'failed')
    AND is_active = true
  `;
  const values: any[] = [];

  if (network) {
    query += ' AND network = $1';
    values.push(network);
  }

  query += ' ORDER BY created_at ASC';

  const result = await pool.query(query, values);
  return result.rows;
}

