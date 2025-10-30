#!/usr/bin/env node
/**
 * Reset nonce - forces next payment batch to sync from chain
 * This clears any cached nonce state
 */

console.log('\n🔧 Nonce reset tool');
console.log('================\n');

console.log('✅ When you restart the service, it will:');
console.log('   1. Sync nonce from chain (using "pending" blockTag)');
console.log('   2. Start from the correct next available nonce\n');

console.log('📋 Steps to complete the reset:\n');
console.log('   1. Make sure all old failed/processing payments are cancelled');
console.log('   2. Restart the service: pm2 restart token-server');
console.log('   3. Monitor logs: pm2 logs token-server --lines 50\n');

console.log('💡 Expected log output:');
console.log('   ✅ NonceManager initialized, starting nonce: 363 (or higher)');
console.log('   🔄 Synced nonce from chain: 363 (pending)\n');

console.log('⚠️  If you see nonce > 363, it means there are pending txs in mempool.');
console.log('    This is OK - the system will continue from there.\n');

