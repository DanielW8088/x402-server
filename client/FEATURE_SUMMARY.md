# 新功能：直接支付 USDC

## 🎉 功能概述

现在 client 支持两种 mint 方式：

### 方式 1: x402 协议 (原有)
- 命令: `npm start`
- 无需 USDC，无需 gas
- 使用 EIP-712 签名
- 适合测试和开发

### 方式 2: 直接支付 USDC (新增) ✨
- 命令: `npm run start:direct`
- 直接转账 USDC 到 token 合约
- 自己支付 gas 费
- 传统链上支付方式

## 📂 新增文件

```
client/
├── index-direct-payment.ts          ← 新增：直接支付实现
└── DIRECT_PAYMENT_GUIDE.md          ← 新增：使用指南
```

## 🚀 快速使用

### 方式 1: x402 (无成本)

```bash
npm start
```

### 方式 2: 直接支付 (需要 USDC + gas)

```bash
# 确保钱包有 USDC 和 ETH
npm run start:direct
```

## 🔧 技术实现

### 核心代码

```typescript
// 1. 转账 USDC 到 token 合约
const hash = await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: usdcAbi,
  functionName: "transfer",
  args: [tokenAddress, paymentAmount],
});

// 2. 等待确认
const receipt = await publicClient.waitForTransactionReceipt({ hash });

// 3. 用 txHash 请求 mint
const response = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
  payer: account.address,
  paymentTxHash: hash,
});
```

## 📊 对比表

| 特性 | x402 | 直接支付 |
|------|------|----------|
| 命令 | `npm start` | `npm run start:direct` |
| USDC | ❌ 不需要 | ✅ 需要 |
| Gas (ETH) | ❌ 不需要 | ✅ 需要 |
| 速度 | ~1秒 | ~5秒 |
| 成本 | $0 | ~$0.01-0.05 |
| 链上交易 | 0笔 | 1笔 |
| 签名方式 | EIP-712 (离线) | ECDSA (链上) |

## 💡 使用场景

### 使用 x402
- ✅ 快速测试
- ✅ 开发环境
- ✅ 无需真实资产
- ✅ 零成本 mint

### 使用直接支付
- ✅ 生产环境
- ✅ 需要链上支付记录
- ✅ 传统支付流程
- ✅ 不依赖 x402 facilitator

## 📋 前置要求

### x402 方式
```bash
✅ 私钥 (任何地址都可以，不需要余额)
✅ TOKEN_ADDRESS
```

### 直接支付方式
```bash
✅ 私钥 (需要有余额的地址)
✅ TOKEN_ADDRESS
✅ USDC 余额 (≥ token 价格)
✅ ETH 余额 (支付 gas)
```

## 🔍 完整流程对比

### x402 流程
```
1. 发送 mint 请求
   ↓
2. 收到 402 响应
   ↓
3. 自动签名 (EIP-712)
   ↓
4. 重试请求 + X-PAYMENT header
   ↓
5. Server 验证并 mint
   ↓
6. 完成 (~1秒)
```

### 直接支付流程
```
1. 检查 USDC 余额
   ↓
2. 转账 USDC 到 token 合约
   ↓ (等待确认 ~2-3秒)
3. 获得 txHash
   ↓
4. 请求 Server mint
   ↓
5. Server 验证转账
   ↓
6. Server mint tokens
   ↓
7. 完成 (~5秒)
```

## 📝 示例输出

### x402 方式
```bash
$ npm start

🚀 x402 Token Mint Client (Coinbase x402-fetch)
================================================

Network: base-sepolia
Your address: 0xf3d...
Server: http://localhost:4021
Token: 0xABC...
Protocol: x402 (Coinbase Official)

📋 Step 1: Getting token info...
   Token: Test Token (TEST)
   Price: 1 USDC

🎨 Step 2: Minting tokens via x402...
   Sending mint request...
   Response status: 200

✨ SUCCESS! Tokens minted via x402!
====================================
Payer: 0xf3d...
Amount: 1000 tokens
Mint TX: 0x123...

🎉 All done!
```

### 直接支付方式
```bash
$ npm run start:direct

💰 x402 Token Mint Client (Direct USDC Payment)
================================================

Network: base-sepolia
Your address: 0xf3d...
Server: http://localhost:4021
Token: 0xABC...
Payment method: Direct transfer (you pay gas)

📋 Step 1: Getting token info...
   Token: Test Token (TEST)
   Price: 1 USDC

💵 Step 2: Checking USDC balance...
   Your USDC balance: 10.5 USDC
   ✅ Sufficient balance for payment: 1.0 USDC

💸 Step 3: Sending USDC payment...
   Amount: 1.0 USDC
   ⚠️  You will pay gas fees for this transaction

💸 Transferring 1.0 USDC...
   TX Hash: 0xdef...
   ✅ Transfer confirmed in block 12345

🎨 Step 4: Requesting mint...
   Payment TX: 0xdef...

✨ SUCCESS!
====================================
Payment TX: 0xdef...
Mint TX: 0x123...

🎉 All done!
```

## 🔗 相关文档

- [DIRECT_PAYMENT_GUIDE.md](./DIRECT_PAYMENT_GUIDE.md) - 详细使用指南
- [README.md](./README.md) - 完整文档
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - 快速参考

## 💬 常见问题

### Q: 我应该用哪个？

**测试/开发**: 用 x402 (`npm start`)，零成本！  
**生产环境**: 根据需求选择，两者都支持

### Q: 直接支付需要多少 gas？

**Base Sepolia**: ~0.0001 ETH (~$0.01)  
**Base Mainnet**: ~0.00005 ETH (~$0.15)

### Q: 如果转账成功但 mint 失败怎么办？

USDC 已经在 token 合约，联系管理员或等待 server 重试

### Q: 可以同时使用两种方式吗？

可以！它们是独立的，随时切换

## 🎯 更新内容

### 新增
- ✅ `index-direct-payment.ts` - 直接支付实现
- ✅ `DIRECT_PAYMENT_GUIDE.md` - 使用指南
- ✅ `npm run start:direct` 命令
- ✅ USDC 余额检查
- ✅ Gas 费用提示
- ✅ 链上交易确认

### 更新
- ✅ `README.md` - 添加对比表和使用说明
- ✅ `QUICK_REFERENCE.md` - 添加新命令
- ✅ `package.json` - 添加 start:direct 脚本

### 保持不变
- ✅ 原有 x402 功能完全不变
- ✅ 依赖包不变
- ✅ 配置文件不变

## 🚀 立即体验

```bash
# x402 方式 (推荐用于测试)
npm start

# 直接支付方式 (需要 USDC + ETH)
npm run start:direct
```

选择最适合你的方式！🎉

