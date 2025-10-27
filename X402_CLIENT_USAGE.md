# x402 客户端使用指南

## 三种客户端模式

现在项目提供三种客户端：

### 1. 传统客户端 (推荐用于测试)

**文件**: `client/index.ts`

**使用方式**:
```bash
cd client
npm start
```

**特点**:
- ✅ 发送 USDC 到指定地址
- ✅ 调用 `/mint-direct` endpoint
- ✅ 支持 gasless (EIP-3009)
- ✅ 稳定可靠

### 2. x402 客户端 (实际可用) ⭐

**文件**: `client/index-x402-working.ts`

**使用方式**:
```bash
cd client
npm run start:x402
```

**特点**:
- ✅ 完整的 x402 协议流程
- ✅ 收到 402 响应后自动处理
- ✅ 发送 USDC 支付
- ✅ 创建 X-PAYMENT header
- ✅ 重试请求完成 mint

### 3. x402 客户端 (实验性)

**文件**: `client/index-x402.ts`

**使用方式**:
```bash
cd client
npm run start:x402-old
```

**特点**:
- ⚠️ 实验性实现
- ⚠️ 不完整

## 详细：x402 客户端使用

### 工作流程

```
1. 客户端请求 POST /mint
   └─> 服务器返回 402 Payment Required

2. 客户端解析支付指令
   └─> 获取: payTo, amount, asset

3. 客户端发送 USDC
   └─> 获取交易哈希

4. 客户端创建 X-PAYMENT header
   └─> base64 编码的支付凭证

5. 客户端重试 POST /mint + X-PAYMENT
   └─> 服务器验证支付并 mint
```

### 配置

**client/.env**:
```bash
PRIVATE_KEY=0x...
SERVER_URL=http://localhost:4021
NETWORK=base-sepolia
# 不需要其他配置
```

### 运行

```bash
cd client
npm run start:x402
```

### 期望输出

```
🚀 x402 Token Mint Client (Working Version)
============================================

Network: base-sepolia
Your address: 0x...
Server: http://localhost:4021
Protocol: x402 (HTTP 402 Payment Required)

📋 Getting server info...
   Protocol: x402
   Token contract: 0x...
   Pay to address: 0x...
   Tokens per payment: 10000
   Remaining supply: 999340000
   Price: 1 USDC

🎨 Minting tokens via x402 protocol...
==================================================

📡 Step 1: Requesting POST http://localhost:4021/mint...
   💳 Payment required (HTTP 402)

📋 Payment instructions:
   Network: base-sepolia
   Pay to: 0x...
   Amount: 1 USDC
   Asset: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
   Description: Mint tokens - Pay 1 USDC

💰 Step 2: Executing payment...
💸 Sending USDC payment...
   To: 0x...
   Amount: 1 USDC
   Your balance: 19 USDC
   Transaction hash: 0x...
   Waiting for confirmation...
   ✅ USDC transfer confirmed at block 12345

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
Block: 12346
Timestamp: 2025-10-27T...

💡 How it worked:
   1. Client requested /mint
   2. Server responded with 402 Payment Required
   3. Client sent USDC payment
   4. Client retried with X-PAYMENT header
   5. Server verified payment and minted tokens!

🎉 x402 protocol completed successfully!
```

## 技术细节

### X-PAYMENT Header 格式

我们的实现使用简化的 x402 格式：

```typescript
// 支付凭证
const proof = {
  type: "transaction",
  txHash: "0x...",  // USDC 交易哈希
  payer: "0x...",   // 支付者地址
  timestamp: 1234567890
};

// Base64 编码
const paymentHeader = Buffer.from(JSON.stringify(proof)).toString('base64');
```

### 服务器验证

服务器端的验证流程：

```typescript
// 1. 解码 X-PAYMENT header
const proof = JSON.parse(Buffer.from(header, 'base64').toString());

// 2. 验证链上 USDC 交易
await verifyUSDCPayment(proof.txHash, proof.payer, requiredAmount);

// 3. 如果验证通过，执行 mint
```

### 与标准 x402 的区别

| 特性 | 标准 x402 | 我们的实现 |
|------|-----------|-----------|
| 支付方式 | 多种 (scheme) | USDC 交易 |
| Facilitator | 必需 | 可选（我们自己验证）|
| 支付凭证 | 复杂格式 | 简化 JSON |
| 兼容性 | 标准钱包 | 自定义客户端 |

我们的实现是**简化版的 x402 协议**，核心思想相同：
- ✅ HTTP 402 响应
- ✅ 支付指令
- ✅ X-PAYMENT header
- ✅ 支付验证

但实现细节简化了，更容易理解和使用。

## 对比三种模式

### 传统客户端 (`npm start`)

```bash
发送 USDC → 调用 /mint-direct → Mint
```

**适用场景**: 开发测试

### x402 客户端 (`npm run start:x402`)

```bash
请求 /mint → 收到 402 → 发送 USDC → 
创建 X-PAYMENT → 重试 /mint → Mint
```

**适用场景**: 学习 x402 协议

### 浏览器钱包 (未实现)

```bash
浏览器 → 钱包插件 → 自动处理 x402 → Mint
```

**适用场景**: 生产环境

## 常见问题

### Q: 哪个客户端最好用？

**A:** 
- **测试**: 使用传统客户端 `npm start`
- **学习 x402**: 使用 x402 客户端 `npm run start:x402`
- **生产**: 使用浏览器钱包

### Q: x402 客户端必须发送 USDC 吗？

**A:** 是的，我们的实现需要实际的链上 USDC 支付。这与传统模式一样，只是增加了 x402 协议的流程。

### Q: 能不能不发 USDC 就 mint？

**A:** 不能。无论是传统模式还是 x402 模式，都需要真实的 USDC 支付。x402 只是改变了**支付流程的协议**，不是免费的。

### Q: X-PAYMENT header 是什么？

**A:** x402 协议中用于传递支付凭证的 HTTP header。我们的实现包含：
- 交易哈希
- 支付者地址
- 时间戳

服务器验证这个凭证对应的链上交易是否有效。

### Q: 为什么要用 x402？

**A:** x402 的优势：
- ✅ 标准化的支付协议
- ✅ HTTP 402 状态码
- ✅ 自动化友好（AI agents）
- ✅ 浏览器钱包支持

我们的实现是教学版本，帮助理解协议。

## 测试步骤

### 1. 启动服务器

```bash
cd server
npx tsx index-x402.ts
```

验证看到：
- `POST /mint - Mint tokens (requires x402 payment) 💳`

### 2. 运行 x402 客户端

```bash
cd client
npm run start:x402
```

### 3. 观察流程

看到完整的 x402 协议流程：
1. 402 响应
2. 支付指令
3. USDC 支付
4. X-PAYMENT header
5. 成功 mint

## 进阶

### 自定义支付凭证

修改 `index-x402-working.ts`:

```typescript
function createPaymentProof(paymentTxHash: string, payer: string): string {
  const proof = {
    type: "transaction",
    txHash: paymentTxHash,
    payer: payer,
    timestamp: Date.now(),
    // 添加自定义字段
    version: "1.0",
    network: "base-sepolia",
  };
  
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}
```

### 添加重试逻辑

```typescript
async function makeX402RequestWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await makeX402Request(url);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
```

## 命令速查

```bash
# 传统客户端
cd client && npm start

# x402 客户端（可用）
cd client && npm run start:x402

# x402 客户端（实验性）
cd client && npm run start:x402-old

# 服务器
cd server && npx tsx index-x402.ts
```

## 总结

✅ **现在有三种客户端:**
1. 传统客户端 - 稳定，用于测试
2. x402 客户端 - 教学版，完整协议流程
3. 浏览器钱包 - 生产环境（待实现）

✅ **x402 客户端特点:**
- 完整的 402 流程
- 自动处理支付
- 创建 X-PAYMENT header
- 验证链上交易

✅ **推荐使用:**
- 开发测试：传统客户端 `npm start`
- 学习协议：x402 客户端 `npm run start:x402`
- 生产环境：浏览器 + 钱包

🎉 **现在可以体验完整的 x402 协议了！**

