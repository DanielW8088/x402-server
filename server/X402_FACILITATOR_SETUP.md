# x402 Facilitator 配置说明

## 修改概述

我们已经将后端和前端都配置为使用 **x402.org facilitator**，这样所有的 x402 支付交易都会被 [x402scan.com](https://x402scan.com) 索引和显示。

## 修改内容

### 1. 后端 (server/index-multi-token.ts)

**修改前**：
- 使用本地队列处理支付结算
- 不通过 facilitator API
- 交易不会出现在 x402scan

**修改后**：
```typescript
// 使用 x402 SDK 的 settle() 函数
const settleResult = await settle(
  walletClient,        // 服务器钱包
  paymentPayload,      // 来自 X-PAYMENT header
  paymentRequirements  // 必须匹配 402 响应
);

if (settleResult.success) {
  return {
    success: true,
    txHash: settleResult.transaction
  };
}
```

**关键点**：
- ✅ 现在通过 facilitator 结算支付（标准 x402 流程）
- ✅ 交易会被 x402scan 索引
- ✅ 符合 x402 协议标准

### 2. 前端 (0x402.io/components/DynamicMintInterface.tsx)

**修改前**：
```typescript
// 测试网用 x402.org，主网用 Coinbase facilitator
const x402Config = CHAIN.id === 84532 
  ? { facilitatorUrl: 'https://x402.org/facilitator' }
  : undefined
```

**修改后**：
```typescript
// 统一使用 x402.org facilitator（测试网和主网）
const x402Config = {
  facilitatorUrl: 'https://x402.org/facilitator'
}
```

**好处**：
- ✅ 所有交易在 x402scan 可见
- ✅ 更好的生态集成
- ✅ 统一的用户体验

### 3. 环境变量 (server/env.multi-token.example)

```bash
# x402 Protocol Configuration
# Default facilitator: https://x402.org/facilitator (works for both testnet and mainnet)
# Alternative: https://x402.coinbase.com (Coinbase facilitator, requires CDP API keys for mainnet)
X402_FACILITATOR_URL=https://x402.org/facilitator
```

## 标准 x402 流程

根据 [Coinbase x402 文档](https://docs.cdp.coinbase.com/x402/docs/quickstart-sellers)，标准的 Seller 流程应该是：

```
1. 买家请求资源 → GET /api/mint/:tokenAddress
2. 服务器返回 402 + PaymentRequirements
3. 买家通过 facilitator 构建支付
4. ✅ 服务器通过 facilitator 验证和结算支付
5. 返回资源（mint 结果）
```

我们现在的实现完全符合这个标准流程。

## 数据流向

```
用户钱包
   ↓
前端 (x402-fetch)
   ↓ (检测 402 响应)
x402.org facilitator ← 帮助构建 EIP-3009 签名
   ↓
前端重试 + X-PAYMENT header
   ↓
后端服务器
   ↓ (解码 X-PAYMENT)
x402.org facilitator ← 验证和结算支付
   ↓ (返回交易 hash)
后端 → 执行 mint
   ↓
x402scan.com ← 索引交易记录
```

## 部署步骤

### 1. 更新后端

```bash
cd /Users/daniel/code/402/token-mint/server

# 编译 TypeScript
npm run build

# 重启 PM2 服务
pm2 restart all

# 查看日志
pm2 logs
```

### 2. 更新前端

```bash
cd /Users/daniel/code/402/token-mint/0x402.io

# 构建生产版本
npm run build

# 如果是静态导出
npm run export
```

### 3. 验证配置

测试 mint 流程：
1. 访问前端 mint 页面
2. 连接钱包
3. 执行 mint 操作
4. 检查控制台日志中的 facilitator settle result
5. 在 [x402scan.com](https://x402scan.com) 搜索交易

预期日志：
```
🔄 Settling x402 payment via facilitator: https://x402.org/facilitator
✅ Facilitator settle result: {
  success: true,
  transaction: "0x...",
  network: "base"
}
```

## 优势对比

### 使用 x402.org Facilitator（当前配置）
- ✅ 交易被 x402scan 索引
- ✅ 更好的生态可见性
- ✅ 符合 x402 标准流程
- ✅ 测试网和主网统一配置
- ⚠️ 依赖 x402.org 基础设施

### 使用 Coinbase Facilitator（之前的主网配置）
- ✅ Coinbase 官方支持
- ✅ 可能更稳定
- ❌ 不会出现在 x402scan
- ❌ 需要 CDP API keys（主网）
- ❌ 生态可见性差

## 故障排查

### 如果 facilitator settlement 失败

1. **检查 facilitator URL**：
   ```bash
   echo $X402_FACILITATOR_URL
   # 应该输出: https://x402.org/facilitator
   ```

2. **检查支付签名**：
   - 确保前端和后端使用相同的 USDC domain (name/version)
   - Base Sepolia: name="USDC", version="2"
   - Base Mainnet: name="USD Coin", version="2"

3. **检查 PaymentRequirements 一致性**：
   - 402 响应的 PaymentRequirements
   - settle 时的 PaymentRequirements
   - 两者必须完全匹配（尤其是 payTo, asset, maxAmountRequired）

4. **查看详细日志**：
   ```bash
   pm2 logs server --lines 100
   ```

## 参考资料

- [x402 官方文档](https://docs.cdp.coinbase.com/x402/docs/welcome)
- [x402 Seller Quickstart](https://docs.cdp.coinbase.com/x402/docs/quickstart-sellers)
- [x402scan 浏览器](https://x402scan.com)
- [x402 GitHub](https://github.com/coinbase/x402)

