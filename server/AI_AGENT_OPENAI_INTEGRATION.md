# 🤖 OpenAI Integration for Natural Language Understanding

## 更新日期
2025-11-01

## 概述

集成 OpenAI GPT-4o-mini 模型来改进 AI Agent 的意图识别能力，让对话更自然、更智能。

## 核心改进

### Before (正则表达式)
```typescript
if (/mint|购买|买|部署/i.test(message)) {
  intent = 'mint';
}
```

**问题：**
- ❌ 只能识别固定关键词
- ❌ 无法理解上下文
- ❌ 无法提取结构化信息
- ❌ 不够自然

### After (OpenAI)
```typescript
const intentResult = await openai.analyzeIntent(message, conversationState);
// {
//   intent: 'mint',
//   confidence: 0.95,
//   tokenAddress: '0xABC...',
//   quantity: 100,
//   language: 'en'
// }
```

**优势：**
- ✅ 理解自然语言
- ✅ 提取结构化信息（地址、数量等）
- ✅ 多语言支持
- ✅ 有后备方案（无 API key 时自动降级）

## 新增文件

### `server/lib/openai.ts`

OpenAI 服务模块，包含：

1. **意图分析**: `analyzeIntent(message, state)`
2. **智能提取**: 自动提取 token 地址、数量等
3. **后备机制**: API 失败时自动使用正则表达式
4. **语言检测**: 自动识别英文/中文

## 支持的意图

```typescript
type Intent = 
  | 'mint'      // 用户想 mint tokens
  | 'balance'   // 查询余额
  | 'tasks'     // 查看任务
  | 'help'      // 需要帮助
  | 'unknown'   // 无法确定
```

## 使用示例

### 1. 自然语言理解

**Before (只能识别固定关键词):**
```
User: mint
Agent: ✅ Understood

User: I'd like to purchase some tokens
Agent: ❌ Not understood
```

**After (理解自然语言):**
```
User: I'd like to purchase some tokens
Agent: ✅ Great! Please tell me the token contract address...

User: Could you help me mint 100 tokens at 0xABC...?
Agent: ✅ Perfect! [提取到数量100和地址0xABC...]
```

### 2. 智能信息提取

**Before (需要分步):**
```
User: mint
Agent: Please provide token address
User: 0xABC...
Agent: How many?
User: 100
Agent: ✅ Task created
```

**After (可以一次性提供):**
```
User: mint 100 tokens at 0xABC...
Agent: ✅ Task created! [自动提取地址和数量]
```

### 3. 多种表达方式

OpenAI 可以理解各种说法：

**英文：**
- "I want to mint tokens"
- "Help me purchase some coins"
- "Let's buy 100 mints"
- "Deploy tokens for me"
- "Can you mint this token?"

**中文：**
- "我想 mint 个币"
- "帮我买点代币"
- "购买 100 个"
- "部署一下"
- "可以 mint 吗？"

## 配置

### 1. 获取 OpenAI API Key

访问：https://platform.openai.com/api-keys

### 2. 添加到环境变量

```bash
# server/.env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 3. 重启服务

```bash
npm run dev
# 或
pm2 restart token-server
```

## 后备机制

如果没有设置 `OPENAI_API_KEY`，系统会自动降级到正则表达式：

```bash
# 启动时的日志
⚠️  OPENAI_API_KEY not set. Using fallback intent detection.
```

**这意味着：**
- ✅ 不设置 API key 也能正常工作
- ✅ 只是意图识别能力会受限
- ✅ 零成本运行（不调用 API）

## 成本估算

使用 GPT-4o-mini 模型：

- **价格**: $0.150 / 1M input tokens, $0.600 / 1M output tokens
- **每次对话**: ~100-200 tokens
- **成本**: ~$0.00002-0.00004 per message

**示例：**
- 1000 条消息 ≈ $0.02-0.04
- 10000 条消息 ≈ $0.20-0.40

非常便宜！

## 技术细节

### 1. System Prompt

根据对话状态动态调整提示词：

```typescript
// Idle state
"Analyze the user's message and extract intent..."

// Waiting for token address
"User is currently being asked for a token contract address. 
Look for Ethereum addresses (0x...)."

// Waiting for quantity
"User is currently being asked how many tokens to mint. 
Look for numbers."
```

### 2. Response Format

要求 OpenAI 返回 JSON：

```json
{
  "intent": "mint",
  "confidence": 0.95,
  "tokenAddress": "0xABC...",
  "quantity": 100,
  "language": "en"
}
```

### 3. Error Handling

```typescript
try {
  const result = await openai.analyzeIntent(message);
  return result;
} catch (error) {
  console.error('OpenAI API error:', error);
  // Automatically fallback to regex
  return fallbackIntentDetection(message);
}
```

## 实际对话示例

### 示例 1: 一次性完成

```
User: 帮我在 0x1234567890abcdef1234567890abcdef12345678 上 mint 50 个
Agent: ✅ 任务创建成功！
       Token: 0x1234...5678
       数量: 50 次
       ...
```

**分析：**
- OpenAI 识别意图: `mint`
- 提取地址: `0x1234...5678`
- 提取数量: `50`
- 直接跳到任务创建

### 示例 2: 自然对话

```
User: Hi, can you help me?
Agent: Hello! I'm your AI Mint Agent 🤖
       I can help you:
       • Auto-mint tokens
       • Check balance and tasks
       • Manage your agent wallet
       Want to mint? Say 'I want to mint tokens'

User: Yes, I'd like to purchase some tokens
Agent: Great! Please tell me the token contract address...

User: The address is 0xABC...
Agent: Perfect! Token address: 0xABC...
       How many times do you want to mint? (1-1000)
```

### 示例 3: 查询余额

```
User: What's my balance?
Agent: Your AI Agent wallet address is: 0xDEF...
       Current balance: 10.50 USDC

User: Show me my tasks
Agent: 📋 Your Mint Tasks:
       ✅ 0x123...abc
          100/100 completed
       ...
```

## 监控和调试

### 1. 查看 OpenAI 是否启用

```typescript
if (openAI.isEnabled()) {
  console.log('✅ OpenAI enabled');
} else {
  console.log('⚠️  Using fallback detection');
}
```

### 2. 查看意图分析结果

日志中会显示：

```
Intent: mint
Confidence: 0.95
Token Address: 0xABC...
Quantity: 100
Language: en
```

### 3. API 错误

如果 API 调用失败：

```
OpenAI API error: Rate limit exceeded
⚠️  Falling back to regex detection
```

## 性能优化

### 1. 模型选择

使用 `gpt-4o-mini` 而不是 `gpt-4`:
- ✅ 15x cheaper
- ✅ 2x faster
- ✅ 同样智能（对简单任务）

### 2. Temperature 设置

```typescript
temperature: 0.3  // 低温度 = 更确定的答案
```

### 3. Token 限制

```typescript
max_tokens: 200  // 足够返回 JSON，不浪费
```

## 扩展功能

### 1. 情感分析

```typescript
{
  "intent": "mint",
  "sentiment": "excited",  // 用户情绪
  "urgency": "high"        // 紧急程度
}
```

### 2. 多步骤规划

```typescript
{
  "intent": "mint",
  "plan": [
    "Get token address",
    "Ask quantity",
    "Create task"
  ]
}
```

### 3. 上下文记忆

```typescript
// 记住之前的对话
const context = await openai.analyzeWithHistory(message, chatHistory);
```

## 局限性

### 1. API 依赖

需要网络连接和 API key。

**解决方案：** 后备机制确保离线也能用。

### 2. 延迟

OpenAI API 调用通常需要 500ms-2s。

**解决方案：** 使用 gpt-4o-mini 减少延迟。

### 3. 成本

虽然便宜，但大量使用仍有成本。

**解决方案：** 
- 缓存常见查询
- 设置每用户速率限制
- 监控 API 使用量

## 测试

### 1. 无 API key 测试

```bash
# 不设置 OPENAI_API_KEY
npm run dev

# 应该看到
⚠️  OPENAI_API_KEY not set. Using fallback intent detection.
```

### 2. 有 API key 测试

```bash
export OPENAI_API_KEY=sk-...
npm run dev

# 应该看到
✅ OpenAI service initialized
```

### 3. 功能测试

```bash
# Test API
curl -X POST http://localhost:4021/api/ai-agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x123...",
    "message": "I want to mint 100 tokens at 0xABC..."
  }'
```

## 安全考虑

### 1. API Key 保护

- ❌ 不要提交到 Git
- ✅ 使用环境变量
- ✅ 生产环境使用密钥管理服务

### 2. 速率限制

```typescript
// 建议添加
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20 // 每个用户每分钟最多 20 次
});
```

### 3. 输入验证

OpenAI 响应仍需验证：

```typescript
if (tokenAddress && !isValidAddress(tokenAddress)) {
  // 不信任 AI 提取的地址，再次验证
  tokenAddress = undefined;
}
```

## 升级路径

### Phase 1: 当前 ✅

- 基础意图识别
- 信息提取
- 后备机制

### Phase 2: 未来 🚀

- 上下文记忆（记住整个对话）
- 情感分析
- 主动建议

### Phase 3: AgentKit 🔮

- 完整的 AgentKit 集成
- 多 chain 支持
- 更多 DeFi 操作

## 总结

### 改进前后对比

| 功能 | Before | After |
|------|--------|-------|
| 意图识别 | 固定关键词 | 自然语言理解 |
| 信息提取 | 手动分步 | 自动提取 |
| 语言支持 | 有限 | 任意表达 |
| 用户体验 | 机械 | 自然流畅 |
| 后备方案 | ❌ | ✅ |

### 关键文件

- `server/lib/openai.ts` - OpenAI 服务
- `server/services/aiAgentService.ts` - 集成 OpenAI
- `server/env.multi-token.example` - 配置示例

### 下一步

1. 设置 `OPENAI_API_KEY`
2. 重启服务
3. 测试自然语言对话
4. 监控 API 使用量
5. 根据需要调整提示词

---

**更新完成**: 2025-11-01  
**OpenAI Model**: gpt-4o-mini  
**Cost per message**: ~$0.00002-0.00004  
**Fallback**: ✅ Regex-based detection  
**Status**: ✅ Ready for production

