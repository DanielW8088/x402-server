/**
 * Debug verification issues for a specific contract
 * 
 * Usage:
 *   tsx scripts/debug-verification.ts 0x473c85f10aeaa551c69bc014d8ef8e2cd8283336
 */

import { config } from 'dotenv';
import { Pool } from 'pg';

config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable required');
  process.exit(1);
}

const address = process.argv[2];
if (!address) {
  console.error('❌ Usage: tsx scripts/debug-verification.ts <contract_address>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DB_SSL_ENABLED !== 'false' ? { rejectUnauthorized: false } : false,
});

async function main() {
  try {
    const result = await pool.query(
      'SELECT * FROM deployed_tokens WHERE address = $1',
      [address.toLowerCase()]
    );

    if (result.rows.length === 0) {
      console.error(`❌ Contract ${address} not found in database`);
      process.exit(1);
    }

    const token = result.rows[0];

    console.log('\n' + '='.repeat(80));
    console.log('🔍 CONTRACT VERIFICATION DEBUG');
    console.log('='.repeat(80));
    console.log(`\nContract: ${token.name} (${token.symbol})`);
    console.log(`Address: ${token.address}`);
    console.log(`Network: ${token.network}`);
    console.log(`Verification Status: ${token.verification_status}`);
    console.log(`Retry Count: ${token.verification_retry_count || 0}`);
    
    if (token.verification_last_attempt) {
      console.log(`Last Attempt: ${new Date(token.verification_last_attempt).toLocaleString()}`);
    }

    console.log('\n' + '-'.repeat(80));
    console.log('📋 CONSTRUCTOR ARGUMENTS');
    console.log('-'.repeat(80));
    
    if (token.constructor_args) {
      const args = token.constructor_args;
      console.log(JSON.stringify(args, null, 2));
      
      console.log('\n' + '-'.repeat(80));
      console.log('🔨 HARDHAT VERIFY COMMAND');
      console.log('-'.repeat(80));
      
      const network = token.network === 'base-sepolia' ? 'baseSepolia' : 'base';
      const contractsDir = process.env.CONTRACTS_DIR || '../contracts';
      
      console.log(`\ncd ${contractsDir} && npx hardhat verify --network ${network} ${token.address} \\`);
      console.log(`  "${args.name}" \\`);
      console.log(`  "${args.symbol}" \\`);
      console.log(`  "${args.mintAmount}" \\`);
      console.log(`  ${args.maxMintCount} \\`);
      console.log(`  "${args.paymentToken}" \\`);
      console.log(`  "${args.pricePerMint}" \\`);
      console.log(`  "${args.poolSeedAmount}" \\`);
      console.log(`  "${args.excessRecipient}" \\`);
      console.log(`  "${args.lpDeployer}"`);
    } else {
      console.log('❌ No constructor_args found in database!');
    }

    if (token.verification_error) {
      console.log('\n' + '-'.repeat(80));
      console.log('❌ VERIFICATION ERROR');
      console.log('-'.repeat(80));
      console.log('\n' + token.verification_error);
    }

    console.log('\n' + '-'.repeat(80));
    console.log('📊 DEPLOYMENT INFO');
    console.log('-'.repeat(80));
    console.log(`Deployed: ${new Date(token.created_at).toLocaleString()}`);
    console.log(`Deploy TX: ${token.deploy_tx_hash}`);
    console.log(`Deploy Block: ${token.deploy_block_number}`);
    console.log(`Compiler: ${token.compiler_version}`);
    console.log(`Optimization: ${token.optimization_runs} runs`);
    console.log(`Via IR: ${token.via_ir}`);

    console.log('\n' + '-'.repeat(80));
    console.log('🔗 LINKS');
    console.log('-'.repeat(80));
    
    const explorerBase = token.network === 'base' 
      ? 'https://basescan.org'
      : 'https://sepolia.basescan.org';
    
    console.log(`Contract: ${explorerBase}/address/${token.address}`);
    console.log(`Deploy TX: ${explorerBase}/tx/${token.deploy_tx_hash}`);
    console.log(`Verification: ${explorerBase}/address/${token.address}#code`);

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 NEXT STEPS:');
    console.log('   1. Check if the error shows what went wrong');
    console.log('   2. Verify constructor_args match the deployment');
    console.log('   3. Try manual verification with the command above');
    console.log('   4. Check compiler settings in hardhat.config.js');
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

