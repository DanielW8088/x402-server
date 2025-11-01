/**
 * i18n - Internationalization support for AI Agent
 */

export type Language = 'en' | 'zh';

interface Messages {
  welcome: string;
  askTokenAddress: string;
  askQuantity: (tokenAddress: string) => string;
  invalidAddress: string;
  invalidQuantity: string;
  walletInfo: (address: string, balance: string) => string;
  noTasks: string;
  taskCreated: (
    tokenAddress: string,
    quantity: number,
    pricePerMint: string,
    totalCost: string,
    agentAddress: string,
    taskId: string
  ) => string;
  confused: string;
  taskStatus: {
    pending_payment: string;
    funded: string;
    processing: string;
    completed: string;
    failed: string;
    cancelled: string;
  };
}

const en: Messages = {
  welcome: 
    "Hello! I'm your AI Mint Agent 🤖\n\n" +
    "I can help you:\n" +
    "• Auto-mint tokens\n" +
    "• Check balance and tasks\n" +
    "• Manage your agent wallet\n\n" +
    "Want to mint? Say 'I want to mint tokens'",
  
  askTokenAddress: 
    "Great! Please tell me the token contract address you want to mint (e.g., 0x...)",
  
  askQuantity: (tokenAddress: string) =>
    `Perfect! Token address: ${tokenAddress}\n\n` +
    `How many times do you want to mint? (1-1000)`,
  
  invalidAddress:
    "Sorry, I didn't recognize a valid contract address.\n\n" +
    "Please enter an address starting with 0x, like: 0x1234...",
  
  invalidQuantity:
    "Please enter a valid quantity (1-1000), for example: 100",
  
  walletInfo: (address: string, balance: string) =>
    `Your AI Agent wallet address is: ${address}\n\n` +
    `Current balance: ${balance} USDC`,
  
  noTasks:
    "You haven't created any mint tasks yet.\n\n" +
    "Want to start? Tell me 'I want to mint tokens'",
  
  taskCreated: (
    tokenAddress: string,
    quantity: number,
    pricePerMint: string,
    totalCost: string,
    agentAddress: string,
    taskId: string
  ) =>
    `✅ Task created successfully!\n\n` +
    `📋 Task Details:\n` +
    `• Token: ${tokenAddress}\n` +
    `• Quantity: ${quantity} mints\n` +
    `• Price per mint: ${pricePerMint} USDC\n` +
    `• Total: ${totalCost} USDC\n\n` +
    `💳 Click the "Authorize Payment" button below to sign and approve the payment.\n` +
    `No gas fees required - just sign the authorization!\n\n` +
    `Task ID: ${taskId.slice(0, 8)}...`,
  
  confused:
    "Sorry, I'm a bit confused. Let's start over!\n\n" +
    "Want to mint tokens?",
  
  taskStatus: {
    pending_payment: '⏳ Pending Payment',
    funded: '💰 Funded',
    processing: '🔄 Processing',
    completed: '✅ Completed',
    failed: '❌ Failed',
    cancelled: '🚫 Cancelled',
  },
};

const zh: Messages = {
  welcome:
    "嘿！我是你的 AI Mint 助手 🤖\n\n" +
    "我能帮你做这些：\n" +
    "• 自动批量铸造代币\n" +
    "• 查余额和任务进度\n" +
    "• 管理你的专属钱包\n\n" +
    "想铸造代币的话，直接告诉我就行～",
  
  askTokenAddress:
    "收到！麻烦把代币的合约地址发给我 (比如: 0x...)",
  
  askQuantity: (tokenAddress: string) =>
    `好的！代币地址是: ${tokenAddress}\n\n` +
    `想铸造多少个？(1-1000 之间)`,
  
  invalidAddress:
    "嗯...这个地址好像不太对\n\n" +
    "能再发一遍吗？应该是 0x 开头的，像这样: 0x1234...",
  
  invalidQuantity:
    "数量得在 1-1000 之间哦，比如: 100",
  
  walletInfo: (address: string, balance: string) =>
    `这是你的专属钱包地址:\n${address}\n\n` +
    `当前余额: ${balance} USDC`,
  
  noTasks:
    "你还没有创建过任务呢\n\n" +
    "想开始的话直接说就行，比如「帮我铸造代币」",
  
  taskCreated: (
    tokenAddress: string,
    quantity: number,
    pricePerMint: string,
    totalCost: string,
    agentAddress: string,
    taskId: string
  ) =>
    `✅ 搞定！任务已创建\n\n` +
    `📋 任务信息:\n` +
    `• 代币: ${tokenAddress}\n` +
    `• 数量: ${quantity} 个\n` +
    `• 单价: ${pricePerMint} USDC\n` +
    `• 总共: ${totalCost} USDC\n\n` +
    `💳 点击下方"授权支付"按钮签名确认即可\n` +
    `无需支付 gas，只需签个名！\n\n` +
    `任务编号: ${taskId.slice(0, 8)}...`,
  
  confused:
    "不好意思，我没太理解...\n\n" +
    "咱们重新来？想做什么直接说就好～",
  
  taskStatus: {
    pending_payment: '⏳ 等待付款',
    funded: '💰 已到账',
    processing: '🔄 铸造中',
    completed: '✅ 已完成',
    failed: '❌ 失败了',
    cancelled: '🚫 已取消',
  },
};

const messages: Record<Language, Messages> = {
  en,
  zh,
};

/**
 * Get messages for a specific language
 */
export function getMessages(lang: Language = 'en'): Messages {
  return messages[lang] || messages.en;
}

/**
 * Detect language from user message
 * Simple heuristic: if contains Chinese characters, use Chinese
 */
export function detectLanguage(message: string): Language {
  const hasChinese = /[\u4e00-\u9fa5]/.test(message);
  return hasChinese ? 'zh' : 'en';
}

