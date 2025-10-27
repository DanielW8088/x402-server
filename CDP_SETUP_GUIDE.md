# Coinbase CDP API Keys 设置指南

## 概述

使用 x402 协议在 **主网 (mainnet)** 时，需要配置 Coinbase Developer Platform (CDP) API keys。

**注意：** 测试网 (base-sepolia) 不需要 CDP API keys，使用公共 facilitator。

## 为什么需要 CDP API Keys？

根据 [Coinbase x402 文档](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)：

- **测试网**: 使用公共 facilitator (`https://x402.org/facilitator`)，无需 API keys
- **主网**: 使用 Coinbase CDP facilitator，需要 API keys

CDP facilitator 提供：
- ✅ 支付验证服务
- ✅ 自动在 x402 Bazaar 列出你的 API
- ✅ 企业级可靠性和支持

## 获取 CDP API Keys

### 步骤 1: 注册 CDP 账号

访问 [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)

1. 点击 "Sign up" 创建账号
2. 验证邮箱
3. 完成账号设置

### 步骤 2: 创建项目

1. 登录后，点击 "Create Project"
2. 填写项目信息：
   - **Project Name**: `token-mint-x402` (或你的项目名)
   - **Description**: Token minting service using x402
3. 点击 "Create"

### 步骤 3: 生成 API Keys

1. 在项目页面，找到 **"API Keys"** 标签
2. 点击 **"Create API Key"**
3. 选择权限：
   - ✅ 勾选 x402 相关权限
4. 点击 "Create"
5. **重要**: 立即保存 API Key ID 和 Secret
   - API Key ID: 公开的 ID（类似 `organizations/xxx/apiKeys/xxx`）
   - API Key Secret: 私密的 secret（只显示一次！）

⚠️ **警告**: API Key Secret 只显示一次，务必保存！

### 步骤 4: 配置环境变量

将 API keys 添加到 `.env` 文件：

```bash
# 主网配置
NETWORK=base

# CDP API Keys (主网必需)
CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEI...
-----END EC PRIVATE KEY-----

# 其他配置
SERVER_PRIVATE_KEY=0x...
TOKEN_CONTRACT_ADDRESS=0x...
PAY_TO_ADDRESS=0x...
REQUIRED_PAYMENT_USDC=1
```

### 步骤 5: 测试配置

启动服务器：

```bash
cd server
npm install
npx tsx index-x402.ts
```

期望输出：

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
```

如果看到错误：
```
⚠️  Warning: CDP API keys not configured for mainnet!
```

说明 API keys 没有正确配置。

## 测试网 vs 主网配置

### 测试网 (base-sepolia)

```bash
# .env
NETWORK=base-sepolia

# 不需要 CDP API keys
# CDP_API_KEY_ID=
# CDP_API_KEY_SECRET=
```

服务器会自动使用公共 facilitator：
```
Facilitator: Public (https://x402.org/facilitator)
  ℹ️  Testnet mode - no CDP API keys required
```

### 主网 (base)

```bash
# .env
NETWORK=base

# 必需 CDP API keys
CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
```

服务器会使用 CDP facilitator：
```
Facilitator: Coinbase CDP
  ✓ CDP API Key ID: organiza...
  ℹ️  Mainnet mode - using Coinbase Developer Platform
  📊 Your endpoint will be listed in x402 Bazaar
```

## x402 Bazaar

使用 CDP facilitator 的好处之一是你的 API 会自动在 [x402 Bazaar](https://docs.cdp.coinbase.com/x402/docs/bazaar-discovery-layer) 上列出。

### 提升可见性

在代码中添加详细的 metadata：

```typescript
"POST /mint": {
  price: "$1",
  network: "base",
  config: {
    description: "Mint tokens by paying 1 USDC",
    inputSchema: {
      type: "object",
      properties: {
        payer: {
          type: "string",
          description: "Ethereum address to receive tokens"
        }
      },
      required: ["payer"]
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        mintTxHash: { type: "string" },
        amount: { type: "string" }
      }
    }
  }
}
```

这些 metadata 帮助：
- 🤖 AI agents 自动理解如何使用你的 API
- 👨‍💻 开发者快速找到你的服务
- 📈 提高在 Bazaar 中的排名

## 常见问题

### Q: 测试网必须要 CDP API keys 吗？

**A:** 不需要。测试网使用公共 facilitator，无需 API keys。

### Q: API Key Secret 丢失了怎么办？

**A:** Secret 只显示一次，丢失后需要：
1. 删除旧的 API key
2. 创建新的 API key
3. 更新 `.env` 配置

### Q: 可以在测试网也使用 CDP facilitator 吗？

**A:** 可以，但不推荐。测试网建议使用免费的公共 facilitator。

### Q: CDP API keys 收费吗？

**A:** CDP 有免费额度，具体查看 [CDP 定价](https://www.coinbase.com/cloud/pricing)。

### Q: 如何验证 API keys 是否正确？

**A:** 
1. 启动服务器，查看日志输出
2. 测试请求：
   ```bash
   curl -X POST http://localhost:4021/mint \
     -H "Content-Type: application/json" \
     -d '{"payer": "0xYourAddress"}'
   ```
3. 应该收到 402 Payment Required 响应

### Q: 服务器报错 "CDP API keys not configured"

**A:** 检查：
1. `.env` 文件中是否设置了 `CDP_API_KEY_ID` 和 `CDP_API_KEY_SECRET`
2. API keys 是否正确（没有多余空格或换行）
3. `NETWORK` 是否设置为 `base`（主网）

## 安全建议

### 1. 保护 API Keys

- ❌ 不要提交到 Git
- ❌ 不要分享给他人
- ❌ 不要硬编码在代码中
- ✅ 使用 `.env` 文件
- ✅ 添加到 `.gitignore`

### 2. 最小权限原则

创建 API key 时，只授予必需的权限。

### 3. 定期轮换

定期更换 API keys，特别是：
- 怀疑泄露时
- 团队成员离职时
- 每 90 天（推荐）

### 4. 监控使用

在 CDP 控制台监控 API keys 使用情况：
- 请求量
- 错误率
- 异常活动

## 环境变量检查清单

主网部署前检查：

- [ ] `NETWORK=base`
- [ ] `CDP_API_KEY_ID` 已设置
- [ ] `CDP_API_KEY_SECRET` 已设置
- [ ] `SERVER_PRIVATE_KEY` 有 MINTER_ROLE
- [ ] `SERVER_PRIVATE_KEY` 对应地址有 ETH for gas
- [ ] `TOKEN_CONTRACT_ADDRESS` 是主网地址
- [ ] `PAY_TO_ADDRESS` 是你要接收 USDC 的地址
- [ ] `.env` 文件在 `.gitignore` 中

## 相关链接

- [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
- [CDP x402 Documentation](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [x402 Bazaar](https://docs.cdp.coinbase.com/x402/docs/bazaar-discovery-layer)
- [CDP Pricing](https://www.coinbase.com/cloud/pricing)

## 支持

遇到问题？

1. 查看 [CDP 文档](https://docs.cdp.coinbase.com/)
2. 加入 [Discord](https://discord.gg/cdp)
3. 查看 [GitHub Issues](https://github.com/coinbase/cdp-sdk-js/issues)

---

**准备好了？** 现在可以：
1. ✅ 配置好 CDP API keys
2. ✅ 设置 `NETWORK=base`
3. ✅ 运行 `npx tsx index-x402.ts`
4. ✅ 开始在主网接收支付！

