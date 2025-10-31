import { Pool } from "pg";
import Redis from "ioredis";

export interface User {
  id: string;
  wallet_address: string;
  invitation_code: string;
  invited_by_code: string | null;
  invited_by_wallet: string | null;
  mint_count: number;
  points: number;
  created_at: Date;
  updated_at: Date;
}

export interface LeaderboardEntry {
  rank: number;
  wallet_address: string;
  invitation_code: string;
  points: number;
  mint_count: number;
}

export class UserService {
  constructor(private pool: Pool, private redis: Redis | null) {}

  /**
   * Get or create user by wallet address
   */
  async getOrCreateUser(walletAddress: string): Promise<User> {
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Try to get existing user
    const result = await this.pool.query<User>(
      `SELECT * FROM users WHERE LOWER(wallet_address) = $1`,
      [normalizedAddress]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Create new user
    const insertResult = await this.pool.query<User>(
      `INSERT INTO users (wallet_address, mint_count, points)
       VALUES ($1, 0, 0)
       RETURNING *`,
      [walletAddress]
    );

    return insertResult.rows[0];
  }

  /**
   * Get user by wallet address
   */
  async getUserByWallet(walletAddress: string): Promise<User | null> {
    const normalizedAddress = walletAddress.toLowerCase();
    
    const result = await this.pool.query<User>(
      `SELECT * FROM users WHERE LOWER(wallet_address) = $1`,
      [normalizedAddress]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Use invitation code (can only be used once per user)
   */
  async useInvitationCode(
    walletAddress: string,
    invitationCode: string
  ): Promise<{ success: boolean; message: string; user?: User }> {
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Start a transaction
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get the user
      const userResult = await client.query<User>(
        `SELECT * FROM users WHERE LOWER(wallet_address) = $1 FOR UPDATE`,
        [normalizedAddress]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          message: "User not found",
        };
      }

      const user = userResult.rows[0];

      // Check if user already used an invitation code
      if (user.invited_by_code) {
        await client.query('ROLLBACK');
        return {
          success: false,
          message: "You have already used an invitation code",
        };
      }

      // Validate invitation code exists and is not the user's own code
      const inviterResult = await client.query<User>(
        `SELECT * FROM users WHERE invitation_code = $1`,
        [invitationCode.toUpperCase()]
      );

      if (inviterResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          message: "Invalid invitation code",
        };
      }

      const inviter = inviterResult.rows[0];

      // Check if user is trying to use their own code
      if (inviter.wallet_address.toLowerCase() === normalizedAddress) {
        await client.query('ROLLBACK');
        return {
          success: false,
          message: "You cannot use your own invitation code",
        };
      }

      // Update user with invitation info
      const updateResult = await client.query<User>(
        `UPDATE users 
         SET invited_by_code = $1, 
             invited_by_wallet = $2,
             updated_at = NOW()
         WHERE LOWER(wallet_address) = $3
         RETURNING *`,
        [invitationCode.toUpperCase(), inviter.wallet_address, normalizedAddress]
      );

      await client.query('COMMIT');

      // Invalidate leaderboard cache since relationships changed
      if (this.redis) {
        await this.redis.del('leaderboard:global');
      }

      return {
        success: true,
        message: "Invitation code applied successfully",
        user: updateResult.rows[0],
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Increment user's mint count and points
   */
  async incrementMintCount(walletAddress: string): Promise<void> {
    const normalizedAddress = walletAddress.toLowerCase();
    
    await this.pool.query(
      `UPDATE users 
       SET mint_count = mint_count + 1,
           points = points + 1,
           updated_at = NOW()
       WHERE LOWER(wallet_address) = $1`,
      [normalizedAddress]
    );

    // Invalidate leaderboard cache
    if (this.redis) {
      await this.redis.del('leaderboard:global');
    }
  }

  /**
   * Get leaderboard (top users by points)
   */
  async getLeaderboard(limit: number = 100, offset: number = 0): Promise<LeaderboardEntry[]> {
    const cacheKey = `leaderboard:global:${limit}:${offset}`;
    
    // Try to get from cache
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error('Redis get error:', error);
      }
    }

    // Query from database
    const result = await this.pool.query<LeaderboardEntry>(
      `SELECT 
         ROW_NUMBER() OVER (ORDER BY points DESC, mint_count DESC, created_at ASC) as rank,
         wallet_address,
         invitation_code,
         points,
         mint_count
       FROM users
       ORDER BY points DESC, mint_count DESC, created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const leaderboard = result.rows;

    // Cache for 5 minutes
    if (this.redis && leaderboard.length > 0) {
      try {
        await this.redis.setex(cacheKey, 300, JSON.stringify(leaderboard));
      } catch (error) {
        console.error('Redis set error:', error);
      }
    }

    return leaderboard;
  }

  /**
   * Get user rank by wallet address
   */
  async getUserRank(walletAddress: string): Promise<number | null> {
    const normalizedAddress = walletAddress.toLowerCase();
    
    const result = await this.pool.query<{ rank: string }>(
      `SELECT rank FROM (
         SELECT 
           wallet_address,
           ROW_NUMBER() OVER (ORDER BY points DESC, mint_count DESC, created_at ASC) as rank
         FROM users
       ) ranked
       WHERE LOWER(wallet_address) = $1`,
      [normalizedAddress]
    );

    return result.rows.length > 0 ? parseInt(result.rows[0].rank) : null;
  }

  /**
   * Get user's invited users (referrals)
   */
  async getUserReferrals(walletAddress: string): Promise<User[]> {
    const normalizedAddress = walletAddress.toLowerCase();
    
    const result = await this.pool.query<User>(
      `SELECT * FROM users 
       WHERE LOWER(invited_by_wallet) = $1
       ORDER BY created_at DESC`,
      [normalizedAddress]
    );

    return result.rows;
  }

  /**
   * Get leaderboard statistics
   */
  async getLeaderboardStats(): Promise<{
    total_users: number;
    total_points: number;
    total_mints: number;
  }> {
    const cacheKey = 'leaderboard:stats';
    
    // Try to get from cache
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error('Redis get error:', error);
      }
    }

    const result = await this.pool.query<{
      total_users: string;
      total_points: string;
      total_mints: string;
    }>(
      `SELECT 
         COUNT(*) as total_users,
         COALESCE(SUM(points), 0) as total_points,
         COALESCE(SUM(mint_count), 0) as total_mints
       FROM users`
    );

    const stats = {
      total_users: parseInt(result.rows[0].total_users),
      total_points: parseInt(result.rows[0].total_points),
      total_mints: parseInt(result.rows[0].total_mints),
    };

    // Cache for 5 minutes
    if (this.redis) {
      try {
        await this.redis.setex(cacheKey, 300, JSON.stringify(stats));
      } catch (error) {
        console.error('Redis set error:', error);
      }
    }

    return stats;
  }
}

