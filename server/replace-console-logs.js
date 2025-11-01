#!/usr/bin/env node
/**
 * Replace console.log with log system in ai-mint-executor.ts
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'ai-mint-executor.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replacement rules
const replacements = [
    // Start messages
    { from: /console\.log\(`\\n🚀 Starting/g, to: 'log.startup(`\\n🚀 Starting' },
    { from: /console\.log\(`   Monitoring for/g, to: 'log.startup(`   Monitoring for' },

    // Stop messages  
    { from: /console\.log\("🛑 AI Mint Executor stopped"\)/g, to: 'log.info("🛑 AI Mint Executor stopped")' },

    // Info messages (🔍, 💰, ✅, etc.)
    { from: /console\.log\(`\\n🔍 Found/g, to: 'log.info(`\\n🔍 Found' },
    { from: /console\.log\(`\\n💰 Checking pending_payment/g, to: 'log.info(`\\n💰 Checking pending_payment' },
    { from: /console\.log\(`   ⏰ Task exceeded payment/g, to: 'log.warn(`   ⏰ Task exceeded payment' },
    { from: /console\.log\(`   ❌ Cancelling task/g, to: 'log.warn(`   ❌ Cancelling task' },
    { from: /console\.log\(`   ✅ Task cancelled/g, to: 'log.info(`   ✅ Task cancelled' },
    { from: /console\.log\(`   Agent wallet balance:/g, to: 'log.debug(`   Agent wallet balance:' },
    { from: /console\.log\(`   Required:/g, to: 'log.debug(`   Required:' },
    { from: /console\.log\(`   Task age:/g, to: 'log.debug(`   Task age:' },
    { from: /console\.log\(`   ✅ Sufficient balance!/g, to: 'log.info(`   ✅ Sufficient balance!' },
    { from: /console\.log\(`   ✅ Task auto-funded/g, to: 'log.success(`   ✅ Task auto-funded' },
    { from: /console\.log\(`   ⏳ Insufficient balance/g, to: 'log.debug(`   ⏳ Insufficient balance' },
    { from: /console\.log\(`   ⏭️  Task/g, to: 'log.debug(`   ⏭️  Task' },

    // Processing messages
    { from: /console\.log\(`\\n╔═+╗`\)/g, to: 'log.info(`\\n╔════════════════════════════════════════════════════════════╗`)' },
    { from: /console\.log\(`║  Processing Task:/g, to: 'log.info(`║  Processing Task:' },
    { from: /console\.log\(`╚═+╝`\)/g, to: 'log.info(`╚════════════════════════════════════════════════════════════╝`)' },
    { from: /console\.log\(`   Token:/g, to: 'log.info(`   Token:' },
    { from: /console\.log\(`   Quantity:/g, to: 'log.info(`   Quantity:' },
    { from: /console\.log\(`   User Wallet \(recipient\):/g, to: 'log.info(`   User Wallet (recipient):' },
    { from: /console\.log\(`   Agent Wallet \(payer\):/g, to: 'log.info(`   Agent Wallet (payer):' },
    { from: /console\.log\(`   Transaction Sender:/g, to: 'log.info(`   Transaction Sender:' },
    { from: /console\.log\(`   Retry Count:/g, to: 'log.debug(`   Retry Count:' },
    { from: /console\.log\(`   🔍 Checking agent wallet/g, to: 'log.debug(`   🔍 Checking agent wallet' },
    { from: /console\.log\(`   💰 Agent wallet USDC/g, to: 'log.info(`   💰 Agent wallet USDC' },
    { from: /console\.log\(`   Payment Token:/g, to: 'log.debug(`   Payment Token:' },
    { from: /console\.log\(`   Price per Mint:/g, to: 'log.info(`   Price per Mint:' },
    { from: /console\.log\(`   Mint Amount:/g, to: 'log.debug(`   Mint Amount:' },
    { from: /console\.log\(`   Remaining:/g, to: 'log.debug(`   Remaining:' },
    { from: /console\.log\(`   AI Agent Account ETH:/g, to: 'log.debug(`   AI Agent Account ETH:' },

    // Minting messages
    { from: /console\.log\(`\\n   🎯 Minting batch/g, to: 'log.mint(`\\n   🎯 Minting batch' },
    { from: /console\.log\(`   💰 Batch cost:/g, to: 'log.debug(`   💰 Batch cost:' },
    { from: /console\.log\(`   🔐 Authorization created/g, to: 'log.debug(`   🔐 Authorization created' },
    { from: /console\.log\(`   📤 Sending to API:`\)/g, to: 'log.info(`   📤 Sending to API:`)' },
    { from: /console\.log\(`      - Payer/g, to: 'log.info(`      - Payer' },
    { from: /console\.log\(`      - Recipient/g, to: 'log.info(`      - Recipient' },
    { from: /console\.log\(`      - Quantity:/g, to: 'log.info(`      - Quantity:' },
    { from: /console\.log\(`   ✅ Batch of/g, to: 'log.success(`   ✅ Batch of' },
    { from: /console\.log\(`   📋 Queue IDs:/g, to: 'log.debug(`   📋 Queue IDs:' },

    // Completion messages
    { from: /console\.log\(`\\n   🎉 All/g, to: 'log.success(`\\n   🎉 All' },
    { from: /console\.log\(`   ✅ Task completed/g, to: 'log.success(`   ✅ Task completed' },

    // Error messages
    { from: /console\.error\(`   ❌ Batch failed:/g, to: 'log.error(`   ❌ Batch failed:' },
    { from: /console\.error\(`   🚫 Task exceeded retry/g, to: 'log.error(`   🚫 Task exceeded retry' },
    { from: /console\.error\(`   ❌ Error processing task:`/g, to: 'log.error(`   ❌ Error processing task:`' },
    { from: /console\.error\("❌ Monitor error:"/g, to: 'log.error("❌ Monitor error:"' },
    { from: /console\.error\(`\\n❌ Task processing failed:/g, to: 'log.error(`\\n❌ Task processing failed:' },
    { from: /console\.error\("❌ Fatal error:"/g, to: 'log.error("❌ Fatal error:"' },
];

// Apply replacements
replacements.forEach(({ from, to }) => {
    content = content.replace(from, to);
});

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Replaced console calls with log system');
console.log(`   Processed: ${filePath}`);

