# x402 客户端快速测试

## 🚀 一键测试

### 1. 启动服务器

```bash
cd server
npx tsx index-x402.ts
```

### 2. 运行 x402 客户端

```bash
cd client
npm run start:x402
```

就这么简单！✅

## 📊 期望看到

### 服务器输出

```
🚀 x402 Token Mint Server running on port 4021
Network: base-sepolia
Facilitator: Public (https://x402.org/facilitator)

Endpoints:
  POST /mint - Mint tokens (requires x402 payment) 💳
  POST /mint-direct - Mint tokens (traditional USDC payment) 💰

🔍 Verifying custom x402 payment...
✅ Custom payment verified for 0x...
   Payment TX: 0x...
🎨 Minting to 0x...
✅ Mint transaction sent: 0x...
✅ Transaction confirmed in block 12345
```

### 客户端输出

```
🚀 x402 Token Mint Client (Working Version)
============================================

📋 Getting server info...
   Protocol: x402
   Price: 1 USDC

🎨 Minting tokens via x402 protocol...
==================================================

📡 Step 1: Requesting POST /mint...
   💳 Payment required (HTTP 402)

📋 Payment instructions:
   Pay to: 0x...
   Amount: 1 USDC

💰 Step 2: Executing payment...
💸 Sending USDC payment...
   Your balance: 19 USDC
   Transaction hash: 0x...
   ✅ USDC transfer confirmed

🔏 Step 3: Creating payment proof...
   ✅ Payment proof created

📡 Step 4: Retrying request with payment proof...
   ✅ Payment accepted!

==================================================
✨ SUCCESS! Tokens minted via x402!
====================================
Payer: 0x...
Amount: 10000 tokens
Mint TX: 0x...

💡 How it worked:
   1. Client requested /mint
   2. Server responded with 402 Payment Required
   3. Client sent USDC payment
   4. Client retried with X-PAYMENT header
   5. Server verified payment and minted tokens!

🎉 x402 protocol completed successfully!
```

## 🔍 验证成功

看到以下输出说明成功：

- ✅ `Payment required (HTTP 402)` - 收到 402 响应
- ✅ `USDC transfer confirmed` - USDC 支付成功
- ✅ `Payment proof created` - 创建支付凭证
- ✅ `Payment accepted!` - 服务器接受支付
- ✅ `SUCCESS! Tokens minted via x402!` - Mint 成功

## 🐛 常见问题

### 问题 1: `Cannot find module 'index-x402-working'`

**解决:**
```bash
cd client
npm install  # 确保依赖已安装
npm run start:x402
```

### 问题 2: `Insufficient USDC balance`

**解决:**
- 确保你的地址有足够的 USDC
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- 可以在 Uniswap 上 swap 或从水龙头获取

### 问题 3: 服务器 `Payment verification failed`

**检查:**
1. 服务器 `.env` 是否有 `USDC_CONTRACT_ADDRESS`
2. USDC 地址是否正确
3. 网络是否匹配（base-sepolia）

### 问题 4: `402 Payment Required` 但没有支付指令

**检查:**
服务器是否正确启动，应该看到：
```
Endpoints:
  POST /mint - Mint tokens (requires x402 payment) 💳
```

## 📋 完整环境配置

### 服务器 (server/.env)

```bash
NETWORK=base-sepolia
SERVER_PRIVATE_KEY=0x...
TOKEN_CONTRACT_ADDRESS=0x...
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
PAY_TO_ADDRESS=0x...
REQUIRED_PAYMENT_USDC=1
```

### 客户端 (client/.env)

```bash
PRIVATE_KEY=0x...
SERVER_URL=http://localhost:4021
NETWORK=base-sepolia
# x402 客户端不需要其他配置
```

## 🔄 对比测试

### 传统客户端 vs x402 客户端

**传统客户端:**
```bash
cd client
npm start
```

**x402 客户端:**
```bash
cd client
npm run start:x402
```

两者都能正常工作，但 x402 客户端展示了完整的 x402 协议流程。

## 🎯 x402 协议流程图

```
┌─────────┐                 ┌─────────┐
│ 客户端   │                 │ 服务器   │
└────┬────┘                 └────┬────┘
     │                           │
     │ 1. POST /mint             │
     ├──────────────────────────>│
     │                           │
     │ 2. 402 + 支付指令          │
     │<──────────────────────────┤
     │                           │
     │ 3. 发送 USDC              │
     ├─────────> Blockchain      │
     │                           │
     │ 4. POST /mint             │
     │    + X-PAYMENT            │
     ├──────────────────────────>│
     │                           │
     │                      验证支付
     │                           │
     │                      执行 mint
     │                           │
     │ 5. 返回结果               │
     │<──────────────────────────┤
     │                           │
```

## 📚 更多信息

- [X402_CLIENT_USAGE.md](./X402_CLIENT_USAGE.md) - 详细使用指南
- [X402_WITH_DIRECT_ENDPOINT.md](./X402_WITH_DIRECT_ENDPOINT.md) - 配置指南
- [X402_QUICKSTART.md](./X402_QUICKSTART.md) - 快速开始

## 🎉 成功了？

恭喜！你刚刚完成了一次完整的 x402 协议交互！

**你学到了:**
- ✅ HTTP 402 Payment Required 状态码
- ✅ x402 支付指令格式
- ✅ X-PAYMENT header 使用
- ✅ 支付验证流程
- ✅ 完整的 x402 协议流程

**下一步:**
- 尝试在浏览器中实现
- 集成钱包（MetaMask）
- 部署到主网
- 列入 x402 Bazaar

---

**问题？** 查看详细文档或服务器日志获取更多信息。

