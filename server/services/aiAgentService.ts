/**
 * AI Agent Service - Chatbot and Task Management
 */

import { Pool } from 'pg';
import { parseUnits, formatUnits, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import { encryptPrivateKey, decryptPrivateKey } from '../lib/encryption.js';
import { getMessages, detectLanguage, type Language } from '../lib/i18n.js';
import { getOpenAIService } from '../lib/openai.js';
import { publicClient, combinedClient } from '../config/blockchain.js';
import { network } from '../config/env.js';

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
  language?: Language;
}

// USDC ABI for EIP-3009
const usdcAbi = parseAbi([
  'function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function balanceOf(address account) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
]);

export class AIAgentService {
  private pool: Pool;
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private openAI = getOpenAIService();

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
   * Refresh agent wallet USDC balance from chain
   */
  async refreshWalletBalance(agentWalletId: string): Promise<{ usdcBalance: bigint; lastBalanceCheck: Date }> {
    // Get wallet address
    const result = await this.pool.query(
      'SELECT agent_address FROM ai_agent_wallets WHERE id = $1',
      [agentWalletId]
    );

    if (result.rows.length === 0) {
      throw new Error('Agent wallet not found');
    }

    const agentAddress = result.rows[0].agent_address;

    // Get USDC address based on network
    const usdcAddress = network === 'base-sepolia' 
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;

    // Read balance from chain
    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [agentAddress as `0x${string}`],
    });

    // Update database
    await this.pool.query(
      `UPDATE ai_agent_wallets 
       SET usdc_balance = $1, last_balance_check = NOW() 
       WHERE id = $2`,
      [balance.toString(), agentWalletId]
    );

    return {
      usdcBalance: balance,
      lastBalanceCheck: new Date(),
    };
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
   * Process user message and generate response (chatbot logic with OpenAI)
   */
  async processMessage(userAddress: string, userMessage: string): Promise<string> {
    const normalizedAddress = userAddress.toLowerCase();
    
    // Save user message
    await this.saveChatMessage(normalizedAddress, 'user', userMessage);

    // Get or create conversation context
    let context = this.conversationContexts.get(normalizedAddress) || { state: 'idle' };

    // Use OpenAI to analyze intent
    const intentResult = await this.openAI.analyzeIntent(userMessage, context.state);
    
    // Use detected language
    const language = context.language || intentResult.language;
    const msg = getMessages(language);

    let response: string;

    // State machine for conversation flow (enhanced with OpenAI intent)
    switch (context.state) {
      case 'idle':
        // Check intent from OpenAI
        if (intentResult.intent === 'mint') {
          context = { state: 'waiting_token', language };
          response = msg.askTokenAddress;
        } else if (intentResult.intent === 'balance') {
          const wallet = await this.getOrCreateAgentWallet(normalizedAddress);
          response = msg.walletInfo(wallet.agentAddress, formatUnits(wallet.usdcBalance, 6));
          context = { ...context, language };
        } else if (intentResult.intent === 'tasks') {
          const tasks = await this.getUserTasks(normalizedAddress, 5);
          if (tasks.length === 0) {
            response = msg.noTasks;
          } else {
            response = this.formatTasksList(tasks, language);
          }
          context = { ...context, language };
        } else {
          // Default welcome or help
          response = msg.welcome;
          context = { ...context, language };
        }
        break;

      case 'waiting_token':
        // Check if OpenAI extracted a token address
        const tokenAddress = intentResult.tokenAddress || this.extractTokenAddress(userMessage);
        if (tokenAddress) {
          context = { state: 'waiting_quantity', tokenAddress, language };
          response = msg.askQuantity(tokenAddress);
        } else {
          response = msg.invalidAddress;
          context = { ...context, language };
        }
        break;

      case 'waiting_quantity':
        // Check if OpenAI extracted a quantity
        const quantity = intentResult.quantity || this.extractQuantity(userMessage);
        if (quantity && quantity > 0 && quantity <= 1000) {
          // Create task
          const task = await this.createMintTask(
            normalizedAddress,
            context.tokenAddress!,
            quantity
          );
          
          context = { state: 'idle', language }; // Reset context but keep language
          response = await this.formatTaskCreatedMessage(task, language);
        } else {
          response = msg.invalidQuantity;
          context = { ...context, language };
        }
        break;

      default:
        context = { state: 'idle', language };
        response = msg.confused;
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

  private async formatTaskCreatedMessage(task: MintTask, language: Language = 'en'): Promise<string> {
    const wallet = await this.pool.query(
      'SELECT agent_address FROM ai_agent_wallets WHERE id = $1',
      [task.agentWalletId]
    );

    const agentAddress = wallet.rows[0].agent_address;
    const msg = getMessages(language);

    return msg.taskCreated(
      task.tokenAddress,
      task.quantity,
      formatUnits(task.pricePerMint, 6),
      formatUnits(task.totalCost, 6),
      agentAddress,
      task.id
    );
  }

  private formatTasksList(tasks: MintTask[], language: Language = 'en'): string {
    const msg = getMessages(language);
    const header = language === 'zh' ? "📋 你的 Mint 任务:\n\n" : "📋 Your Mint Tasks:\n\n";
    let message = header;

    for (const task of tasks) {
      const statusText = msg.taskStatus[task.status];

      message += `${statusText} ${task.tokenAddress.slice(0, 6)}...${task.tokenAddress.slice(-4)}\n`;
      message += `   ${task.mintsCompleted}/${task.quantity} `;
      message += language === 'zh' ? '完成' : 'completed';
      message += `\n\n`;
    }

    return message;
  }

  /**
   * Fund a task with EIP-3009 authorization
   */
  async fundTask(
    taskId: string,
    authorization: any,
    signature: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Get task
      const task = await this.getTask(taskId);
      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      if (task.status !== 'pending_payment') {
        return { success: false, error: `Task status is ${task.status}, expected pending_payment` };
      }

      // Get agent wallet
      const walletResult = await this.pool.query(
        'SELECT agent_address FROM ai_agent_wallets WHERE id = $1',
        [task.agentWalletId]
      );

      if (walletResult.rows.length === 0) {
        return { success: false, error: 'Agent wallet not found' };
      }

      const agentAddress = walletResult.rows[0].agent_address;

      // Validate authorization
      if (authorization.to.toLowerCase() !== agentAddress.toLowerCase()) {
        return { success: false, error: 'Authorization recipient does not match agent wallet' };
      }

      if (BigInt(authorization.value) < task.totalCost) {
        return { 
          success: false, 
          error: `Insufficient authorization amount: ${authorization.value}, required: ${task.totalCost.toString()}` 
        };
      }

      // Get USDC address based on network
      const usdcAddress = network === 'base-sepolia' 
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;

      // Parse signature
      const sig = signature.startsWith('0x') ? signature.slice(2) : signature;
      const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
      const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
      const v = parseInt(sig.slice(128, 130), 16);

      // Execute receiveWithAuthorization
      console.log(`💰 Funding task ${taskId}...`);
      console.log(`   From: ${authorization.from}`);
      console.log(`   To: ${agentAddress}`);
      console.log(`   Amount: ${formatUnits(BigInt(authorization.value), 6)} USDC`);

      // We need a wallet to execute this transaction
      // Use the server wallet to submit the authorization
      const hash = await combinedClient.writeContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: 'receiveWithAuthorization',
        args: [
          authorization.from as `0x${string}`,
          authorization.to as `0x${string}`,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce as `0x${string}`,
          v,
          r,
          s,
        ],
      });

      console.log(`   📤 Tx: ${hash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });

      console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

      // Update task status to funded
      await this.updateTaskStatus(taskId, 'funded', {
        fundingTxHash: hash,
      });

      // Update agent wallet balance
      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: 'balanceOf',
        args: [agentAddress as `0x${string}`],
      });

      await this.pool.query(
        `UPDATE ai_agent_wallets 
         SET usdc_balance = $1, last_balance_check = NOW() 
         WHERE id = $2`,
        [balance.toString(), task.agentWalletId]
      );

      console.log(`   💰 Agent wallet balance: ${formatUnits(balance, 6)} USDC`);

      return { success: true, txHash: hash };
    } catch (error: any) {
      console.error('❌ Error funding task:', error);
      return { success: false, error: error.message };
    }
  }
}

