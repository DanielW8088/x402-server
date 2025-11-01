import { Router } from "express";
import { isAddress, getAddress } from "viem";
import { Pool } from "pg";
import { TokenDeployConfig } from "../services/tokenDeployer.js";
import { PaymentQueueProcessor } from "../queue/payment-processor.js";
import { account } from "../config/blockchain.js";
import { network, DEPLOY_FEE_USDC } from "../config/env.js";
import { 
  MAX_NAME_LENGTH, 
  MAX_SYMBOL_LENGTH, 
  MAX_DESCRIPTION_LENGTH, 
  MAX_URL_LENGTH 
} from "../config/env.js";
import { 
  isValidTokenName, 
  isValidSymbol, 
  isValidHttpUrl 
} from "../lib/validation.js";
import { getAdvisoryLockId } from "../lib/helpers.js";

export function createDeploymentRouter(
  pool: Pool,
  paymentQueueProcessor: PaymentQueueProcessor
): Router {
  const router = Router();

  /**
   * GET /api/deploy-address - Get deployment service address
   */
  router.get("/deploy-address", async (req, res) => {
    try {
      return res.status(200).json({
        deployAddress: account.address,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to get deploy address",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/deploy - Deploy a new token
   */
  router.post("/deploy", async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        error: "Database not configured",
        message: "Token deployment requires DATABASE_URL to be set",
      });
    }

    const client = await pool.connect();
    
    try {
      const { name, symbol, mintAmount, maxMintCount, price, paymentToken, deployer, authorization, imageUrl, description } = req.body;

      // Required fields
      if (!name || !symbol || !mintAmount || !maxMintCount || !price || !paymentToken || !deployer) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["name", "symbol", "mintAmount", "maxMintCount", "price", "paymentToken", "deployer"],
        });
      }

      // Payment authorization
      if (!authorization || !authorization.signature) {
        return res.status(400).json({
          error: "Missing payment authorization",
          message: "Deployment requires 10 USDC payment authorization",
        });
      }

      // Length validation
      if (name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({
          error: "Invalid name",
          message: `Name must be ${MAX_NAME_LENGTH} characters or less (got ${name.length})`,
        });
      }

      if (symbol.length > MAX_SYMBOL_LENGTH) {
        return res.status(400).json({
          error: "Invalid symbol",
          message: `Symbol must be ${MAX_SYMBOL_LENGTH} characters or less (got ${symbol.length})`,
        });
      }

      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({
          error: "Invalid description",
          message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less (got ${description.length})`,
        });
      }

      if (imageUrl && imageUrl.length > MAX_URL_LENGTH) {
        return res.status(400).json({
          error: "Invalid image URL",
          message: `Image URL must be ${MAX_URL_LENGTH} characters or less (got ${imageUrl.length})`,
        });
      }

      // Character validation
      if (!isValidTokenName(name)) {
        return res.status(400).json({
          error: "Invalid name format",
          message: "Name can only contain letters, numbers, spaces, and basic punctuation (.,!?-_())",
        });
      }

      if (!isValidSymbol(symbol)) {
        return res.status(400).json({
          error: "Invalid symbol format",
          message: "Symbol can only contain uppercase letters and numbers (e.g., TOKEN, ABC123)",
        });
      }

      // Address validation
      if (!isAddress(deployer)) {
        return res.status(400).json({
          error: "Invalid deployer address",
          message: "Deployer must be a valid Ethereum address",
        });
      }

      // URL validation
      if (imageUrl && !isValidHttpUrl(imageUrl)) {
        return res.status(400).json({
          error: "Invalid image URL",
          message: "Image URL must be a valid HTTP or HTTPS URL",
        });
      }

      // Normalize deployer address
      const normalizedDeployer = getAddress(deployer);

      // Numeric constraints
      const mintAmountNum = parseFloat(mintAmount);
      const maxMintCountNum = parseInt(maxMintCount);
      const priceNum = parseFloat(price);

      if (isNaN(mintAmountNum) || mintAmountNum < 1) {
        return res.status(400).json({
          error: "Invalid mintAmount",
          message: "mintAmount must be a number greater than or equal to 1",
        });
      }

      if (isNaN(maxMintCountNum) || maxMintCountNum < 10) {
        return res.status(400).json({
          error: "Invalid maxMintCount",
          message: "maxMintCount must be an integer greater than or equal to 10",
        });
      }

      if (isNaN(priceNum) || priceNum < 1) {
        return res.status(400).json({
          error: "Invalid price",
          message: "price must be a number greater than or equal to 1",
        });
      }

      // Payment token validation
      if (paymentToken !== 'USDC' && paymentToken !== 'USDT') {
        return res.status(400).json({
          error: "Invalid payment token",
          message: "paymentToken must be either 'USDC' or 'USDT'",
        });
      }

      // Acquire advisory lock
      const lockId = getAdvisoryLockId('token-deployment-global');
      
      await client.query('BEGIN');
      const lockResult = await client.query('SELECT pg_try_advisory_xact_lock($1) as acquired', [lockId.toString()]);
      
      if (!lockResult.rows[0].acquired) {
        await client.query('ROLLBACK');
        return res.status(503).json({
          error: "Deployment in progress",
          message: "Another token is currently being deployed. Please wait a moment and try again.",
          retryAfter: 5,
        });
      }
      
      // Verify authorization
      const usdcAddress = network === 'base-sepolia' 
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;

      if (getAddress(authorization.to) !== getAddress(account.address)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: "Invalid payment recipient",
          message: `Payment must be sent to ${account.address}`,
        });
      }

      if (BigInt(authorization.value) !== DEPLOY_FEE_USDC) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: "Invalid payment amount",
          message: `Payment must be exactly 10 USDC (${DEPLOY_FEE_USDC.toString()} wei)`,
        });
      }

      // Create deployment config
      const excessRecipient = process.env.EXCESS_RECIPIENT_ADDRESS;
      const deployConfig: TokenDeployConfig = {
        name,
        symbol,
        mintAmount: mintAmount.toString(),
        maxMintCount: parseInt(maxMintCount),
        price: price.toString(),
        paymentToken: paymentToken === 'USDT' ? 'USDT' : 'USDC',
        network,
        deployer: normalizedDeployer,
        excessRecipient: excessRecipient as `0x${string}` | undefined,
        imageUrl: imageUrl || undefined,
        description: description || undefined,
      };

      // Add payment to queue
      const paymentId = await paymentQueueProcessor.addToQueue(
        'deploy',
        authorization,
        normalizedDeployer,
        DEPLOY_FEE_USDC.toString(),
        usdcAddress,
        undefined,
        { deployConfig }
      );

      // Commit transaction
      await client.query('COMMIT');

      return res.status(202).json({
        success: true,
        message: "Deployment payment queued. Token will be deployed after payment completes.",
        paymentId,
        paymentStatus: "pending",
        statusUrl: `${req.protocol}://${req.get('host')}/api/payment/${paymentId}`,
        estimatedSeconds: 5,
      });
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Rollback failed
      }
      
      return res.status(500).json({
        error: "Deployment failed",
        message: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}

