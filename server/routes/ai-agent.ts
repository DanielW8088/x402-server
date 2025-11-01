import { Router } from "express";
import { isAddress } from "viem";
import { AIAgentService } from "../services/aiAgentService.js";

export function createAIAgentRouter(aiAgentService: AIAgentService): Router {
  const router = Router();

  /**
   * POST /api/ai-agent/chat - Send message to AI agent
   */
  router.post("/ai-agent/chat", async (req, res) => {
    try {
      const { userAddress, message } = req.body;

      if (!userAddress || !isAddress(userAddress)) {
        return res.status(400).json({
          error: "Invalid user address",
        });
      }

      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          error: "Message is required",
        });
      }

      const response = await aiAgentService.processMessage(userAddress, message);

      // Get the latest chat message to check for metadata
      const history = await aiAgentService.getChatHistory(userAddress, 1);
      const latestMessage = history[history.length - 1];

      return res.json({
        success: true,
        response,
        metadata: latestMessage?.metadata || null,
      });
    } catch (error: any) {
      console.error("Error in AI agent chat:", error);
      return res.status(500).json({
        error: "Failed to process message",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/ai-agent/wallet/:address - Get agent wallet info
   */
  router.get("/ai-agent/wallet/:address", async (req, res) => {
    try {
      const { address } = req.params;

      if (!isAddress(address)) {
        return res.status(400).json({
          error: "Invalid address",
        });
      }

      const wallet = await aiAgentService.getOrCreateAgentWallet(address);

      // Optionally refresh balance from chain if requested
      const refresh = req.query.refresh === 'true';
      let usdcBalance = wallet.usdcBalance;
      let lastBalanceCheck = wallet.lastBalanceCheck;

      if (refresh) {
        const refreshed = await aiAgentService.refreshWalletBalance(wallet.id);
        usdcBalance = refreshed.usdcBalance;
        lastBalanceCheck = refreshed.lastBalanceCheck;
      }

      return res.json({
        success: true,
        wallet: {
          agentAddress: wallet.agentAddress,
          usdcBalance: usdcBalance.toString(),
          lastBalanceCheck: lastBalanceCheck,
        },
      });
    } catch (error: any) {
      console.error("Error fetching agent wallet:", error);
      return res.status(500).json({
        error: "Failed to fetch agent wallet",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/ai-agent/history/:address - Get chat history
   */
  router.get("/ai-agent/history/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!isAddress(address)) {
        return res.status(400).json({
          error: "Invalid address",
        });
      }

      const history = await aiAgentService.getChatHistory(address, limit);

      return res.json({
        success: true,
        history,
      });
    } catch (error: any) {
      console.error("Error fetching chat history:", error);
      return res.status(500).json({
        error: "Failed to fetch chat history",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/ai-agent/tasks/:address - Get user's tasks
   */
  router.get("/ai-agent/tasks/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!isAddress(address)) {
        return res.status(400).json({
          error: "Invalid address",
        });
      }

      // Get tasks with limit and offset
      const tasks = await aiAgentService.getUserTasks(address, limit, offset);
      
      // Get total count (optional, for pagination)
      const totalResult = await aiAgentService.getUserTasksCount(address);

      return res.json({
        success: true,
        tasks: tasks.map(task => ({
          ...task,
          pricePerMint: task.pricePerMint.toString(),
          totalCost: task.totalCost.toString(),
        })),
        total: totalResult,
      });
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      return res.status(500).json({
        error: "Failed to fetch tasks",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/ai-agent/task/:taskId - Get specific task
   */
  router.get("/ai-agent/task/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;

      const task = await aiAgentService.getTask(taskId);

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      return res.json({
        success: true,
        task: {
          ...task,
          pricePerMint: task.pricePerMint.toString(),
          totalCost: task.totalCost.toString(),
        },
      });
    } catch (error: any) {
      console.error("Error fetching task:", error);
      return res.status(500).json({
        error: "Failed to fetch task",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/ai-agent/task/:taskId/cancel - Cancel a task
   */
  router.post("/ai-agent/task/:taskId/cancel", async (req, res) => {
    try {
      const { taskId } = req.params;

      const task = await aiAgentService.getTask(taskId);
      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      if (task.status !== 'pending_payment') {
        return res.status(400).json({
          error: "Can only cancel tasks in pending_payment status",
        });
      }

      await aiAgentService.updateTaskStatus(taskId, 'cancelled');

      return res.json({
        success: true,
        message: "Task cancelled",
      });
    } catch (error: any) {
      console.error("Error cancelling task:", error);
      return res.status(500).json({
        error: "Failed to cancel task",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/ai-agent/task/:taskId/retry - Retry a failed task
   */
  router.post("/ai-agent/task/:taskId/retry", async (req, res) => {
    try {
      const { taskId } = req.params;

      const task = await aiAgentService.getTask(taskId);
      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      if (task.status !== 'failed') {
        return res.status(400).json({
          error: "Can only retry failed tasks",
          message: `Task status is ${task.status}`,
        });
      }

      // Reset task status to funded
      await aiAgentService.updateTaskStatus(taskId, 'funded', {
        errorMessage: '',
      });

      console.log(`🔄 Task ${taskId} marked for retry by user`);

      return res.json({
        success: true,
        message: "Task will be retried",
      });
    } catch (error: any) {
      console.error("Error retrying task:", error);
      return res.status(500).json({
        error: "Failed to retry task",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/ai-agent/task/:taskId/fund - Fund a task with EIP-3009 authorization
   */
  router.post("/ai-agent/task/:taskId/fund", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { authorization, signature } = req.body;

      if (!authorization || !signature) {
        return res.status(400).json({
          error: "Missing authorization or signature",
        });
      }

      const task = await aiAgentService.getTask(taskId);
      if (!task) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      if (task.status !== 'pending_payment') {
        return res.status(400).json({
          error: "Task is not awaiting payment",
          message: `Task status is ${task.status}`,
        });
      }

      // Process the payment
      const result = await aiAgentService.fundTask(taskId, authorization, signature);

      if (result.success) {
        return res.json({
          success: true,
          txHash: result.txHash,
          message: "Task funded successfully",
        });
      } else {
        return res.status(400).json({
          error: "Payment failed",
          message: result.error,
        });
      }
    } catch (error: any) {
      console.error("Error funding task:", error);
      return res.status(500).json({
        error: "Failed to fund task",
        message: error.message,
      });
    }
  });

  return router;
}

