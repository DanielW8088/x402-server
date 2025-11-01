/**
 * Generate encryption key for AI Agent system
 * 
 * Usage:
 *   node scripts/generate-agent-key.js
 * 
 * This will generate a secure 256-bit encryption key
 * Add the output to your private key file as agentEncryptionKey
 */

const crypto = require('crypto');

console.log('\n🔐 Generating AI Agent Encryption Key...\n');

const key = crypto.randomBytes(32).toString('hex');

console.log('Generated key:\n');
console.log(`${key}`);
console.log('\n📝 Add this to your private key file:\n');

// Detect OS
const os = require('os');
const platform = os.platform();
const defaultPath = platform === 'darwin'
    ? `${os.homedir()}/.config/token-mint/private.key`
    : '/etc/secret/private.key';

console.log(`File location: ${defaultPath}`);
console.log(`Or custom location via PRIVATE_KEY_FILE env var\n`);

console.log('File format (JSON):');
console.log('{');
console.log('  "serverPrivateKey": "0x...",');
console.log('  "minterPrivateKey": "0x...",');
console.log('  "lpDeployerPrivateKey": "0x...",');
console.log(`  "agentEncryptionKey": "${key}"`);
console.log('}\n');

console.log('⚠️  IMPORTANT:');
console.log('   - Keep this key secret');
console.log('   - Back it up securely (along with private key file)');
console.log('   - Losing this key = losing access to encrypted agent wallets');
console.log('   - File permissions must be 600 (owner read/write only)');
console.log('   - Do NOT commit private.key to git\n');

console.log('📖 See docs/PRIVATE_KEY_SETUP.md for detailed setup instructions\n');

