import { Router } from "express";
import { Pool } from "pg";
import { getAddress } from "viem";
import { getToken } from "../services/tokenDeployer.js";
import { MintQueueProcessor } from "../queue/processor.js";
import { PaymentQueueProcessor } from "../queue/payment-processor.js";
import { publicClient, tokenAbi } from "../config/blockchain.js";
import { network, x402Enabled } from "../config/env.js";
import { generateMintTxHash, generatePaymentRequirements } from "../lib/helpers.js";
import { verifyX402Payment, settleX402Payment } from "../lib/x402.js";
import { log } from "../lib/logger.js";

export function createMintRouter(
  pool: Pool,
  queueProcessor: MintQueueProcessor,
  paymentQueueProcessor: PaymentQueueProcessor
): Router {
  const router = Router();

  /**
   * POST /api/mint/:address - Mint tokens
   */
  router.post("/mint/:address", async (req, res) => {
    try {
      const { address: tokenAddress } = req.params;
      const tokenContractAddress = tokenAddress as `0x${string}`;
      const quantity = req.body.quantity || 1;
      
      log.debug(`📦 Request quantity: ${quantity}, body:`, JSON.stringify(req.body));
      
      if (quantity < 1 || quantity > 10) {
        return res.status(400).json({
          error: "Invalid quantity",
          message: "Quantity must be between 1 and 10",
        });
      }
      
      // Check payment method
      const paymentHeader = req.headers['x-payment'] as string | undefined;
      const authorization = req.body.authorization;
      
      const useX402 = !!paymentHeader && x402Enabled;
      const useTraditional = !!authorization;
      
      // If no payment, return 402 Payment Required
      if (!useX402 && !useTraditional) {
        let tokenPrice = "1 USDC";
        if (pool) {
          const dbToken = await getToken(pool, tokenAddress);
          if (dbToken) {
            tokenPrice = dbToken.price;
          }
        }
        
        const priceMatch = tokenPrice.match(/[\d.]+/);
        const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 1;
        const totalPrice = pricePerMint * quantity;
        const totalPriceWei = BigInt(Math.floor(totalPrice * 1e6));
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        const paymentRequirements = generatePaymentRequirements(
          tokenAddress,
          quantity,
          totalPrice,
          totalPriceWei,
          baseUrl
        );
        
        const x402Response = {
          x402Version: 1,
          accepts: [paymentRequirements],
        };
        
        res.setHeader('X-Payment-Required', 'x402');
        res.setHeader('X-Payment-Version', '1');
        return res.status(402).json(x402Response);
      }
      
      // Validate traditional payment
      if (useTraditional && (!authorization || !authorization.signature)) {
        return res.status(400).json({
          error: "Invalid payment authorization",
          message: "Traditional payment requires authorization with signature",
        });
      }
      
      // Process payment
      let payer: `0x${string}`;
      let paymentTxHash: string | undefined;
      let paymentMode: "x402" | "traditional";
      
      if (useX402) {
        paymentMode = "x402";
        
        // Get expected price
        let expectedPrice: bigint;
        if (pool) {
          const dbToken = await getToken(pool, tokenAddress);
          if (dbToken) {
            const priceMatch = dbToken.price.match(/[\d.]+/);
            if (priceMatch) {
              const priceInUSDC = parseFloat(priceMatch[0]);
              expectedPrice = BigInt(Math.floor(priceInUSDC * 1e6)) * BigInt(quantity);
            } else {
              expectedPrice = BigInt(1e6) * BigInt(quantity);
            }
          } else {
            expectedPrice = BigInt(1e6) * BigInt(quantity);
          }
        } else {
          expectedPrice = BigInt(1e6) * BigInt(quantity);
        }
        
        // Decode payment header
        const paymentPayload = JSON.parse(Buffer.from(paymentHeader!, 'base64').toString('utf-8'));
        payer = paymentPayload.payload?.authorization?.from as `0x${string}`;
        
        // Verify payment
        log.debug(`Expected price: ${expectedPrice} wei for quantity ${quantity}`);
        const verifyResult = await verifyX402Payment(paymentHeader!, tokenAddress, expectedPrice, quantity, req);
        
        if (!verifyResult.valid) {
          return res.status(400).json({
            error: "x402 payment verification failed",
            message: verifyResult.error || "Payment signature or parameters invalid",
          });
        }
        
        // Settle payment
        const settleResult = await settleX402Payment(paymentHeader!, tokenAddress, expectedPrice, quantity, req);
        
        if (!settleResult.success) {
          return res.status(400).json({
            error: "x402 payment settlement failed",
            message: settleResult.error || "Failed to settle payment on-chain",
          });
        }
        
        paymentTxHash = settleResult.txHash;
        
      } else {
        // Traditional EIP-3009
        paymentMode = "traditional";
        payer = authorization.from as `0x${string}`;
        
        // Get payment token address
        let paymentTokenAddress: `0x${string}`;
        if (pool) {
          const dbToken = await getToken(pool, tokenAddress);
          if (dbToken) {
            paymentTokenAddress = dbToken.payment_token_address as `0x${string}`;
          } else {
            paymentTokenAddress = network === 'base-sepolia' 
              ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
              : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
          }
        } else {
          paymentTokenAddress = network === 'base-sepolia' 
            ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
            : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
        }
      
        // Verify authorization recipient
        if (getAddress(authorization.to) !== getAddress(tokenAddress)) {
          return res.status(400).json({
            error: "Invalid payment recipient",
            message: `Payment must be sent to token contract ${tokenAddress}, but was sent to ${authorization.to}`,
          });
        }
      
        // Verify payment amount
        let expectedPrice: bigint;
        if (pool) {
          const dbToken = await getToken(pool, tokenAddress);
          if (!dbToken) {
            return res.status(404).json({
              error: "Token not found",
              message: `Token ${tokenAddress} not found in database`,
            });
          }
          const priceMatch = dbToken.price.match(/[\d.]+/);
          if (!priceMatch) {
            return res.status(500).json({
              error: "Invalid token price",
              message: "Token price format is invalid in database",
            });
          }
          const priceInUSDC = parseFloat(priceMatch[0]);
          expectedPrice = BigInt(Math.floor(priceInUSDC * 1e6)) * BigInt(quantity);
        } else {
          return res.status(503).json({
            error: "Database not configured",
            message: "Cannot verify payment amount without database",
          });
        }
        
        const providedValue = BigInt(authorization.value);
        if (providedValue !== expectedPrice) {
          return res.status(400).json({
            error: "Invalid payment amount",
            message: `Payment must be exactly ${Number(expectedPrice) / 1e6} USDC (${expectedPrice.toString()} wei) for ${quantity}x mint, but got ${Number(providedValue) / 1e6} USDC`,
            expected: expectedPrice.toString(),
            provided: providedValue.toString(),
          });
        }
      
        // Add payment to queue
        try {
          const paymentQueueId = await paymentQueueProcessor.addToQueue(
            'mint',
            authorization,
            payer,
            authorization.value,
            paymentTokenAddress,
            tokenAddress,
            { quantity }
          );
          
          // Poll for payment completion
          const maxWaitTime = 30000;
          const pollInterval = 500;
          const startTime = Date.now();

          while (Date.now() - startTime < maxWaitTime) {
            const status = await paymentQueueProcessor.getPaymentStatus(paymentQueueId);
            
            if (!status) {
              return res.status(500).json({
                error: "Payment status not found",
                message: "Unable to track payment processing"
              });
            }

            if (status.status === 'completed') {
              paymentTxHash = status.tx_hash;
              break;
            }

            if (status.status === 'failed') {
              return res.status(400).json({
                error: "Payment processing failed",
                message: status.error || "Payment transaction failed",
              });
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }

          if (!paymentTxHash) {
            return res.status(408).json({
              error: "Payment processing timeout",
              message: "Payment is still being processed - check status later",
            paymentQueueId,
          });
        }
        
        log.debug(`Traditional payment completed, mints will be added by callback`);
        
        if (!pool) {
            return res.status(500).json({
              error: "Database not configured",
              message: "Cannot verify mint queue items without database",
            });
          }
          
          // Wait for callback to create mint queue items
          let mintQueueItems: { rows: Array<{ id: string; status: string }> } | undefined;
          const callbackWaitStart = Date.now();
          const callbackMaxWait = 5000;
          
          while (Date.now() - callbackWaitStart < callbackMaxWait) {
            mintQueueItems = await pool.query(
              `SELECT id, status FROM mint_queue 
               WHERE payer_address = $1 
               AND token_address = $2 
               AND payment_tx_hash = $3
               ORDER BY created_at DESC
               LIMIT $4`,
              [payer, tokenAddress, paymentTxHash, quantity]
            );
            
            if (mintQueueItems.rows.length === quantity) {
              break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          if (!mintQueueItems || mintQueueItems.rows.length === 0) {
            return res.status(500).json({
              error: "Mints not found",
              message: "Payment completed but mint queue items were not created by callback",
            });
          }
          
          if (mintQueueItems.rows.length !== quantity) {
            log.warn(`Expected ${quantity} mints, but found ${mintQueueItems.rows.length}`);
          }
          
          const callbackQueueIds = mintQueueItems.rows.map((row: any) => row.id);
          const firstQueueStatus = await queueProcessor.getQueueStatus(callbackQueueIds[0]);
          
          return res.status(200).json({
            success: true,
            message: `Added ${callbackQueueIds.length}x mint${callbackQueueIds.length > 1 ? 's' : ''} to queue (traditional payment)`,
            queueId: callbackQueueIds[0],
            queueIds: callbackQueueIds,
            quantity: callbackQueueIds.length,
            payer,
            paymentMode: 'traditional',
            status: firstQueueStatus.status,
            queuePosition: firstQueueStatus.queuePosition,
            estimatedWaitSeconds: firstQueueStatus.estimatedWaitSeconds,
            paymentTxHash: paymentTxHash,
          });
        } catch (error: any) {
          return res.status(400).json({
            error: "Failed to queue payment",
            message: error.message,
          });
        }
      }

      // x402 payment mode continues - add mints directly
      
      // Check remaining supply
      const [remainingSupply, mintAmountPerPayment] = await Promise.all([
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "remainingSupply",
        }),
        publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "mintAmount",
        }),
      ]);

      if (remainingSupply < mintAmountPerPayment * BigInt(quantity)) {
        return res.status(400).json({
          error: "Insufficient remaining supply",
          message: `Only ${remainingSupply} tokens remaining, but ${quantity}x mint requires ${mintAmountPerPayment * BigInt(quantity)} tokens`,
        });
      }

      // Determine recipient: use provided recipient or default to payer
      const recipient = req.body.recipient || payer;
      log.debug(`💎 Minting to recipient: ${recipient} (payer: ${payer})`);

      // Add mints to queue
      const queueIds: string[] = [];
      const timestamp = Date.now();
      
      for (let i = 0; i < quantity; i++) {
        const txHashBytes32 = generateMintTxHash(recipient, timestamp + i, tokenAddress);
        
        // Check if already minted
        const alreadyMinted = await publicClient.readContract({
          address: tokenContractAddress,
          abi: tokenAbi,
          functionName: "hasMinted",
          args: [txHashBytes32],
        });

        if (alreadyMinted) {
          continue;
        }

        const queueId = await queueProcessor.addToQueue(
          recipient, // Mint to recipient, not payer
          txHashBytes32,
          paymentTxHash,
          useX402 ? { paymentHeader } : authorization,
          paymentMode,
          tokenAddress
        );
        
        queueIds.push(queueId);
      }

      if (queueIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: "All mints already completed",
          payer,
        });
      }

      // Get queue status
      const queueStatus = await queueProcessor.getQueueStatus(queueIds[0]);

      const response: any = {
        success: true,
        message: `Added ${queueIds.length}x mint${queueIds.length > 1 ? 's' : ''} to queue (${paymentMode} payment)`,
        queueId: queueIds[0],
        queueIds,
        quantity: queueIds.length,
        payer,
        paymentMode,
        status: queueStatus.status,
        queuePosition: queueStatus.queue_position,
        estimatedWaitSeconds: queueStatus.queue_position * 10,
        amount: (mintAmountPerPayment * BigInt(queueIds.length)).toString(),
        paymentTxHash: paymentTxHash,
      };

      // Add x402 payment receipt
      if (useX402 && paymentTxHash) {
        const paymentReceipt = {
          success: true,
          transaction: paymentTxHash,
          payer: payer,
          amount: (mintAmountPerPayment * BigInt(queueIds.length)).toString(),
          timestamp: Date.now(),
        };
        
        const receiptBase64 = Buffer.from(JSON.stringify(paymentReceipt)).toString('base64');
        res.setHeader('X-PAYMENT-RESPONSE', receiptBase64);
      }

      return res.status(200).json(response);
    } catch (error: any) {
      return res.status(500).json({
        error: "Mint failed",
        message: error.message,
      });
    }
  });

  return router;
}

