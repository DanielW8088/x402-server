# 直接支付 USDC 指南

## 概述

这个方法让你直接转账 USDC 到 token 合约，自己支付 gas 费。与 x402 协议相比，这是传统的链上支付方式。

## 🆚 对比

| 特性 | x402 协议 (`npm start`) | 直接支付 (`npm run start:direct`) |
|------|------------------------|----------------------------------|
| 需要 USDC | ❌ 不需要 | ✅ 需要 |
| 需要 gas (ETH) | ❌ 不需要 | ✅ 需要 |
| 速度 | 快 (~1秒) | 慢 (等待确认 ~2-5秒) |
| 成本 | $0 | Gas 费 (~$0.01-0.05) |
| 链上交易 | 0 笔 | 1 笔 (USDC 转账) |
| 签名方式 | EIP-712 (离线) | ECDSA (链上) |
| 适用场景 | 快速测试、无成本 mint | 需要链上记录、传统方式 |

## 📋 前置要求

### 1. USDC 余额
```bash
# Base Sepolia (测试网)
# 从 Coinbase 或其他水龙头获取测试 USDC

# Base Mainnet (主网)
# 需要真实的 USDC
```

### 2. Gas 费 (ETH)
```bash
# 需要少量 ETH 支付 gas
# Base Sepolia: 从水龙头获取
# Base Mainnet: 需要真实 ETH
```

## 🚀 使用方法

### 基础使用

```bash
# 1. 配置环境变量（与 x402 相同）
cp env.x402.example .env

# 2. 编辑 .env
# PRIVATE_KEY=0x...        ← 需要有 USDC 和 ETH
# TOKEN_ADDRESS=0x...
# NETWORK=base-sepolia
# SERVER_URL=http://localhost:4021

# 3. 运行直接支付版本
npm run start:direct
```

### 完整流程

```bash
# 检查余额
npm run start:direct

# 输出示例:
# 💵 Step 2: Checking USDC balance...
#    Your USDC balance: 10.5 USDC
#    ✅ Sufficient balance for payment: 1.0 USDC
```

## 📊 工作流程

```
1. 获取 Token 信息
   ↓
2. 检查 USDC 余额
   ↓  
3. 转账 USDC 到 Token 合约
   ↓ (等待链上确认)
4. 用 txHash 请求 Server Mint
   ↓
5. Server 验证转账并 Mint
   ↓
6. 返回结果
```

## 💡 关键代码

### USDC 转账

```typescript
// Transfer USDC directly
const hash = await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: usdcAbi,
  functionName: "transfer",
  args: [tokenAddress, paymentAmount],
});

// Wait for confirmation
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

### 请求 Mint

```typescript
// Send txHash to server
const response = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
  payer: account.address,
  paymentTxHash: hash,
});
```

## ⚠️ 注意事项

### 1. 需要真实资产

**Base Sepolia (测试网):**
- 测试 USDC: https://faucet.circle.com/
- 测试 ETH: https://www.coinbase.com/faucets/base-sepolia-faucet

**Base Mainnet (主网):**
- 需要真实 USDC
- 需要真实 ETH 作为 gas

### 2. Gas 费

```typescript
// Gas 费示例 (Base Sepolia)
Transfer USDC: ~0.0001 ETH (~$0.01)

// Gas 费示例 (Base Mainnet)  
Transfer USDC: ~0.00005 ETH (~$0.15)
```

### 3. 交易时间

- 等待确认: 2-5 秒
- 总时间: ~5-10 秒（包括 server 处理）

### 4. 失败处理

如果转账成功但 mint 失败：
- USDC 已经转到合约
- 联系管理员处理
- 或等待 server 重试

## 🔧 故障排查

### 错误 1: Insufficient USDC

```
❌ Insufficient USDC balance
   Required: 1.0 USDC
   You have: 0.5 USDC
```

**解决**: 获取更多 USDC

### 错误 2: Insufficient gas

```
❌ insufficient funds for gas
```

**解决**: 
- 获取更多 ETH
- Base Sepolia: 使用水龙头
- Base Mainnet: 购买 ETH

### 错误 3: Transaction reverted

```
❌ Transfer failed
```

**可能原因**:
- USDC 余额不足
- Gas 设置过低
- 合约地址错误
- 网络拥堵

### 错误 4: Server mint 失败

```
❌ Server error (400): Payment already processed
```

**解决**: 
- 检查是否已经 mint 过
- 查看 `/api/queue/:queueId` 状态

## 📝 完整示例

### 示例输出

```bash
$ npm run start:direct

💰 x402 Token Mint Client (Direct USDC Payment)
================================================

Network: base-sepolia
Your address: 0xf3d156FCc8cDC62cD4b3b5687ED0e929a7c9a4F2
Server: http://localhost:4021
Token: 0xABC...
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
Payment method: Direct transfer (you pay gas)

📋 Step 1: Getting token info...
   Token: Test Token (TEST)
   Price: 1 USDC
   Tokens per mint: 1000

💵 Step 2: Checking USDC balance...
   Your USDC balance: 10.5 USDC
   ✅ Sufficient balance for payment: 1.0 USDC

💸 Step 3: Sending USDC payment...
   Amount: 1.0 USDC
   ⚠️  You will pay gas fees for this transaction

💸 Transferring 1.0 USDC...
   From: 0xf3d...
   To: 0xABC...
   TX Hash: 0xdef...
   Waiting for confirmation...
   ✅ Transfer confirmed in block 12345

🎨 Step 4: Requesting mint...
   Payment TX: 0xdef...

==================================================
✨ SUCCESS!
====================================
Payment TX: 0xdef...
Payer: 0xf3d...
Amount: 1000 tokens
Mint TX: 0x123...
Block: 12346

💡 How it worked:
   1. You transferred USDC to token contract
   2. You paid gas fees for the transfer
   3. Server detected the payment
   4. Server minted tokens to your address!

🎉 All done!
```

## 🔗 相关资源

- USDC 合约 (Base Sepolia): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- USDC 合约 (Base Mainnet): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Base Sepolia 浏览器: https://sepolia.basescan.org/
- Base Mainnet 浏览器: https://basescan.org/
- Circle USDC 水龙头: https://faucet.circle.com/
- Base 水龙头: https://www.coinbase.com/faucets/base-sepolia-faucet

## 💬 何时使用

**使用 x402 (`npm start`) 当:**
- ✅ 测试和开发
- ✅ 不想花费 gas
- ✅ 没有 USDC
- ✅ 需要快速 mint

**使用直接支付 (`npm run start:direct`) 当:**
- ✅ 需要链上支付记录
- ✅ 已有 USDC 和 ETH
- ✅ 传统支付流程
- ✅ 不依赖 x402 facilitator

## 🆘 获取帮助

1. 查看 [README.md](./README.md) 基础配置
2. 查看 [USAGE.md](./USAGE.md) API 说明
3. 检查 USDC 和 ETH 余额
4. 查看区块链浏览器确认交易状态

