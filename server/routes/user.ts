import { Router } from "express";
import { isAddress } from "viem";
import { UserService } from "../services/userService.js";

export function createUserRouter(userService: UserService): Router {
  const router = Router();

  /**
   * GET /api/user/:address - Get or create user
   */
  router.get("/user/:address", async (req, res) => {
    try {
      const { address } = req.params;

      if (!isAddress(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const user = await userService.getOrCreateUser(address);
      
      return res.json({
        success: true,
        user,
      });
    } catch (error: any) {
      console.error("Error fetching user:", error);
      return res.status(500).json({
        error: "Failed to fetch user",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/user/:address/invite - Use invitation code
   */
  router.post("/user/:address/invite", async (req, res) => {
    try {
      const { address } = req.params;
      const { invitationCode } = req.body;

      if (!isAddress(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      if (!invitationCode || typeof invitationCode !== 'string') {
        return res.status(400).json({ error: "Invitation code is required" });
      }

      await userService.getOrCreateUser(address);

      const result = await userService.useInvitationCode(address, invitationCode);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.message,
        });
      }

      return res.json(result);
    } catch (error: any) {
      console.error("Error using invitation code:", error);
      return res.status(500).json({
        error: "Failed to use invitation code",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/user/:address/rank - Get user rank
   */
  router.get("/user/:address/rank", async (req, res) => {
    try {
      const { address } = req.params;

      if (!isAddress(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const rank = await userService.getUserRank(address);

      if (rank === null) {
        return res.status(404).json({ error: "User not found in rankings" });
      }

      return res.json({
        success: true,
        rank,
      });
    } catch (error: any) {
      console.error("Error fetching user rank:", error);
      return res.status(500).json({
        error: "Failed to fetch user rank",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/user/:address/referrals - Get user's referrals
   */
  router.get("/user/:address/referrals", async (req, res) => {
    try {
      const { address } = req.params;

      if (!isAddress(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }

      const referrals = await userService.getUserReferrals(address);

      return res.json({
        success: true,
        count: referrals.length,
        referrals,
      });
    } catch (error: any) {
      console.error("Error fetching referrals:", error);
      return res.status(500).json({
        error: "Failed to fetch referrals",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/leaderboard - Get leaderboard
   */
  router.get("/leaderboard", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;

      const leaderboard = await userService.getLeaderboard(limit, offset);
      const stats = await userService.getLeaderboardStats();

      return res.json({
        success: true,
        stats,
        leaderboard,
        pagination: {
          limit,
          offset,
          total: stats.total_users,
        },
      });
    } catch (error: any) {
      console.error("Error fetching leaderboard:", error);
      return res.status(500).json({
        error: "Failed to fetch leaderboard",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/leaderboard/stats - Get leaderboard stats only
   */
  router.get("/leaderboard/stats", async (req, res) => {
    try {
      const stats = await userService.getLeaderboardStats();

      return res.json({
        success: true,
        stats,
      });
    } catch (error: any) {
      console.error("Error fetching leaderboard stats:", error);
      return res.status(500).json({
        error: "Failed to fetch leaderboard stats",
        message: error.message,
      });
    }
  });

  return router;
}

