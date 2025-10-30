/**
 * Batch verify all unverified contracts
 * 
 * Usage:
 *   npm run verify-contracts
 *   npm run verify-contracts -- --network base
 *   npm run verify-contracts -- --address 0x123...
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { verifyContract, getUnverifiedTokens, getToken } from '../services/tokenDeployer.js';

config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable required');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const networkArg = args.find(arg => arg.startsWith('--network='))?.split('=')[1];
const addressArg = args.find(arg => arg.startsWith('--address='))?.split('=')[1];
const delayArg = args.find(arg => arg.startsWith('--delay='))?.split('=')[1];
const maxRetriesArg = args.find(arg => arg.startsWith('--max-retries='))?.split('=')[1];

const delay = delayArg ? parseInt(delayArg) : 10000; // Default 10 seconds between verifications
const maxRetries = maxRetriesArg ? parseInt(maxRetriesArg) : undefined; // No limit by default

// Setup database pool
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DB_SSL_ENABLED !== 'false' ? { rejectUnauthorized: false } : false,
});

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify a single token by address
 */
async function verifySingleToken(address: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Verifying token: ${address}`);
  console.log('='.repeat(60));

  const token = await getToken(pool, address);
  if (!token) {
    console.error(`❌ Token ${address} not found in database`);
    return { success: false };
  }

  console.log(`Token: ${token.name} (${token.symbol})`);
  console.log(`Network: ${token.network}`);
  console.log(`Current status: ${token.verification_status}`);

  const result = await verifyContract(pool, address);

  if (result.success) {
    console.log(`✅ Verification successful`);
    if (result.guid) {
      console.log(`   GUID: ${result.guid}`);
    }
  } else {
    console.error(`❌ Verification failed: ${result.error}`);
  }

  return result;
}

/**
 * Verify all unverified tokens
 */
async function verifyAllTokens(network?: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🔍 BATCH CONTRACT VERIFICATION');
  console.log('='.repeat(60));

  if (network) {
    console.log(`Network filter: ${network}`);
  }

  let tokens = await getUnverifiedTokens(pool, network);
  
  // Filter by max retries if specified
  if (maxRetries !== undefined) {
    const originalCount = tokens.length;
    tokens = tokens.filter(t => (t.verification_retry_count || 0) < maxRetries);
    const filteredCount = originalCount - tokens.length;
    if (filteredCount > 0) {
      console.log(`\n⏭️  Skipping ${filteredCount} contracts with ${maxRetries}+ retry attempts`);
    }
  }
  
  console.log(`\nFound ${tokens.length} unverified tokens`);

  if (tokens.length === 0) {
    console.log('✅ All tokens are verified!');
    return;
  }
  
  if (maxRetries !== undefined) {
    console.log(`Max retry attempts: ${maxRetries}`);
  }

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failedTokens: Array<{
    address: string;
    name: string;
    symbol: string;
    network: string;
    error: string;
  }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    console.log(`\n[${i + 1}/${tokens.length}] Verifying: ${token.name} (${token.symbol})`);
    console.log(`   Address: ${token.address}`);
    console.log(`   Network: ${token.network}`);
    console.log(`   Status: ${token.verification_status}`);
    
    const retryCount = token.verification_retry_count || 0;
    if (retryCount > 0) {
      console.log(`   Previous attempts: ${retryCount}`);
    }

    try {
      const result = await verifyContract(pool, token.address);

      if (result.success) {
        successCount++;
        console.log(`   ✅ Success`);
        if (result.guid) {
          console.log(`   GUID: ${result.guid}`);
        }
      } else {
        failCount++;
        const errorMsg = result.error || 'Unknown error';
        console.error(`   ❌ Failed: ${errorMsg}`);
        
        // Record failed token for summary
        failedTokens.push({
          address: token.address,
          name: token.name,
          symbol: token.symbol,
          network: token.network,
          error: errorMsg
        });

        // Update retry count and last error time in database
        await pool.query(`
          UPDATE deployed_tokens 
          SET 
            verification_status = 'failed',
            verification_error = $1,
            updated_at = NOW()
          WHERE address = $2
        `, [errorMsg, token.address.toLowerCase()]);

        console.log(`   💾 Error saved to database, continuing to next contract...`);
      }
    } catch (error: any) {
      // Catch any unexpected errors to prevent batch from stopping
      skipCount++;
      const errorMsg = error.message || 'Unexpected error during verification';
      console.error(`   ⚠️  Unexpected error, skipping: ${errorMsg}`);
      
      failedTokens.push({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        network: token.network,
        error: errorMsg
      });

      // Try to save error to database
      try {
        await pool.query(`
          UPDATE deployed_tokens 
          SET 
            verification_status = 'failed',
            verification_error = $1,
            updated_at = NOW()
          WHERE address = $2
        `, [errorMsg, token.address.toLowerCase()]);
      } catch (dbError) {
        console.error(`   ⚠️  Could not save error to database`);
      }
    }

    // Wait before next verification to avoid rate limiting
    if (i < tokens.length - 1) {
      console.log(`\n⏳ Waiting ${delay / 1000}s before next verification...`);
      await sleep(delay);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total:     ${tokens.length}`);
  console.log(`✅ Success: ${successCount} (${Math.round(successCount / tokens.length * 100)}%)`);
  console.log(`❌ Failed:  ${failCount} (${Math.round(failCount / tokens.length * 100)}%)`);
  if (skipCount > 0) {
    console.log(`⚠️  Skipped: ${skipCount} (unexpected errors)`);
  }
  console.log('='.repeat(80));

  // Show detailed failure list
  if (failedTokens.length > 0) {
    console.log(`\n❌ FAILED CONTRACTS DETAIL:`);
    console.log('─'.repeat(80));
    
    failedTokens.forEach((token, i) => {
      console.log(`\n${i + 1}. ${token.name} (${token.symbol})`);
      console.log(`   Address: ${token.address}`);
      console.log(`   Network: ${token.network}`);
      console.log(`   Error:   ${token.error.substring(0, 200)}${token.error.length > 200 ? '...' : ''}`);
      
      const explorerUrl = token.network === 'base' 
        ? `https://basescan.org/address/${token.address}`
        : `https://sepolia.basescan.org/address/${token.address}`;
      console.log(`   Explorer: ${explorerUrl}#code`);
    });

    console.log(`\n💡 Failed contracts are marked in the database.`);
    console.log(`   Run 'npm run verify' again to retry failed verifications.`);
    console.log(`   Or check details: npm run check-verification\n`);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    if (addressArg) {
      // Verify single token
      await verifySingleToken(addressArg);
    } else {
      // Verify all unverified tokens
      await verifyAllTokens(networkArg);
    }

    console.log('\n✅ Verification complete');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

