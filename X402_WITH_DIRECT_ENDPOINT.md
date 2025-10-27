# x402 服务器 + 传统客户端配置指南

## 概述

现在 x402 服务器支持两个 endpoint：

- **`/mint`** - 使用 x402 协议（需要 X-PAYMENT header）
- **`/mint-direct`** - 传统模式（接受 paymentTxHash）✅

这样你可以同时支持：
1. x402 协议（浏览器钱包、AI agents）
2. 传统客户端（CLI 测试）

## 快速开始

### 1. 配置服务器

**server/.env:**
```bash
NETWORK=base-sepolia
SERVER_PRIVATE_KEY=0x...
TOKEN_CONTRACT_ADDRESS=0x...
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
PAY_TO_ADDRESS=0x...
REQUIRED_PAYMENT_USDC=1

# 测试网不需要（主网需要）
# CDP_API_KEY_ID=
# CDP_API_KEY_SECRET=
```

**启动服务器:**
```bash
cd server
npm install
npx tsx index-x402.ts
```

**期望看到:**
```
🚀 x402 Token Mint Server running on port 4021
Network: base-sepolia
Facilitator: Public (https://x402.org/facilitator)
  ℹ️  Testnet mode - no CDP API keys required

Endpoints:
  POST /mint - Mint tokens (requires x402 payment) 💳
  POST /mint-direct - Mint tokens (traditional USDC payment) 💰
  GET /health - Health check
  GET /info - Get mint info
```

### 2. 配置客户端

**client/.env:**
```bash
PRIVATE_KEY=0x...
SERVER_URL=http://localhost:4021
NETWORK=base-sepolia
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
PAYMENT_AMOUNT_USDC=1

# 重要：使用 /mint-direct endpoint
USE_DIRECT_ENDPOINT=true

# 不使用 gasless
USE_GASLESS=false
```

**运行客户端:**
```bash
cd client
npm start
```

**期望输出:**
```
🚀 Token Mint Client
====================

Network: base-sepolia
Your address: 0x...
Server: http://localhost:4021
Mode: 💰 Traditional

📋 Step 1: Getting server info...
   Token contract: 0x...
   Pay to address: 0x...

💰 Step 2: Sending 1 USDC payment...
   Your USDC balance: 19 USDC
   Transaction hash: 0x...
   ✅ USDC transfer confirmed

🎨 Step 3: Minting tokens...
   Endpoint: /mint-direct  ← 使用直接endpoint
   
✨ SUCCESS! Tokens minted!
```

## 工作原理

### 架构

```
传统客户端 → /mint-direct → 验证USDC → Mint ✅

浏览器钱包 → /mint → x402 middleware → Facilitator → Mint ✅
```

### /mint vs /mint-direct

| 特性 | /mint | /mint-direct |
|------|-------|--------------|
| 协议 | x402 | 传统 |
| 需要 | X-PAYMENT header | paymentTxHash |
| 用于 | 浏览器、AI agents | CLI 客户端 |
| Facilitator | 是 | 否 |
| 支付验证 | x402 协议 | 链上交易 |

## 环境变量说明

### 服务器端

```bash
# 必需
SERVER_PRIVATE_KEY=0x...      # 调用 mint 函数
TOKEN_CONTRACT_ADDRESS=0x...  # Token 合约
USDC_CONTRACT_ADDRESS=0x...   # USDC 合约（验证支付）
PAY_TO_ADDRESS=0x...          # 接收地址
NETWORK=base-sepolia          # 网络

# 可选（主网需要）
CDP_API_KEY_ID=...            # CDP API Key ID
CDP_API_KEY_SECRET=...        # CDP API Key Secret
```

### 客户端

```bash
# 必需
PRIVATE_KEY=0x...                  # 客户端私钥
SERVER_URL=http://localhost:4021   # 服务器URL
NETWORK=base-sepolia               # 网络
USDC_CONTRACT_ADDRESS=0x...        # USDC 合约

# 重要
USE_DIRECT_ENDPOINT=true           # 使用 /mint-direct
USE_GASLESS=false                  # 不使用 gasless
```

## 测试步骤

### 1. 启动服务器

```bash
cd server
npx tsx index-x402.ts
```

验证输出包含：
- `POST /mint-direct - Mint tokens (traditional USDC payment) 💰`

### 2. 配置客户端

确保 `client/.env` 包含：
```bash
USE_DIRECT_ENDPOINT=true
USE_GASLESS=false
```

### 3. 运行客户端

```bash
cd client
npm start
```

### 4. 验证成功

看到输出：
```
🎫 Requesting token mint from server...
   Endpoint: /mint-direct
   
✨ SUCCESS! Tokens minted!
```

## 常见问题

### Q: 客户端还是收到 402 错误

**A:** 检查 `USE_DIRECT_ENDPOINT=true` 是否设置。

### Q: 服务器没有 /mint-direct endpoint

**A:** 确保使用更新后的 `index-x402.ts`，重新启动服务器。

### Q: USDC 支付验证失败

**A:** 确保 `USDC_CONTRACT_ADDRESS` 在服务器 `.env` 中正确配置。

### Q: 想同时测试两种模式

**A:** 可以！
- 浏览器访问 `/mint` (x402)
- CLI 客户端访问 `/mint-direct` (传统)

## 优势

### 同时支持两种模式

- ✅ x402 协议（`/mint`）- 生产环境
- ✅ 传统模式（`/mint-direct`）- 开发测试

### 无缝迁移

从传统服务器迁移到 x402：
1. 使用 x402 服务器
2. `/mint-direct` 保持兼容
3. 逐步采用 x402 协议

### 灵活测试

- 开发：使用 `/mint-direct`
- 生产：使用 `/mint` (x402)
- 都可以同时运行！

## 生产部署

### 主网配置

**服务器 (.env):**
```bash
NETWORK=base
USDC_CONTRACT_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# 主网必需
CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
```

### 安全建议

1. `/mint-direct` 仍然需要验证 USDC 支付
2. 生产环境推荐使用 `/mint` (x402 协议)
3. `/mint-direct` 主要用于兼容性和测试

## 命令速查

```bash
# 服务器
cd server
npx tsx index-x402.ts

# 客户端 (确保 USE_DIRECT_ENDPOINT=true)
cd client
npm start

# 测试 /mint-direct
curl -X POST http://localhost:4021/mint-direct \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTxHash": "0x...",
    "payer": "0x..."
  }'

# 测试 /mint (x402)
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{"payer": "0x..."}'
# 返回: 402 Payment Required
```

## 总结

✅ **完成的功能:**
- x402 服务器支持两个 endpoint
- `/mint` - x402 协议（浏览器、AI agents）
- `/mint-direct` - 传统模式（CLI 测试）
- 传统客户端可以正常工作
- 配置简单，只需设置 `USE_DIRECT_ENDPOINT=true`

✅ **使用场景:**
- 开发测试：`/mint-direct`
- 生产环境：`/mint` (x402)
- 都可以同时支持！

🚀 **现在可以:**
1. 启动 x402 服务器
2. 配置客户端使用 `/mint-direct`
3. 正常测试 mint 功能
4. 同时支持 x402 协议！

