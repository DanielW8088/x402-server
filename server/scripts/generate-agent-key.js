/**
 * Generate encryption key for AI Agent system
 * 
 * Usage:
 *   node scripts/generate-agent-key.js
 * 
 * This will generate a secure 256-bit encryption key
 * Add the output to your .env file as AGENT_ENCRYPTION_KEY
 */

const crypto = require('crypto');

console.log('\n🔐 Generating AI Agent Encryption Key...\n');

const key = crypto.randomBytes(32).toString('hex');

console.log('Add this to your .env file:\n');
console.log(`AGENT_ENCRYPTION_KEY=${key}`);
console.log('\n⚠️  IMPORTANT:');
console.log('   - Keep this key secret');
console.log('   - Back it up securely');
console.log('   - Losing this key = losing access to encrypted agent wallets');
console.log('   - Do NOT commit this to git\n');

