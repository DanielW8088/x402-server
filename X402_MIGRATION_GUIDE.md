# x402 Migration Guide

## 概述

本指南介绍如何从传统的私钥签名模式迁移到 x402 协议。

## 什么是 x402？

x402 是基于 HTTP 402 Payment Required 状态码的支付协议，允许 API 通过标准的 HTTP 协议要求付款。

### 主要优势

1. **标准化支付流程** - 使用 HTTP 402 状态码
2. **Facilitator 处理支付验证** - 不需要自己验证链上交易
3. **更好的安全性** - 私钥只用于签名支付凭证，不直接发送链上交易
4. **简化架构** - 不需要复杂的交易队列和监控系统

## 架构对比

### 传统模式 (Before)

```
客户端                     服务器
  |                         |
  | 1. 发送 USDC 到链上      |
  |------------------------>|
  |                         |
  | 2. POST /mint           |
  |    {txHash, payer}     |
  |------------------------>|
  |                         | 3. 验证链上交易
  |                         | 4. 调用合约 mint (使用服务器私钥)
  |<------------------------|
  |     5. 返回 mint 结果    |
```

**问题：**
- 客户端需要先支付 gas 发送 USDC
- 服务器需要管理私钥和 nonce
- 需要复杂的交易队列和监控系统
- 需要处理 gas 加速、重试等问题

### x402 模式 (After)

```
客户端                     服务器                  Facilitator
  |                         |                         |
  | 1. POST /mint           |                         |
  |------------------------>|                         |
  |<------------------------|                         |
  |   402 + 支付指令         |                         |
  |                         |                         |
  | 2. 签名支付凭证          |                         |
  |                         |                         |
  | 3. POST /mint           |                         |
  |    + X-PAYMENT header   |                         |
  |------------------------>| 4. 验证支付              |
  |                         |------------------------>|
  |                         |<------------------------|
  |                         |   支付有效               |
  |                         | 5. 调用合约 mint         |
  |<------------------------|   (使用服务器私钥)        |
  |   6. 返回 mint 结果      |                         |
```

**优势：**
- 客户端无需先发送链上交易
- Facilitator 处理支付验证
- 服务器只在支付验证后调用 mint
- 简化了服务器代码

## 迁移步骤

### 1. 安装依赖

#### 服务器端

```bash
cd server
npm install x402-express @coinbase/x402
```

#### 客户端

```bash
cd client
npm install @coinbase/x402
```

### 2. 更新服务器代码

使用新的 `index-x402.ts`:

```typescript
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";

// 配置 x402 middleware
app.use(paymentMiddleware(
  payTo, // 接收地址
  {
    "POST /mint": {
      price: "$1", // USDC 价格
      network: "base-sepolia",
      config: {
        description: "Mint tokens - Pay 1 USDC",
      }
    }
  },
  {
    ...facilitator, // Coinbase 的 Facilitator
  }
));

// mint endpoint - 支付由 middleware 验证
app.post("/mint", async (req, res) => {
  // 此时支付已被 x402 middleware 验证
  const payer = req.body.payer;
  
  // 直接 mint，不需要验证链上支付
  const hash = await walletClient.writeContract({
    address: tokenContractAddress,
    abi: tokenAbi,
    functionName: "mint",
    args: [payer, txHash],
  });
  
  // ...
});
```

### 3. 更新客户端代码

使用新的 `index-x402.ts`:

```typescript
// 步骤 1: 请求 mint (会收到 402)
try {
  await axios.post(`${serverUrl}/mint`, { payer: address });
} catch (error) {
  if (error.response.status === 402) {
    // 步骤 2: 解析支付指令
    const instructions = error.response.data;
    
    // 步骤 3: 签名支付
    const signature = await signPayment(instructions);
    
    // 步骤 4: 带支付凭证重试
    const result = await axios.post(
      `${serverUrl}/mint`,
      { payer: address },
      {
        headers: {
          'X-PAYMENT': createPayload(instructions, signature),
        }
      }
    );
  }
}
```

### 4. 运行新版本

#### 服务器

```bash
cd server
npm install  # 安装新依赖
tsx index-x402.ts
```

#### 客户端

```bash
cd client
npm install  # 安装新依赖
npm run start:x402
```

## 配置说明

### 环境变量

服务器端 `.env`:

```bash
# 必需 - 服务器私钥 (用于调用合约 mint)
SERVER_PRIVATE_KEY=0x...

# 必需 - Token 合约地址
TOKEN_CONTRACT_ADDRESS=0x...

# 必需 - 接收支付的地址
PAY_TO_ADDRESS=0x...

# 网络 (base-sepolia 或 base)
NETWORK=base-sepolia

# 要求的支付金额 (USDC)
REQUIRED_PAYMENT_USDC=1

# 端口
PORT=4021
```

客户端 `.env`:

```bash
# 必需 - 客户端私钥 (用于签名支付凭证)
PRIVATE_KEY=0x...

# 服务器 URL
SERVER_URL=http://localhost:4021

# 网络 (要与服务器一致)
NETWORK=base-sepolia
```

### Facilitator 配置

#### 测试网 (Base Sepolia)

```typescript
// 使用社区 facilitator
app.use(paymentMiddleware(
  payTo,
  routes,
  {
    url: "https://x402.org/facilitator"
  }
));
```

#### 主网 (Base Mainnet)

```typescript
import { facilitator } from "@coinbase/x402";

// 使用 Coinbase 的 facilitator
app.use(paymentMiddleware(
  payTo,
  routes,
  {
    ...facilitator
  }
));
```

## 测试

### 1. 启动服务器

```bash
cd server
npm run dev  # 使用 tsx watch index-x402.ts
```

### 2. 测试健康检查

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

### 3. 测试 402 响应

```bash
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{"payer": "0xYourAddress"}'
```

期望输出: `402 Payment Required` + 支付指令

### 4. 运行客户端

```bash
cd client
npm run start:x402
```

## 对比：代码简化

### 服务器端

**Before (传统模式):**
- ✅ 866 行代码
- ❌ 需要管理 nonce
- ❌ 需要交易队列
- ❌ 需要交易监控
- ❌ 需要 gas 加速
- ❌ 需要验证链上 USDC 交易

**After (x402 模式):**
- ✅ ~300 行代码
- ✅ 无需管理 nonce (只调用 mint)
- ✅ 无需交易队列
- ✅ 无需交易监控
- ✅ Facilitator 处理支付验证
- ✅ 代码量减少 65%

### 客户端

**Before:**
- ❌ 需要发送链上 USDC 交易
- ❌ 需要支付 gas
- ❌ 需要等待交易确认

**After:**
- ✅ 只需签名支付凭证（离链）
- ✅ 无需支付 gas
- ✅ 立即返回结果

## 常见问题

### Q: 服务器还需要私钥吗？

**A:** 需要。服务器仍然需要私钥来调用合约的 `mint` 函数（需要 `MINTER_ROLE`）。但是：
- **传统模式**: 私钥用于验证和执行 USDC 转账 + mint
- **x402 模式**: 私钥只用于执行 mint，支付验证由 Facilitator 处理

### Q: 客户端如何支付？

**A:** 客户端不直接发送链上交易，而是：
1. 签名支付凭证（EIP-712 签名，离链）
2. 将签名提交给服务器
3. 服务器通过 Facilitator 验证支付
4. Facilitator 可能会处理实际的链上结算

### Q: 谁支付 gas？

**A:** 
- Mint 交易的 gas：服务器支付（与传统模式相同）
- USDC 支付的 gas：由 Facilitator 处理（客户端无需支付）

### Q: 是否还需要 gasless mint？

**A:** 不需要。x402 协议本身就提供了类似 gasless 的体验：
- 客户端只需签名支付凭证
- 无需发送链上交易
- Facilitator 处理支付验证

### Q: 数据库和队列还需要吗？

**A:** 
- **数据库**: 可选，用于记录 mint 历史
- **交易队列**: 不需要，因为只有 mint 交易
- **交易监控**: 不需要，可以简化为基本的重试逻辑
- **Nonce 管理**: 不需要复杂的管理，基本的 viem nonce 就够了

### Q: 测试网和主网有什么区别？

**A:**
- **测试网 (Base Sepolia)**: 使用 `https://x402.org/facilitator`
- **主网 (Base)**: 使用 `@coinbase/x402` 的 facilitator

## 迁移检查清单

- [ ] 安装 x402 依赖
- [ ] 更新服务器代码使用 x402 middleware
- [ ] 更新客户端代码使用 x402 支付流程
- [ ] 配置 Facilitator (测试网或主网)
- [ ] 测试 402 响应
- [ ] 测试完整的支付和 mint 流程
- [ ] 移除旧的交易队列、监控代码（可选）
- [ ] 更新文档

## 下一步

1. **生产部署**: 切换到 Base 主网和 Coinbase Facilitator
2. **前端集成**: 将 x402 客户端集成到 React/Next.js 前端
3. **监控**: 添加基本的错误监控和日志
4. **扩展**: 支持更多的 x402 端点和功能

## 参考资料

- [x402 Documentation](https://x402.gitbook.io/x402/)
- [x402 Quickstart for Sellers](https://x402.gitbook.io/x402/getting-started/quickstart-for-sellers)
- [Coinbase x402 SDK](https://github.com/coinbase/x402)
- [x402 Express Middleware](https://www.npmjs.com/package/x402-express)

## 支持

如有问题：
1. 查看 [x402 Discord](https://discord.gg/x402)
2. 查看 [GitHub Issues](https://github.com/coinbase/x402/issues)
3. 阅读 [x402 Documentation](https://x402.gitbook.io/x402/)

