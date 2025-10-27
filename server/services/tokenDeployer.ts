import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const execAsync = promisify(exec);

export interface TokenDeployConfig {
  name: string;
  symbol: string;
  mintAmount: string; // in tokens (e.g., "10000")
  maxMintCount: number;
  price: string; // e.g., "1"
  paymentToken: 'USDC' | 'USDT';
  network: 'base-sepolia' | 'base';
  deployer: string;
}

interface DeployResult {
  address: string;
  txHash: string;
  blockNumber: number;
}

// Network configurations
const NETWORK_CONFIG: Record<string, {
  poolManager: string;
  positionManager: string;
  permit2: string;
  usdc: string;
  usdt?: string;
}> = {
  'base-sepolia': {
    poolManager: '0x7da1d65f8b249183667cde74c5cbd46dd38aa829',
    positionManager: '0xc01ee65a5087409013202db5e1f77e3b74579abf',
    permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'base': {
    poolManager: '0x', // TODO: Add mainnet addresses
    positionManager: '0x',
    permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
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

  // Determine payment token address
  const paymentTokenAddress = config.paymentToken === 'USDC' 
    ? networkConfig.usdc 
    : networkConfig.usdt || networkConfig.usdc;

  // Calculate amounts
  const mintAmountWei = BigInt(config.mintAmount) * BigInt(10 ** 18);
  const totalUserMint = mintAmountWei * BigInt(config.maxMintCount);
  const poolSeedAmount = totalUserMint / BigInt(4); // 25% for LP
  const paymentSeedUSDC = (BigInt(config.price) * BigInt(10 ** 6) * BigInt(config.maxMintCount)) / BigInt(4); // 25% of total revenue

  // Calculate sqrtPrice (simplified calculation - assumes 1:1 ratio)
  // For production, use the calculateSqrtPrice.js script
  const sqrtPricePaymentFirst = '7922816251426434139029504';
  const sqrtPriceTokenFirst = '792281625142643375935439503360000';

  // Generate deployment script
  const deployScriptPath = join(__dirname, '../../contracts/scripts/deployToken.js');
  const deployScript = `
const hre = require("hardhat");

async function main() {
    const TOKEN_NAME = "${config.name}";
    const TOKEN_SYMBOL = "${config.symbol}";
    const MINT_AMOUNT = "${mintAmountWei.toString()}";
    const MAX_MINT_COUNT = ${config.maxMintCount};
    
    const POOL_MANAGER = "${networkConfig.poolManager}";
    const POSITION_MANAGER = "${networkConfig.positionManager}";
    const PERMIT2 = "${networkConfig.permit2}";
    const PAYMENT_TOKEN = "${paymentTokenAddress}";
    const PAYMENT_SEED = "${paymentSeedUSDC.toString()}";
    const POOL_SEED_AMOUNT = "${poolSeedAmount.toString()}";
    const SQRT_PRICE_PAYMENT_FIRST = "${sqrtPricePaymentFirst}";
    const SQRT_PRICE_TOKEN_FIRST = "${sqrtPriceTokenFirst}";

    console.log("Deploying token:", TOKEN_NAME);
    
    const PAYX = await hre.ethers.getContractFactory("PAYX");
    const token = await PAYX.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        MINT_AMOUNT,
        MAX_MINT_COUNT,
        POOL_MANAGER,
        POSITION_MANAGER,
        PERMIT2,
        PAYMENT_TOKEN,
        PAYMENT_SEED,
        POOL_SEED_AMOUNT,
        SQRT_PRICE_PAYMENT_FIRST,
        SQRT_PRICE_TOKEN_FIRST
    );

    await token.waitForDeployment();
    const address = await token.getAddress();
    
    console.log("Token deployed to:", address);
    
    // Wait for confirmations
    const receipt = await token.deploymentTransaction().wait(3);
    
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
    // Execute deployment
    const contractsDir = join(__dirname, '../../contracts');
    // Map network name to Hardhat config format (base-sepolia -> baseSepolia)
    const hardhatNetwork = config.network === 'base-sepolia' ? 'baseSepolia' : 'base';
    
    const { stdout, stderr } = await execAsync(
      `cd ${contractsDir} && npx hardhat run scripts/deployToken.js --network ${hardhatNetwork}`,
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
    return result;
  } catch (error: any) {
    console.error('Deployment error:', error);
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

  const mintAmountWei = BigInt(config.mintAmount) * BigInt(10 ** 18);
  const maxSupply = BigInt(2_000_000_000) * BigInt(10 ** 18);
  const totalUserMint = mintAmountWei * BigInt(config.maxMintCount);
  const poolSeedAmount = totalUserMint / BigInt(4);
  const paymentSeed = (BigInt(config.price) * BigInt(10 ** 6) * BigInt(config.maxMintCount)) / BigInt(4);

  const query = `
    INSERT INTO deployed_tokens (
      address, name, symbol, deployer_address,
      mint_amount, max_mint_count, price,
      payment_token_address, payment_token_symbol,
      pool_manager, position_manager, permit2,
      payment_seed, pool_seed_amount,
      sqrt_price_payment_first, sqrt_price_token_first,
      network, max_supply, total_supply,
      deploy_tx_hash, deploy_block_number
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
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
    networkConfig.poolManager,
    networkConfig.positionManager,
    networkConfig.permit2,
    paymentSeed.toString(),
    poolSeedAmount.toString(),
    '7922816251426434139029504',
    '792281625142643375935439503360000',
    config.network,
    maxSupply.toString(),
    poolSeedAmount.toString(), // Initial supply (LP seed)
    deployResult.txHash,
    deployResult.blockNumber,
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
 * Get all tokens from database
 */
export async function getAllTokens(pool: Pool, options: {
  network?: string;
  deployer?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
} = {}) {
  let query = 'SELECT * FROM deployed_tokens WHERE 1=1';
  const values: any[] = [];
  let paramIndex = 1;

  if (options.network) {
    query += ` AND network = $${paramIndex++}`;
    values.push(options.network);
  }

  if (options.deployer) {
    query += ` AND deployer_address = $${paramIndex++}`;
    values.push(options.deployer.toLowerCase());
  }

  if (options.isActive !== undefined) {
    query += ` AND is_active = $${paramIndex++}`;
    values.push(options.isActive);
  }

  query += ' ORDER BY created_at DESC';

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

