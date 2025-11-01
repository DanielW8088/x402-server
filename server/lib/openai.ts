/**
 * OpenAI Service - Natural Language Understanding for AI Agent
 */

import OpenAI from 'openai';
import type { Language } from './i18n.js';

export interface IntentResult {
  intent: 'mint' | 'balance' | 'tasks' | 'help' | 'unknown';
  confidence: number;
  tokenAddress?: string;
  quantity?: number;
  language: Language;
}

export class OpenAIService {
  private openai: OpenAI | null = null;
  private enabled: boolean = false;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.enabled = true;
      console.log('✅ OpenAI service initialized');
    } else {
      console.warn('⚠️  OPENAI_API_KEY not set. Using fallback intent detection.');
    }
  }

  /**
   * Analyze user message and extract intent
   */
  async analyzeIntent(
    userMessage: string,
    conversationState: 'idle' | 'waiting_token' | 'waiting_quantity'
  ): Promise<IntentResult> {
    // If OpenAI is not enabled, use fallback
    if (!this.enabled || !this.openai) {
      return this.fallbackIntentDetection(userMessage, conversationState);
    }

    try {
      const systemPrompt = this.getSystemPrompt(conversationState);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.fallbackIntentDetection(userMessage, conversationState);
      }

      return this.parseOpenAIResponse(content, userMessage);
    } catch (error: any) {
      console.error('OpenAI API error:', error.message);
      return this.fallbackIntentDetection(userMessage, conversationState);
    }
  }

  /**
   * Get system prompt based on conversation state
   */
  private getSystemPrompt(state: string): string {
    const basePrompt = `You are an AI assistant for a token minting service. Analyze the user's message and respond with a JSON object containing:
{
  "intent": "mint" | "balance" | "tasks" | "help" | "unknown",
  "confidence": 0.0-1.0,
  "tokenAddress": "0x..." (if found),
  "quantity": number (if found),
  "language": "en" | "zh"
}

Intent definitions:
- "mint": User wants to mint tokens
- "balance": User wants to check their wallet balance
- "tasks": User wants to see their mint tasks
- "help": User needs help or greeting
- "unknown": Cannot determine intent

Language detection:
- "zh": Message contains Chinese characters
- "en": Otherwise`;

    if (state === 'waiting_token') {
      return basePrompt + '\n\nContext: User is currently being asked for a token contract address. Look for Ethereum addresses (0x...).';
    }

    if (state === 'waiting_quantity') {
      return basePrompt + '\n\nContext: User is currently being asked how many tokens to mint. Look for numbers.';
    }

    return basePrompt;
  }

  /**
   * Parse OpenAI response
   */
  private parseOpenAIResponse(content: string, originalMessage: string): IntentResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.fallbackIntentDetection(originalMessage, 'idle');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        intent: parsed.intent || 'unknown',
        confidence: parsed.confidence || 0.5,
        tokenAddress: parsed.tokenAddress,
        quantity: parsed.quantity,
        language: parsed.language || this.detectLanguage(originalMessage),
      };
    } catch (error) {
      console.error('Failed to parse OpenAI response:', error);
      return this.fallbackIntentDetection(originalMessage, 'idle');
    }
  }

  /**
   * Fallback intent detection using regex (original method)
   */
  private fallbackIntentDetection(
    message: string,
    state: 'idle' | 'waiting_token' | 'waiting_quantity'
  ): IntentResult {
    const lowerMessage = message.toLowerCase();
    let intent: IntentResult['intent'] = 'unknown';
    let tokenAddress: string | undefined;
    let quantity: number | undefined;

    // Detect intent
    if (state === 'waiting_token') {
      // Looking for token address
      const addressMatch = message.match(/0x[a-fA-F0-9]{40}/);
      if (addressMatch) {
        tokenAddress = addressMatch[0].toLowerCase();
        intent = 'mint'; // Continue mint flow
      }
    } else if (state === 'waiting_quantity') {
      // Looking for quantity
      const quantityMatch = message.match(/\d+/);
      if (quantityMatch) {
        quantity = parseInt(quantityMatch[0]);
        intent = 'mint'; // Continue mint flow
      }
    } else {
      // Idle state - detect general intent with more natural expressions
      if (/mint|购买|买|部署|铸造|搞|弄|来|发|批量|代币|币|token/i.test(message)) {
        intent = 'mint';
      } else if (/余额|balance|钱包|wallet|地址|address|多少钱|有多少/i.test(message)) {
        intent = 'balance';
      } else if (/任务|task|进度|status|订单|order|看看|查|怎么样了/i.test(message)) {
        intent = 'tasks';
      } else if (/help|帮助|hi|hello|你好|嘿|在吗|干嘛|什么|介绍/i.test(message)) {
        intent = 'help';
      }
    }

    return {
      intent,
      confidence: 0.7,
      tokenAddress,
      quantity,
      language: this.detectLanguage(message),
    };
  }

  /**
   * Simple language detection
   */
  private detectLanguage(message: string): Language {
    const hasChinese = /[\u4e00-\u9fa5]/.test(message);
    return hasChinese ? 'zh' : 'en';
  }

  /**
   * Check if OpenAI is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
let openAIServiceInstance: OpenAIService | null = null;

export function getOpenAIService(): OpenAIService {
  if (!openAIServiceInstance) {
    openAIServiceInstance = new OpenAIService();
  }
  return openAIServiceInstance;
}

