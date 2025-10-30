/**
 * Check verification status of deployed contracts
 * 
 * Usage:
 *   npm run check-verification
 *   npm run check-verification -- --network base
 */

import { config } from 'dotenv';
import { Pool } from 'pg';

config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable required');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const networkArg = args.find(arg => arg.startsWith('--network='))?.split('=')[1];

// Setup database pool
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DB_SSL_ENABLED !== 'false' ? { rejectUnauthorized: false } : false,
});

/**
 * Get verification statistics
 */
async function getVerificationStats() {
  let query = `
    SELECT 
      network,
      COUNT(*) FILTER (WHERE verification_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE verification_status = 'verifying') as verifying,
      COUNT(*) FILTER (WHERE verification_status = 'verified') as verified,
      COUNT(*) FILTER (WHERE verification_status = 'failed') as failed,
      COUNT(*) as total
    FROM deployed_tokens
    WHERE is_active = true
  `;

  if (networkArg) {
    query += ` AND network = '${networkArg}'`;
  }

  query += ' GROUP BY network ORDER BY network';

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Get unverified tokens
 */
async function getUnverifiedTokens() {
  let query = `
    SELECT 
      address,
      name,
      symbol,
      network,
      verification_status,
      verification_error,
      verification_retry_count,
      verification_last_attempt,
      created_at,
      deploy_tx_hash
    FROM deployed_tokens
    WHERE verification_status IN ('pending', 'failed')
    AND is_active = true
  `;

  if (networkArg) {
    query += ` AND network = '${networkArg}'`;
  }

  query += ' ORDER BY verification_retry_count DESC, created_at DESC LIMIT 20';

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Get recently verified tokens
 */
async function getRecentlyVerified() {
  let query = `
    SELECT 
      address,
      name,
      symbol,
      network,
      verified_at,
      verification_guid
    FROM deployed_tokens
    WHERE verification_status = 'verified'
    AND is_active = true
  `;

  if (networkArg) {
    query += ` AND network = '${networkArg}'`;
  }

  query += ' ORDER BY verified_at DESC LIMIT 10';

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Main function
 */
async function main() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 CONTRACT VERIFICATION STATUS');
    console.log('='.repeat(80));

    if (networkArg) {
      console.log(`Network: ${networkArg}`);
    } else {
      console.log('Network: All networks');
    }

    // Get statistics
    const stats = await getVerificationStats();
    
    console.log('\n📈 Statistics by Network:');
    console.log('─'.repeat(80));
    
    if (stats.length === 0) {
      console.log('No deployed contracts found.');
    } else {
      stats.forEach(stat => {
        console.log(`\n${stat.network}:`);
        console.log(`  Total:     ${stat.total}`);
        console.log(`  ✅ Verified: ${stat.verified} (${Math.round(stat.verified / stat.total * 100)}%)`);
        console.log(`  ⏳ Pending:  ${stat.pending}`);
        console.log(`  🔄 Verifying: ${stat.verifying}`);
        console.log(`  ❌ Failed:   ${stat.failed}`);
      });
    }

    // Get unverified tokens
    const unverified = await getUnverifiedTokens();
    
    if (unverified.length > 0) {
      console.log('\n\n❗ Unverified Contracts (up to 20):');
      console.log('─'.repeat(80));
      
      unverified.forEach((token, i) => {
        console.log(`\n${i + 1}. ${token.name} (${token.symbol})`);
        console.log(`   Address: ${token.address}`);
        console.log(`   Network: ${token.network}`);
        console.log(`   Status:  ${token.verification_status}`);
        console.log(`   Deploy TX: ${token.deploy_tx_hash}`);
        console.log(`   Created: ${new Date(token.created_at).toLocaleString()}`);
        
        // Show retry information
        const retryCount = token.verification_retry_count || 0;
        if (retryCount > 0) {
          console.log(`   Retries: ${retryCount}`);
          if (token.verification_last_attempt) {
            console.log(`   Last attempt: ${new Date(token.verification_last_attempt).toLocaleString()}`);
          }
        }
        
        if (token.verification_error) {
          const errorPreview = token.verification_error.length > 100 
            ? token.verification_error.substring(0, 100) + '...'
            : token.verification_error;
          console.log(`   Error:   ${errorPreview}`);
        }
        
        // Generate explorer link
        const explorerUrl = token.network === 'base' 
          ? `https://basescan.org/address/${token.address}`
          : `https://sepolia.basescan.org/address/${token.address}`;
        console.log(`   Explorer: ${explorerUrl}#code`);
      });

      console.log('\n\n💡 To verify these contracts, run:');
      console.log(`   npm run verify${networkArg ? ':' + (networkArg === 'base' ? 'base' : 'sepolia') : ''}`);
    }

    // Get recently verified
    const verified = await getRecentlyVerified();
    
    if (verified.length > 0) {
      console.log('\n\n✅ Recently Verified Contracts (last 10):');
      console.log('─'.repeat(80));
      
      verified.forEach((token, i) => {
        console.log(`\n${i + 1}. ${token.name} (${token.symbol})`);
        console.log(`   Address: ${token.address}`);
        console.log(`   Network: ${token.network}`);
        console.log(`   Verified: ${new Date(token.verified_at).toLocaleString()}`);
        if (token.verification_guid) {
          console.log(`   GUID: ${token.verification_guid}`);
        }
        
        // Generate explorer link
        const explorerUrl = token.network === 'base' 
          ? `https://basescan.org/address/${token.address}`
          : `https://sepolia.basescan.org/address/${token.address}`;
        console.log(`   View: ${explorerUrl}#code`);
      });
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

