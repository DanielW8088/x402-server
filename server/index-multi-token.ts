import express from "express";
import { deployToken, saveDeployedToken, verifyContract } from "./services/tokenDeployer.js";
import { initDatabase } from "./db/init.js";
import { MintQueueProcessor } from "./queue/processor.js";
import { PaymentQueueProcessor } from "./queue/payment-processor.js";
import { UserService } from "./services/userService.js";
import { AIAgentService } from "./services/aiAgentService.js";
import { AIAgentTaskExecutor } from "./queue/ai-agent-executor.js";

// Import configurations
import { 
  validateEnv, 
  PORT, 
  network, 
  DEPLOY_FEE_USDC,
  x402Enabled,
  agentEncryptionKey
} from "./config/env.js";
import { pool, initRedis } from "./config/database.js";
import { 
  serverAccount, 
  minterAccount, 
  serverWalletClient, 
  minterWalletClient, 
  publicClient,
  rpcTransport,
  chain,
  usdcAbi
} from "./config/blockchain.js";

// Import routers
import { createDeploymentRouter } from "./routes/deployment.js";
import { createTokensRouter } from "./routes/tokens.js";
import { createMintRouter } from "./routes/mint.js";
import { createQueueRouter } from "./routes/queue.js";
import { createUserRouter } from "./routes/user.js";
import { createAIAgentRouter } from "./routes/ai-agent.js";

// Import helpers
import { generateMintTxHash } from "./lib/helpers.js";
import { log } from "./lib/logger.js";

// Validate environment variables
validateEnv();

const app = express();

// Trust proxy
app.set('trust proxy', true);

// Enable CORS with x402 headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', 'X-Payment-Required, X-Payment-Version, X-Payment-Response');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

// Services
let redis: any = null;
let userService: UserService;
let aiAgentService: AIAgentService;
let aiAgentExecutor: AIAgentTaskExecutor | null = null;
let queueProcessor: MintQueueProcessor;
let paymentQueueProcessor: PaymentQueueProcessor;

// In-memory cache for token info (fallback when Redis not available)
const tokenInfoCache = new Map<string, { data: any; expiry: number }>();
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 60 seconds (1 minute)

// Clean up expired cache entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, entry] of tokenInfoCache.entries()) {
    if (entry.expiry < now) {
      tokenInfoCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries. Current size: ${tokenInfoCache.size}`);
  }
}, 120000); // Every 2 minutes

// Initialize payment queue processor for serial payment processing
// Use SERVER wallet for receiving USDC payments (prevents nonce conflicts)
paymentQueueProcessor = new PaymentQueueProcessor(
  pool,
  serverWalletClient,
  publicClient,
  chain,
  serverAccount,
  async (item, txHash) => {
    if (item.payment_type === 'deploy' && item.metadata) {
      const deployConfig = item.metadata.deployConfig;
      
      try {
        const deployResult = await deployToken(deployConfig);
        const savedToken = await saveDeployedToken(pool, deployConfig, deployResult);
        
        // Auto-verification
        setTimeout(async () => {
          try {
            log.verify(`Starting automatic verification for ${savedToken.address}...`);
            const verifyResult = await verifyContract(pool, savedToken.address);
            
            if (verifyResult.success) {
              log.success(`Auto-verification successful for ${savedToken.address}`);
              if (verifyResult.guid) {
                log.info(`   GUID: ${verifyResult.guid}`);
              }
            } else {
              log.warn(`Auto-verification failed for ${savedToken.address}: ${verifyResult.error}`);
            }
          } catch (verifyError: any) {
            log.warn(`Auto-verification error for ${savedToken.address}: ${verifyError.message}`);
          }
        }, 15000);
        
        return {
          success: true,
          tokenAddress: savedToken.address,
          deployTxHash: savedToken.deploy_tx_hash,
          blockNumber: savedToken.deploy_block_number,
        };
      } catch (error: any) {
        log.failure(`Deployment failed after payment:`, error.message);
        throw error;
      }
    }
    
    if (item.payment_type === 'mint' && item.metadata) {
      // Check if this is an x402 payment from ai-mint branch
      if (item.metadata.x402) {
        log.debug(`x402 payment completed, mints will be added by main flow`);
        return {
          success: true,
          x402: true,
          message: 'x402 mints handled by main flow'
        };
      }
      
      // 🔒 SECURE: Payment confirmed, now create mint queue items
      const { quantity, mode, paymentHeader, timestamp: paymentTimestamp, recipient: metadataRecipient } = item.metadata;
      const tokenAddress = item.token_address!;
      const payer = item.payer;
      const recipient = metadataRecipient || payer; // Use recipient from metadata or default to payer
      
      log.info(`🎯 Payment callback mint: payer=${payer}, recipient=${recipient}`);
      
      try {
        const queueIds: string[] = [];
        const timestamp = paymentTimestamp || Date.now();
        
        for (let i = 0; i < quantity; i++) {
          const txHashBytes32 = generateMintTxHash(recipient, timestamp + i, tokenAddress);
          
          const queueId = await queueProcessor.addToQueue(
            payer,
            txHashBytes32,
            item.tx_hash,
            mode === 'x402' ? { paymentHeader } : item.authorization, // Store payment data
            mode || 'x402', // Default to x402
            tokenAddress,
            recipient // Pass recipient to queue!
          );
          
          queueIds.push(queueId);
        }
        
        console.log(`✅ Created ${queueIds.length}x mint queue items after ${mode} payment confirmation`);
        
        return {
          success: true,
          queueIds,
          quantity,
          mode,
        };
      } catch (error: any) {
        log.failure(`Failed to queue mints after payment:`, error.message);
        throw error;
      }
    }
    
    return null;
  }
);

// Note: LP deployment is now handled by a separate standalone service
// See: server/lp-deployer-standalone.ts
// Run with: npm run lp-deployer

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    network,
    database: true,
    redis: redis?.status === 'ready',
    queueProcessor: "enabled",
    aiAgent: "enabled",
  });
});

async function start() {
  // Initialize Redis
  redis = await initRedis();

  // Initialize database
  try {
    await initDatabase(pool);
  } catch (error) {
    process.exit(1);
  }

  // Initialize services
  userService = new UserService(pool, redis);
  aiAgentService = new AIAgentService(pool);
  
  // AI Agent Task Executor is now a standalone service (ai-mint-executor.ts)
  // Run it separately with: pm2 start ecosystem.ai-mint.cjs
  // DO NOT enable it here to avoid conflicts
  const aiAgentEnabled = false; // Always disabled in main server
  if (aiAgentEnabled && agentEncryptionKey) {
    log.warn('⚠️  AI Agent Task Executor should run as standalone service!');
    log.warn('   Start with: pm2 start ecosystem.ai-mint.cjs');
    log.warn('   Do not enable AI_AGENT_ENABLED in main server');
  }

  // Initialize queue processor
  queueProcessor = new MintQueueProcessor(
    pool,
    minterWalletClient,
    publicClient,
    minterAccount,
    undefined,
    userService
  );

  // Start queue processors
  await queueProcessor.start();
  await paymentQueueProcessor.start();

  // Register routes
  app.use("/api", createDeploymentRouter(pool, paymentQueueProcessor));
  app.use("/api", createTokensRouter(pool, redis));
  app.use("/api", createMintRouter(pool, queueProcessor, paymentQueueProcessor));
  app.use("/api", createQueueRouter(queueProcessor, paymentQueueProcessor));
  app.use("/api", createUserRouter(userService));
  app.use("/api", createAIAgentRouter(aiAgentService));

  // Get queue config
  let mintQueueConfigDisplay = "enabled";
  let paymentQueueConfigDisplay = "enabled";
  try {
    const configResult = await pool.query(`
      SELECT key, value FROM system_settings 
      WHERE key IN ('batch_interval_seconds', 'payment_batch_interval_ms')
    `);
    configResult.rows.forEach(row => {
      const interval = parseInt(row.value);
      if (row.key === 'batch_interval_seconds') {
        mintQueueConfigDisplay = `✅ Enabled (batch every ${interval}s)`;
      } else if (row.key === 'payment_batch_interval_ms') {
        paymentQueueConfigDisplay = `✅ Enabled (batch every ${interval}ms)`;
      }
    });
  } catch (e) {
    mintQueueConfigDisplay = "✅ Enabled";
    paymentQueueConfigDisplay = "✅ Enabled";
  }

  app.listen(PORT, () => {
    log.startup(`\n🚀 Multi-Token Mint Server Started`);
    log.startup(`   Port: ${PORT}`);
    log.startup(`   Network: ${network}`);
    log.startup(`   Database: ✅ Connected`);
    log.startup(`   Redis: ${redis ? '✅ Connected' : '⚠️  Disabled'}`);
    log.startup(`   Log Level: ${process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG')}`);
    log.startup(`\n💰 Wallet Configuration:`);
    log.startup(`   SERVER (USDC payments): ${serverAccount.address}`);
    log.startup(`   MINTER (mint execution): ${minterAccount.address}`);
    log.startup(`\n⚙️  Queue Processors:`);
    log.startup(`   Payment Queue: ${paymentQueueConfigDisplay}`);
    log.startup(`   Mint Queue: ${mintQueueConfigDisplay}`);
    log.startup(`   x402: ${x402Enabled ? '✅ Enabled' : '❌ Disabled'}`);
    log.startup(`\n🤖 AI Agent:`);
    log.startup(`   Status: ${aiAgentExecutor ? '✅ Running' : '⏸️  Disabled'}`);
    if (aiAgentExecutor) {
      log.startup(`   Features: Chat + Auto Mint`);
    }
    log.startup(``);
  });
}

start().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('\n🛑 Shutting down gracefully...');
  queueProcessor.stop();
  paymentQueueProcessor.stop();
  // if (aiAgentExecutor) aiAgentExecutor.stop(); // Now runs as standalone service
  if (redis) await redis.quit();
  await pool.end();
  log.info('✅ Shutdown complete');
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('\n🛑 Shutting down gracefully...');
  queueProcessor.stop();
  paymentQueueProcessor.stop();
  // if (aiAgentExecutor) aiAgentExecutor.stop(); // Now runs as standalone service
  if (redis) await redis.quit();
  await pool.end();
  log.info('✅ Shutdown complete');
  process.exit(0);
});

