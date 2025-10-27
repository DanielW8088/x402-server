# x402 Token Mint - 快速开始

## 5 分钟快速启动

### 1. 安装依赖

```bash
# 服务器
cd server
npm install

# 客户端
cd ../client
npm install
```

### 2. 配置环境变量

#### 服务器 (server/.env)

**测试网配置 (推荐先测试):**

```bash
# 网络 - 测试网
NETWORK=base-sepolia

# 服务器私钥 - 需要有 MINTER_ROLE 和 ETH for gas
SERVER_PRIVATE_KEY=0x...

# Token 合约地址
TOKEN_CONTRACT_ADDRESS=0x...

# 接收支付的地址
PAY_TO_ADDRESS=0x...

# 要求的 USDC 金额
REQUIRED_PAYMENT_USDC=1

# 端口
PORT=4021

# CDP API Keys (测试网不需要)
# CDP_API_KEY_ID=
# CDP_API_KEY_SECRET=
```

**主网配置 (生产环境):**

```bash
# 网络 - 主网
NETWORK=base

# 服务器私钥
SERVER_PRIVATE_KEY=0x...

# Token 合约地址 (主网地址)
TOKEN_CONTRACT_ADDRESS=0x...

# 接收支付的地址 (主网地址)
PAY_TO_ADDRESS=0x...

# 要求的 USDC 金额
REQUIRED_PAYMENT_USDC=1

# 端口
PORT=4021

# CDP API Keys (主网必需！)
CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
```

**获取 CDP API Keys:**
1. 访问 https://portal.cdp.coinbase.com/
2. 创建账号和项目
3. 生成 API keys
4. 详细步骤查看 [CDP_SETUP_GUIDE.md](./CDP_SETUP_GUIDE.md)

#### 客户端 (client/.env)

```bash
# 客户端私钥 - 用于签名支付凭证
PRIVATE_KEY=0x...

# 服务器 URL
SERVER_URL=http://localhost:4021

# 网络
NETWORK=base-sepolia
```

### 3. 启动服务器

```bash
cd server

# 使用 x402 版本
tsx index-x402.ts

# 或者使用传统版本（对比）
# tsx index.ts
```

期望输出 (测试网):
```
🚀 x402 Token Mint Server running on port 4021
Network: base-sepolia
Token Contract: 0x...
Pay To Address: 0x...
Server Address: 0x...
Required Payment: 1 USDC
Protocol: x402 (HTTP 402 Payment Required)
Facilitator: Public (https://x402.org/facilitator)
  ℹ️  Testnet mode - no CDP API keys required

Endpoints:
  POST /mint - Mint tokens (requires x402 payment) 💳
  GET /health - Health check
  GET /info - Get mint info

Usage (x402):
  1. Request POST /mint
  2. Server responds with 402 Payment Required + instructions
  3. Client completes payment via x402 protocol
  4. Client retries POST /mint with X-PAYMENT header
  5. ✨ Server verifies payment and mints tokens!
```

期望输出 (主网):
```
🚀 x402 Token Mint Server running on port 4021
Network: base
Token Contract: 0x...
Pay To Address: 0x...
Server Address: 0x...
Required Payment: 1 USDC
Protocol: x402 (HTTP 402 Payment Required)
Facilitator: Coinbase CDP
  ✓ CDP API Key ID: organiza...
  ℹ️  Mainnet mode - using Coinbase Developer Platform
  📊 Your endpoint will be listed in x402 Bazaar
  
Endpoints:
  POST /mint - Mint tokens (requires x402 payment) 💳
  GET /health - Health check
  GET /info - Get mint info

Usage (x402):
  1. Request POST /mint
  2. Server responds with 402 Payment Required + instructions
  3. Client completes payment via x402 protocol
  4. Client retries POST /mint with X-PAYMENT header
  5. ✨ Server verifies payment and mints tokens!
```

### 4. 测试健康检查

```bash
curl http://localhost:4021/health
```

期望输出:
```json
{
  "status": "ok",
  "network": "base-sepolia",
  "tokenContract": "0x...",
  "payTo": "0x...",
  "protocol": "x402"
}
```

### 5. 运行客户端

**重要提示：** x402 协议主要为浏览器钱包和 AI agents 设计。对于 CLI 测试，推荐使用传统客户端。

```bash
cd client

# 推荐：使用传统客户端测试 x402 服务器
npm start

# 注意：index-x402.ts 是实验性的，目前不完整
# 完整的 x402 客户端需要实现复杂的支付协议
```

**为什么使用传统客户端？**
- ✅ 已经实现完整的 USDC 支付流程
- ✅ 支持 gasless (EIP-3009)
- ✅ 可以正常测试 x402 服务器
- ✅ x402 middleware 不影响传统客户端

期望输出:
```
🚀 x402 Token Mint Client
==========================

Network: base-sepolia
Your address: 0x...
Server: http://localhost:4021
Protocol: x402 (HTTP 402 Payment Required)

📋 Step 1: Getting server info...
   Protocol: x402
   Token contract: 0x...
   Pay to address: 0x...
   Tokens per payment: 10000
   Remaining supply: 990000
   Price: 1 USDC

🎨 Step 2: Minting tokens (via x402 payment)...
📡 Requesting POST http://localhost:4021/mint...
💳 Payment required (HTTP 402)
   Price: $1
   Network: base-sepolia
   Recipient: 0x...

🔏 Signing payment...
   ✅ Payment signed

📡 Retrying request with payment proof...
   ✅ Payment accepted!

✨ SUCCESS! Tokens minted!
============================
Payer: 0x...
Amount: 10000 tokens
Mint TX: 0x...
Block: 12345
Timestamp: 2025-10-27T...

💡 Payment was verified via x402 protocol!
   - No need to send USDC separately
   - Payment verification handled by Facilitator
   - Cryptographic proof of payment

🎉 All done!
```

## 工作原理

### x402 支付流程

```
1. 客户端: POST /mint
   └─> 服务器: 402 Payment Required + 支付指令

2. 客户端: 签名支付凭证 (EIP-712, 离链)
   └─> 无需发送链上交易
   └─> 无需支付 gas

3. 客户端: POST /mint + X-PAYMENT header
   └─> 服务器: 验证支付 (通过 Facilitator)
   └─> Facilitator: 验证签名和支付金额
   └─> 服务器: 调用合约 mint
   └─> 返回: mint 交易哈希

4. 完成! 🎉
```

### 与传统模式对比

| 特性 | 传统模式 | x402 模式 |
|------|---------|-----------|
| 客户端发送链上交易 | ✅ 需要 | ❌ 不需要 |
| 客户端支付 gas | ✅ 需要 | ❌ 不需要 |
| 服务器验证链上交易 | ✅ 需要 | ❌ Facilitator 处理 |
| 交易队列 | ✅ 需要 | ❌ 不需要 |
| 交易监控 | ✅ 需要 | ❌ 简化 |
| Nonce 管理 | ✅ 复杂 | ✅ 简单 |
| 代码复杂度 | 866 行 | ~300 行 |

## 测试不同场景

### 场景 1: 成功 mint

```bash
npm run start:x402
```

### 场景 2: 查看 402 响应

```bash
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{"payer": "0xYourAddress"}'
```

期望: `402 Payment Required` + 支付指令 JSON

### 场景 3: 查看合约信息

```bash
curl http://localhost:4021/info
```

### 场景 4: 多次 mint

```bash
# 在 client 目录
for i in {1..3}; do
  echo "Mint #$i"
  npm run start:x402
  sleep 2
done
```

## 常见问题

### 问题 1: 找不到模块 'x402-express'

**解决:**
```bash
cd server
npm install x402-express @coinbase/x402
```

### 问题 2: 找不到模块 '@coinbase/x402'

**解决:**
```bash
cd client
npm install @coinbase/x402
```

### 问题 3: 服务器启动失败

**检查:**
1. 环境变量是否配置正确
2. 服务器私钥是否有效
3. 合约地址是否正确
4. 端口是否被占用

### 问题 4: 客户端支付失败

**检查:**
1. 客户端私钥是否有效
2. 服务器是否在运行
3. 网络是否正确
4. 查看详细错误信息

### 问题 5: Mint 交易失败

**检查:**
1. 服务器地址是否有 MINTER_ROLE
2. 服务器地址是否有 ETH for gas
3. 合约是否还有剩余供应量
4. 查看 Basescan 上的交易详情

## 下一步

1. **对比两种模式**: 运行传统版本和 x402 版本，对比差异
2. **查看代码**: 对比 `index.ts` vs `index-x402.ts`
3. **阅读迁移指南**: 查看 `X402_MIGRATION_GUIDE.md`
4. **部署到生产**: 使用 Base 主网和 Coinbase Facilitator
5. **集成前端**: 将 x402 客户端逻辑集成到 React/Next.js

## 文件说明

### 服务器

- `index.ts` - 传统版本 (使用私钥验证链上 USDC 交易)
- `index-x402.ts` - x402 版本 (使用 Facilitator 验证支付) ⭐
- `txQueue.ts` - 交易队列 (仅传统版本需要)
- `txMonitor.ts` - 交易监控 (仅传统版本需要)
- `nonceManager.ts` - Nonce 管理 (仅传统版本需要)

### 客户端

- `index.ts` - 传统版本 (发送链上 USDC 交易)
- `index-x402.ts` - x402 版本 (签名支付凭证) ⭐

### 文档

- `X402_QUICKSTART.md` - 快速开始 (本文档)
- `X402_MIGRATION_GUIDE.md` - 详细迁移指南
- `README.md` - 项目总体说明

## 命令速查

```bash
# 服务器
cd server
npm install
tsx index-x402.ts

# 客户端
cd client
npm install
npm run start:x402

# 测试
curl http://localhost:4021/health
curl http://localhost:4021/info
curl -X POST http://localhost:4021/mint -H "Content-Type: application/json" -d '{"payer": "0x..."}'
```

## 获取帮助

- [x402 Documentation](https://x402.gitbook.io/x402/)
- [x402 Discord](https://discord.gg/x402)
- [GitHub Issues](https://github.com/coinbase/x402/issues)

## 许可证

MIT

