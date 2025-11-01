import { Router } from "express";
import { MintQueueProcessor } from "../queue/processor.js";
import { PaymentQueueProcessor } from "../queue/payment-processor.js";

export function createQueueRouter(
  queueProcessor: MintQueueProcessor,
  paymentQueueProcessor: PaymentQueueProcessor
): Router {
  const router = Router();

  /**
   * GET /api/payment/:paymentId - Get payment status
   */
  router.get("/payment/:paymentId", async (req, res) => {
    try {
      const { paymentId } = req.params;
      const status = await paymentQueueProcessor.getPaymentStatus(paymentId);
      
      if (!status) {
        return res.status(404).json({
          error: "Payment not found",
        });
      }

      const response: any = {
        paymentId: status.id,
        paymentType: status.payment_type,
        status: status.status,
        payer: status.payer,
        amount: status.amount,
        paymentTokenAddress: status.payment_token_address,
        txHash: status.tx_hash,
        error: status.error,
        createdAt: status.created_at,
        processedAt: status.processed_at,
      };

      // Include deployment result
      if (status.result) {
        response.result = status.result;
        
        if (status.payment_type === 'deploy' && status.result.tokenAddress) {
          response.tokenAddress = status.result.tokenAddress;
          response.deployTxHash = status.result.deployTxHash;
          response.mintUrl = `${req.protocol}://${req.get('host')}/mint/${status.result.tokenAddress}`;
        }
      }

      return res.json(response);
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to fetch payment status",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/payment/stats - Get payment queue statistics
   */
  router.get("/payment/stats", async (req, res) => {
    try {
      const stats = await paymentQueueProcessor.getStats();
      return res.json(stats);
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to fetch payment stats",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/queue/:queueId - Get queue item status
   */
  router.get("/queue/:queueId", async (req, res) => {
    try {
      const { queueId } = req.params;
      const status = await queueProcessor.getQueueStatus(queueId);
      
      if (!status) {
        return res.status(404).json({
          error: "Queue item not found",
        });
      }

      return res.json(status);
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to fetch queue status",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/queue/stats - Get queue statistics
   */
  router.get("/queue/stats", async (req, res) => {
    try {
      const stats = await queueProcessor.getQueueStats();
      return res.json(stats);
    } catch (error: any) {
      return res.status(500).json({
        error: "Failed to fetch queue stats",
        message: error.message,
      });
    }
  });

  return router;
}

