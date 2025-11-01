/**
 * AI Agent Service - Chatbot and Task Management
 */

import { Pool } from 'pg';
import { parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import { encryptPrivateKey, decryptPrivateKey } from '../lib/encryption.js';

export interface AgentWallet {
  id: string;
  userAddress: string;
  agentAddress: string;
  usdcBalance: bigint;
  lastBalanceCheck?: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  metadata?: any;
  createdAt: Date;
}

export interface MintTask {
  id: string;
  userAddress: string;
  agentWalletId: string;
  tokenAddress: string;
  quantity: number;
  pricePerMint: bigint;
  totalCost: bigint;
  status: 'pending_payment' | 'funded' | 'processing' | 'completed' | 'failed' | 'cancelled';
  mintsCompleted: number;
  mintsFailed: number;
  fundingTxHash?: string;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

interface ConversationContext {
  state: 'idle' | 'waiting_token' | 'waiting_quantity';
  tokenAddress?: string;
  quantity?: number;
}

export class AIAgentService {
  private pool: Pool;
  private conversationContexts: Map<string, ConversationContext> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get or create agent wallet for user
   */
  async getOrCreateAgentWallet(userAddress: string): Promise<AgentWallet> {
    const normalizedAddress = userAddress.toLowerCase();

    // Try to get existing wallet
    const result = await this.pool.query(
      'SELECT * FROM ai_agent_wallets WHERE user_address = $1',
      [normalizedAddress]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        id: row.id,
        userAddress: row.user_address,
        agentAddress: row.agent_address,
        usdcBalance: BigInt(row.usdc_balance || 0),
        lastBalanceCheck: row.last_balance_check,
      };
    }

    // Create new agent wallet
    const privateKey = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const encryptedKey = encryptPrivateKey(privateKey);

    const insertResult = await this.pool.query(
      `INSERT INTO ai_agent_wallets (user_address, agent_address, encrypted_private_key, usdc_balance)
       VALUES ($1, $2, $3, 0)
       RETURNING *`,
      [normalizedAddress, account.address.toLowerCase(), encryptedKey]
    );

    const row = insertResult.rows[0];
    return {
      id: row.id,
      userAddress: row.user_address,
      agentAddress: row.agent_address,
      usdcBalance: BigInt(0),
    };
  }

  /**
   * Get agent wallet private key (decrypted)
   */
  async getAgentPrivateKey(agentWalletId: string): Promise<`0x${string}`> {
    const result = await this.pool.query(
      'SELECT encrypted_private_key FROM ai_agent_wallets WHERE id = $1',
      [agentWalletId]
    );

    if (result.rows.length === 0) {
      throw new Error('Agent wallet not found');
    }

    return decryptPrivateKey(result.rows[0].encrypted_private_key);
  }

  /**
   * Save chat message
   */
  async saveChatMessage(
    userAddress: string,
    role: 'user' | 'assistant',
    message: string,
    metadata?: any
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_agent_chats (user_address, role, message, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userAddress.toLowerCase(), role, message, metadata ? JSON.stringify(metadata) : null]
    );
  }

  /**
   * Get chat history
   */
  async getChatHistory(userAddress: string, limit: number = 50): Promise<ChatMessage[]> {
    const result = await this.pool.query(
      `SELECT * FROM ai_agent_chats 
       WHERE user_address = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userAddress.toLowerCase(), limit]
    );

    return result.rows.reverse().map(row => ({
      id: row.id,
      role: row.role,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  /**
   * Process user message and generate response (chatbot logic)
   */
  async processMessage(userAddress: string, userMessage: string): Promise<string> {
    const normalizedAddress = userAddress.toLowerCase();
    
    // Save user message
    await this.saveChatMessage(normalizedAddress, 'user', userMessage);

    // Get or create conversation context
    let context = this.conversationContexts.get(normalizedAddress) || { state: 'idle' };

    let response: string;

    // State machine for conversation flow
    switch (context.state) {
      case 'idle':
        // Check if user wants to mint
        if (this.detectMintIntent(userMessage)) {
          context = { state: 'waiting_token' };
          response = "好的！请告诉我你想 mint 的 token 合约地址 (例如: 0x...)";
        } else if (this.detectBalanceQuery(userMessage)) {
          const wallet = await this.getOrCreateAgentWallet(normalizedAddress);
          response = `你的 AI Agent 钱包地址是: ${wallet.agentAddress}\n\n当前余额: ${formatUnits(wallet.usdcBalance, 6)} USDC`;
        } else if (this.detectTasksQuery(userMessage)) {
          const tasks = await this.getUserTasks(normalizedAddress, 5);
          if (tasks.length === 0) {
            response = "你还没有创建任何 mint 任务。\n\n想要开始吗？告诉我 '我想 mint 个币'";
          } else {
            response = this.formatTasksList(tasks);
          }
        } else {
          response = "你好！我是你的 AI Mint Agent 🤖\n\n" +
            "我可以帮你：\n" +
            "• 自动 mint tokens\n" +
            "• 查看余额和任务\n" +
            "• 管理你的 agent 钱包\n\n" +
            "想要 mint 币吗？告诉我 '我想 mint 个币'";
        }
        break;

      case 'waiting_token':
        // Extract token address
        const tokenAddress = this.extractTokenAddress(userMessage);
        if (tokenAddress) {
          context = { state: 'waiting_quantity', tokenAddress };
          response = `好的！Token 地址: ${tokenAddress}\n\n你想 mint 多少次呢？(1-1000)`;
        } else {
          response = "抱歉，我没有识别到有效的合约地址。\n\n请输入一个以 0x 开头的地址，例如: 0x1234...";
        }
        break;

      case 'waiting_quantity':
        // Extract quantity
        const quantity = this.extractQuantity(userMessage);
        if (quantity && quantity > 0 && quantity <= 1000) {
          // Create task
          const task = await this.createMintTask(
            normalizedAddress,
            context.tokenAddress!,
            quantity
          );
          
          context = { state: 'idle' }; // Reset context
          response = await this.formatTaskCreatedMessage(task);
        } else {
          response = "请输入一个有效的数量 (1-1000)，例如: 100";
        }
        break;

      default:
        context = { state: 'idle' };
        response = "对不起，我有点迷糊了。我们重新开始吧！\n\n想要 mint 币吗？";
    }

    // Update context
    this.conversationContexts.set(normalizedAddress, context);

    // Save assistant response
    await this.saveChatMessage(normalizedAddress, 'assistant', response);

    return response;
  }

  /**
   * Create a mint task
   */
  async createMintTask(
    userAddress: string,
    tokenAddress: string,
    quantity: number
  ): Promise<MintTask> {
    const normalizedUser = userAddress.toLowerCase();
    const normalizedToken = tokenAddress.toLowerCase();

    // Get agent wallet
    const wallet = await this.getOrCreateAgentWallet(normalizedUser);

    // Get token price from database
    const tokenResult = await this.pool.query(
      'SELECT price FROM deployed_tokens WHERE address = $1',
      [normalizedToken]
    );

    let pricePerMint: bigint;
    if (tokenResult.rows.length > 0) {
      const priceStr = tokenResult.rows[0].price;
      const priceMatch = priceStr.match(/[\d.]+/);
      if (priceMatch) {
        pricePerMint = parseUnits(priceMatch[0], 6);
      } else {
        pricePerMint = parseUnits('1', 6); // Default 1 USDC
      }
    } else {
      pricePerMint = parseUnits('1', 6); // Default 1 USDC
    }

    const totalCost = pricePerMint * BigInt(quantity);

    // Insert task
    const result = await this.pool.query(
      `INSERT INTO ai_agent_tasks 
       (user_address, agent_wallet_id, token_address, quantity, price_per_mint, total_cost, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment')
       RETURNING *`,
      [normalizedUser, wallet.id, normalizedToken, quantity, pricePerMint.toString(), totalCost.toString()]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      userAddress: row.user_address,
      agentWalletId: row.agent_wallet_id,
      tokenAddress: row.token_address,
      quantity: row.quantity,
      pricePerMint: BigInt(row.price_per_mint),
      totalCost: BigInt(row.total_cost),
      status: row.status,
      mintsCompleted: row.mints_completed,
      mintsFailed: row.mints_failed,
      createdAt: row.created_at,
    };
  }

  /**
   * Get user's tasks
   */
  async getUserTasks(userAddress: string, limit: number = 10): Promise<MintTask[]> {
    const result = await this.pool.query(
      `SELECT * FROM ai_agent_tasks 
       WHERE user_address = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userAddress.toLowerCase(), limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      userAddress: row.user_address,
      agentWalletId: row.agent_wallet_id,
      tokenAddress: row.token_address,
      quantity: row.quantity,
      pricePerMint: BigInt(row.price_per_mint),
      totalCost: BigInt(row.total_cost),
      status: row.status,
      mintsCompleted: row.mints_completed,
      mintsFailed: row.mints_failed,
      fundingTxHash: row.funding_tx_hash,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<MintTask | null> {
    const result = await this.pool.query(
      'SELECT * FROM ai_agent_tasks WHERE id = $1',
      [taskId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      userAddress: row.user_address,
      agentWalletId: row.agent_wallet_id,
      tokenAddress: row.token_address,
      quantity: row.quantity,
      pricePerMint: BigInt(row.price_per_mint),
      totalCost: BigInt(row.total_cost),
      status: row.status,
      mintsCompleted: row.mints_completed,
      mintsFailed: row.mints_failed,
      fundingTxHash: row.funding_tx_hash,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: MintTask['status'],
    updates?: Partial<MintTask>
  ): Promise<void> {
    const fields: string[] = ['status = $2'];
    const values: any[] = [taskId, status];
    let paramIndex = 3;

    if (updates?.mintsCompleted !== undefined) {
      fields.push(`mints_completed = $${paramIndex++}`);
      values.push(updates.mintsCompleted);
    }
    if (updates?.mintsFailed !== undefined) {
      fields.push(`mints_failed = $${paramIndex++}`);
      values.push(updates.mintsFailed);
    }
    if (updates?.fundingTxHash) {
      fields.push(`funding_tx_hash = $${paramIndex++}`);
      values.push(updates.fundingTxHash);
    }
    if (updates?.errorMessage !== undefined) {
      fields.push(`error_message = $${paramIndex++}`);
      values.push(updates.errorMessage);
    }
    if (status === 'processing') {
      // Only set started_at if it's not already set
      fields.push(`started_at = COALESCE(started_at, NOW())`);
    }
    if (status === 'completed' || status === 'failed') {
      fields.push(`completed_at = NOW()`);
    }

    await this.pool.query(
      `UPDATE ai_agent_tasks SET ${fields.join(', ')} WHERE id = $1`,
      values
    );
  }

  // Helper methods for intent detection
  private detectMintIntent(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return /mint|购买|买|部署/i.test(message);
  }

  private detectBalanceQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return /余额|balance|钱包|wallet|地址|address/i.test(message);
  }

  private detectTasksQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return /任务|task|进度|status|订单|order/i.test(message);
  }

  private extractTokenAddress(message: string): string | null {
    const match = message.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0].toLowerCase() : null;
  }

  private extractQuantity(message: string): number | null {
    const match = message.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  private async formatTaskCreatedMessage(task: MintTask): Promise<string> {
    const wallet = await this.pool.query(
      'SELECT agent_address FROM ai_agent_wallets WHERE id = $1',
      [task.agentWalletId]
    );

    const agentAddress = wallet.rows[0].agent_address;

    return `✅ 任务创建成功！\n\n` +
      `📋 任务详情:\n` +
      `• Token: ${task.tokenAddress}\n` +
      `• 数量: ${task.quantity} 次\n` +
      `• 单价: ${formatUnits(task.pricePerMint, 6)} USDC\n` +
      `• 总计: ${formatUnits(task.totalCost, 6)} USDC\n\n` +
      `💰 请转账 ${formatUnits(task.totalCost, 6)} USDC 到:\n` +
      `${agentAddress}\n\n` +
      `收到转账后，我会自动开始 mint！\n\n` +
      `任务ID: ${task.id.slice(0, 8)}...`;
  }

  private formatTasksList(tasks: MintTask[]): string {
    let message = "📋 你的 Mint 任务:\n\n";

    for (const task of tasks) {
      const statusEmoji = {
        pending_payment: '⏳',
        funded: '💰',
        processing: '🔄',
        completed: '✅',
        failed: '❌',
        cancelled: '🚫',
      }[task.status];

      message += `${statusEmoji} ${task.tokenAddress.slice(0, 6)}...${task.tokenAddress.slice(-4)}\n`;
      message += `   ${task.mintsCompleted}/${task.quantity} 完成`;
      if (task.status === 'pending_payment') {
        message += ` - 等待付款`;
      }
      message += `\n\n`;
    }

    return message;
  }
}

