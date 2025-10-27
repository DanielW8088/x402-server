# x402 Token Mint - 测试指南

## 快速测试（推荐）

### 步骤 1: 启动 x402 服务器

```bash
cd server
npm install
npx tsx index-x402.ts
```

期望看到：
```
🚀 x402 Token Mint Server running on port 4021
Network: base-sepolia
Facilitator: Public (https://x402.org/facilitator)
  ℹ️  Testnet mode - no CDP API keys required
```

### 步骤 2: 使用传统客户端测试

```bash
cd client
npm install
npm start  # 使用传统客户端 (index.ts)
```

**这样可以正常工作！** ✅

## 为什么不用 `npm run start:x402`？

`index-x402.ts` 是一个实验性的 x402 CLI 客户端，但它：

### 问题

1. **x402 协议设计用于浏览器钱包**
   - 不是为 CLI 客户端设计的
   - 需要复杂的支付协议实现

2. **协议复杂性**
   ```
   402 响应 → 解析 accepts → 选择支付方式 → 
   执行支付 → 创建凭证 → 编码 → 重试请求
   ```

3. **当前实现不完整**
   - 假设了简化的 EIP-712 格式
   - 实际需要实现完整的 x402 支付流程

### x402 协议的真实响应

服务器返回：
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "1000000",
    "payTo": "0x...",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "extra": {"name": "USDC", "version": "2"}
  }]
}
```

这需要复杂的客户端实现。

## 正确的测试方式

### 方案 1: CLI 测试（当前可用）✅

```bash
# 服务器
cd server && npx tsx index-x402.ts

# 客户端（使用传统客户端）
cd client && npm start
```

**工作原理：**
- x402 服务器添加了 middleware
- 但传统的 USDC 支付仍然有效
- 可以正常测试 mint 功能

### 方案 2: 浏览器测试（标准 x402）

创建前端应用 + 钱包集成：

```typescript
// 前端代码
const response = await fetch('http://localhost:4021/mint', {
  method: 'POST',
  body: JSON.stringify({ payer: address })
});

if (response.status === 402) {
  // 钱包自动处理 x402 协议
  const paymentInstructions = await response.json();
  // 钱包完成支付...
}
```

### 方案 3: AI Agents（自动化）

AI agents 会：
1. 发现你的 API（通过 x402 Bazaar）
2. 自动处理 402 响应
3. 完成支付
4. 调用 API

## 测试检查清单

### ✅ 已实现并可测试

- [x] x402 服务器（index-x402.ts）
- [x] CDP API keys 集成（主网）
- [x] 测试网无需 API keys
- [x] 自动选择 facilitator
- [x] Bazaar metadata
- [x] 传统客户端（index.ts）
- [x] USDC 支付流程
- [x] Gasless (EIP-3009)

### ⏳ 未完成

- [ ] 完整的 x402 CLI 客户端
- [ ] 浏览器前端
- [ ] 钱包集成

## 实际使用场景

### 开发测试

```bash
# 启动服务器
cd server && npx tsx index-x402.ts

# 测试
cd client && npm start
```

### 生产部署

1. **部署 x402 服务器**
   ```bash
   NETWORK=base
   CDP_API_KEY_ID=...
   CDP_API_KEY_SECRET=...
   npx tsx index-x402.ts
   ```

2. **创建前端应用**
   - 集成钱包（MetaMask 等）
   - 使用 x402 SDK

3. **自动列入 Bazaar**
   - 你的 API 会被 AI agents 发现
   - 自动处理支付

## 命令速查

```bash
# 安装依赖
cd server && npm install
cd client && npm install

# 启动 x402 服务器
cd server
npx tsx index-x402.ts

# 测试（传统客户端）
cd client
npm start

# 测试 402 响应
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{"payer": "0xYourAddress"}'

# 健康检查
curl http://localhost:4021/health
```

## 常见问题

### Q: 为什么 `npm run start:x402` 报错？

**A:** x402 协议为浏览器设计，CLI 实现不完整。使用 `npm start` 代替。

### Q: x402 服务器能用传统客户端测试吗？

**A:** 可以！x402 middleware 不影响传统的 USDC 支付流程。

### Q: 如何实现完整的 x402 客户端？

**A:** 需要：
1. 解析 402 响应的 `accepts` 数组
2. 实现 USDC 支付或 EIP-3009
3. 创建和编码支付凭证
4. 实现 X-PAYMENT header
5. ~500+ 行代码

### Q: x402 服务器有什么优势？

**A:** 
- ✅ 标准化的 HTTP 402 协议
- ✅ 自动列入 Bazaar（主网）
- ✅ AI agents 可以自动发现和使用
- ✅ 企业级 facilitator（CDP）

## 下一步

### 现在可以做：

1. ✅ 测试 x402 服务器（用传统客户端）
2. ✅ 部署到主网（配置 CDP API keys）
3. ✅ 自动列入 x402 Bazaar

### 未来可以做：

1. 创建前端应用
2. 集成钱包
3. 实现完整的 x402 客户端

## 文档

- [X402_CLIENT_GUIDE.md](./X402_CLIENT_GUIDE.md) - 客户端详细说明
- [X402_QUICKSTART.md](./X402_QUICKSTART.md) - 快速开始
- [CDP_SETUP_GUIDE.md](./CDP_SETUP_GUIDE.md) - CDP 配置
- [X402_README.md](./X402_README.md) - 总体说明

---

**总结：** 使用 `npm start`（传统客户端）测试 x402 服务器，一切正常工作！✅

