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
  x402Enabled 
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

// Initialize payment queue processor
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
            console.log(`🔍 Starting automatic verification for ${savedToken.address}...`);
            const verifyResult = await verifyContract(pool, savedToken.address);
            
            if (verifyResult.success) {
              console.log(`✅ Auto-verification successful for ${savedToken.address}`);
              if (verifyResult.guid) {
                console.log(`   GUID: ${verifyResult.guid}`);
              }
            } else {
              console.warn(`⚠️  Auto-verification failed for ${savedToken.address}: ${verifyResult.error}`);
            }
          } catch (verifyError: any) {
            console.warn(`⚠️  Auto-verification error for ${savedToken.address}: ${verifyError.message}`);
          }
        }, 15000);
        
        return {
          success: true,
          tokenAddress: savedToken.address,
          deployTxHash: savedToken.deploy_tx_hash,
          blockNumber: savedToken.deploy_block_number,
        };
      } catch (error: any) {
        console.error(`❌ Deployment failed after payment:`, error.message);
        throw error;
      }
    }
    
    if (item.payment_type === 'mint' && item.metadata) {
      if (item.metadata.x402) {
        console.log(`   ✅ x402 payment completed, mints will be added by main flow`);
        return {
          success: true,
          x402: true,
          message: 'x402 mints handled by main flow'
        };
      }
      
      const { quantity } = item.metadata;
      const tokenAddress = item.token_address!;
      const payer = item.payer;
      
      try {
        const queueIds: string[] = [];
        const timestamp = Date.now();
        
        for (let i = 0; i < quantity; i++) {
          const txHashBytes32 = generateMintTxHash(payer, timestamp + i, tokenAddress);
          
          const queueId = await queueProcessor.addToQueue(
            payer,
            txHashBytes32,
            txHash,
            item.authorization,
            'traditional',
            tokenAddress
          );
          
          queueIds.push(queueId);
        }
        
        return {
          success: true,
          queueIds,
          quantity,
        };
      } catch (error: any) {
        console.error(`❌ Failed to queue mints after payment:`, error.message);
        throw error;
      }
    }
    
    return null;
  }
);

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
  
  // Initialize AI agent task executor
  const aiAgentEnabled = process.env.AI_AGENT_ENABLED !== 'false';
  if (aiAgentEnabled && process.env.AGENT_ENCRYPTION_KEY) {
    const serverUrl = `http://localhost:${PORT}`;
    
    aiAgentExecutor = new AIAgentTaskExecutor(
      pool,
      network,
      rpcTransport,
      serverUrl
    );
    
    await aiAgentExecutor.start();
  } else if (aiAgentEnabled && !process.env.AGENT_ENCRYPTION_KEY) {
    console.warn('⚠️  AI Agent enabled but AGENT_ENCRYPTION_KEY not set. Agent will not start.');
    console.warn('   Generate key with: node scripts/generate-agent-key.js');
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
    console.log(`\n🚀 Multi-Token Mint Server Started`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Network: ${network}`);
    console.log(`   Database: ✅ Connected`);
    console.log(`   Redis: ${redis ? '✅ Connected' : '⚠️  Disabled'}`);
    console.log(`\n💰 Wallet Configuration:`);
    console.log(`   SERVER (USDC payments): ${serverAccount.address}`);
    console.log(`   MINTER (mint execution): ${minterAccount.address}`);
    console.log(`\n⚙️  Queue Processors:`);
    console.log(`   Payment Queue: ${paymentQueueConfigDisplay}`);
    console.log(`   Mint Queue: ${mintQueueConfigDisplay}`);
    console.log(`   x402: ${x402Enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`\n🤖 AI Agent:`);
    console.log(`   Status: ${aiAgentExecutor ? '✅ Running' : '⏸️  Disabled'}`);
    if (aiAgentExecutor) {
      console.log(`   Features: Chat + Auto Mint`);
    }
    console.log(``);
  });
}

start().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  queueProcessor.stop();
  paymentQueueProcessor.stop();
  if (aiAgentExecutor) aiAgentExecutor.stop();
  if (redis) await redis.quit();
  await pool.end();
  console.log('✅ Shutdown complete');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  queueProcessor.stop();
  paymentQueueProcessor.stop();
  if (aiAgentExecutor) aiAgentExecutor.stop();
  if (redis) await redis.quit();
  await pool.end();
  console.log('✅ Shutdown complete');
  process.exit(0);
});

