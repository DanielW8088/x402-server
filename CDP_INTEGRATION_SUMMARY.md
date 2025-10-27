# CDP x402 集成总结

## 完成的工作

已成功集成 Coinbase Developer Platform (CDP) x402 facilitator，支持测试网和主网。

## 核心改动

### 1. 服务器代码 (index-x402.ts)

#### 添加 CDP API Keys 支持

```typescript
// CDP API keys (required for mainnet)
const cdpApiKeyId = process.env.CDP_API_KEY_ID;
const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;

// Validate CDP API keys for mainnet
if (network === "base" && (!cdpApiKeyId || !cdpApiKeySecret)) {
  console.error("⚠️  Warning: CDP API keys not configured for mainnet!");
  // ...
  process.exit(1);
}
```

#### 自动选择 Facilitator

```typescript
// Configure facilitator based on network
const facilitatorConfig = network === "base-sepolia" 
  ? { url: "https://x402.org/facilitator" }  // Public facilitator for testnet
  : facilitator;  // CDP facilitator for mainnet
```

#### 增强的 Metadata

```typescript
config: {
  description: `Mint tokens - Pay ${requiredPayment} USDC`,
  mimeType: "application/json",
  maxTimeoutSeconds: 120,
  // Enhanced metadata for x402 Bazaar discovery
  inputSchema: {
    type: "object",
    properties: {
      payer: {
        type: "string",
        description: "Ethereum address that will receive the minted tokens"
      }
    },
    required: ["payer"]
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      payer: { type: "string" },
      amount: { type: "string", description: "Amount of tokens minted" },
      mintTxHash: { type: "string", description: "Transaction hash of the mint" },
      blockNumber: { type: "string" },
      timestamp: { type: "number" }
    }
  }
}
```

### 2. 环境变量更新

**env.x402.example:**
- 添加 CDP_API_KEY_ID
- 添加 CDP_API_KEY_SECRET
- 详细的配置说明
- 测试网 vs 主网区别

### 3. 新增文档

#### CDP_SETUP_GUIDE.md
- 完整的 CDP 账号设置指南
- 如何获取 API keys
- 测试网 vs 主网配置
- 常见问题解答
- 安全建议

#### CDP_QUICK_REFERENCE.md
- 快速参考卡片
- 常见错误和解决方案
- 环境切换指南
- 上线检查清单

#### 更新现有文档
- X402_QUICKSTART.md - 添加 CDP 配置部分
- X402_README.md - 更新环境变量说明

## 工作流程

### 测试网 (base-sepolia)

```
客户端 → 服务器 → 公共 Facilitator → 验证支付 → Mint
         ↓
    无需 CDP API Keys
    免费使用
```

### 主网 (base)

```
客户端 → 服务器 → CDP Facilitator → 验证支付 → Mint
         ↓           ↓
    需要 CDP      自动列入
    API Keys      x402 Bazaar
```

## 使用方式

### 快速开始 (测试网)

```bash
# 1. 配置 .env
NETWORK=base-sepolia
SERVER_PRIVATE_KEY=0x...
TOKEN_CONTRACT_ADDRESS=0x...
PAY_TO_ADDRESS=0x...

# 2. 启动
cd server
npm install
npx tsx index-x402.ts

# 3. 看到输出
Facilitator: Public (https://x402.org/facilitator)
  ℹ️  Testnet mode - no CDP API keys required
```

### 生产部署 (主网)

```bash
# 1. 获取 CDP API Keys
# 访问 https://portal.cdp.coinbase.com/

# 2. 配置 .env
NETWORK=base
SERVER_PRIVATE_KEY=0x...
TOKEN_CONTRACT_ADDRESS=0x...
PAY_TO_ADDRESS=0x...
CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----

# 3. 启动
npx tsx index-x402.ts

# 4. 看到输出
Facilitator: Coinbase CDP
  ✓ CDP API Key ID: organiza...
  ℹ️  Mainnet mode - using Coinbase Developer Platform
  📊 Your endpoint will be listed in x402 Bazaar
```

## 功能对比

| 功能 | 测试网 | 主网 |
|------|-------|------|
| CDP API Keys | ❌ 不需要 | ✅ 必需 |
| Facilitator | 公共 | Coinbase CDP |
| x402 Bazaar 列表 | ❌ | ✅ |
| 企业级支持 | ❌ | ✅ |
| 成本 | 免费 | CDP 定价 |

## x402 Bazaar 集成

使用 CDP facilitator 的好处：

### 1. 自动列入 Bazaar

你的 API 会自动在 [x402 Bazaar](https://docs.cdp.coinbase.com/x402/docs/bazaar-discovery-layer) 上列出。

### 2. 增强的可发现性

通过 metadata，AI agents 和开发者可以：
- 🔍 搜索和发现你的 API
- 🤖 自动理解如何使用
- 📊 查看价格和功能
- ⚡ 快速集成

### 3. 示例 Metadata

```typescript
{
  description: "Mint tokens by paying 1 USDC",
  inputSchema: {
    type: "object",
    properties: {
      payer: {
        type: "string",
        description: "Ethereum address to receive tokens"
      }
    }
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
```

## 技术细节

### Facilitator 选择逻辑

```typescript
const facilitatorConfig = network === "base-sepolia" 
  ? { url: "https://x402.org/facilitator" }  // Testnet: 公共 facilitator
  : facilitator;  // Mainnet: CDP facilitator (来自 @coinbase/x402)
```

### 启动时验证

```typescript
// 主网必须配置 CDP API keys
if (network === "base" && (!cdpApiKeyId || !cdpApiKeySecret)) {
  console.error("⚠️  Warning: CDP API keys not configured for mainnet!");
  console.error("Get your API keys at: https://portal.cdp.coinbase.com/");
  process.exit(1);
}
```

### 日志输出

根据网络类型显示不同的 facilitator 信息：

**测试网:**
```
Facilitator: Public (https://x402.org/facilitator)
  ℹ️  Testnet mode - no CDP API keys required
```

**主网:**
```
Facilitator: Coinbase CDP
  ✓ CDP API Key ID: organiza...
  ℹ️  Mainnet mode - using Coinbase Developer Platform
  📊 Your endpoint will be listed in x402 Bazaar
```

## 安全性

### 环境变量保护

1. **不要提交 .env 到 Git**
   ```gitignore
   .env
   .env.local
   .env.*.local
   ```

2. **使用示例文件**
   - `env.x402.example` - 配置模板
   - 不包含敏感信息

3. **API Keys 权限**
   - 只授予必需权限
   - 定期轮换
   - 监控使用情况

### 生产环境建议

1. **使用环境变量管理工具**
   - Docker secrets
   - Kubernetes secrets
   - AWS Secrets Manager
   - 等

2. **限制访问**
   - 只有必要的人员才能访问 API keys
   - 使用 IAM 角色管理

3. **监控和告警**
   - 设置异常使用告警
   - 定期审计日志

## 测试

### 1. 测试网测试

```bash
# 配置测试网
echo "NETWORK=base-sepolia" > .env
# ... 其他配置

# 启动
npx tsx index-x402.ts

# 测试
curl http://localhost:4021/health
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{"payer": "0x..."}'
```

### 2. 主网测试

```bash
# 配置主网
echo "NETWORK=base" > .env
echo "CDP_API_KEY_ID=..." >> .env
echo "CDP_API_KEY_SECRET=..." >> .env
# ... 其他配置

# 启动
npx tsx index-x402.ts

# 验证 facilitator
# 应该看到 "Facilitator: Coinbase CDP"

# 测试
curl http://localhost:4021/health
```

## 故障排除

### 问题 1: CDP API keys not configured

**症状:**
```
⚠️  Warning: CDP API keys not configured for mainnet!
```

**解决:**
1. 检查 `.env` 文件是否存在
2. 确认 `CDP_API_KEY_ID` 和 `CDP_API_KEY_SECRET` 已设置
3. 确认 `NETWORK=base`

### 问题 2: 找不到 @coinbase/x402

**症状:**
```
Cannot find module '@coinbase/x402'
```

**解决:**
```bash
npm install @coinbase/x402
```

### 问题 3: API Key 格式错误

**症状:**
支付验证失败

**解决:**
确保 API Key Secret 包含完整的 PEM 格式：
```
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEI...
-----END EC PRIVATE KEY-----
```

## 文档结构

```
examples/token-mint/
├── CDP_SETUP_GUIDE.md          # 详细设置指南
├── CDP_INTEGRATION_SUMMARY.md  # 本文档 - 集成总结
├── X402_QUICKSTART.md          # 快速开始（已更新）
├── X402_README.md              # 总体说明（已更新）
└── server/
    ├── index-x402.ts           # 服务器代码（已更新）
    ├── env.x402.example        # 环境变量模板（已更新）
    └── CDP_QUICK_REFERENCE.md  # 快速参考卡片
```

## 参考资料

### Coinbase 官方文档
- [CDP x402 Quickstart for Sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [x402 Bazaar Documentation](https://docs.cdp.coinbase.com/x402/docs/bazaar-discovery-layer)
- [CDP Portal](https://portal.cdp.coinbase.com/)

### 内部文档
- [CDP_SETUP_GUIDE.md](./CDP_SETUP_GUIDE.md) - 详细设置指南
- [CDP_QUICK_REFERENCE.md](./server/CDP_QUICK_REFERENCE.md) - 快速参考
- [X402_QUICKSTART.md](./X402_QUICKSTART.md) - 快速开始

## 总结

✅ **完成的集成:**
- CDP API Keys 支持
- 自动 facilitator 选择（测试网/主网）
- 增强的 metadata for Bazaar
- 完整的文档和指南
- 错误验证和提示

✅ **用户体验提升:**
- 测试网：无需 API keys，开箱即用
- 主网：清晰的配置步骤和错误提示
- 自动列入 x402 Bazaar
- 详细的日志输出

✅ **生产就绪:**
- 环境变量验证
- 安全建议
- 故障排除指南
- 完整的文档

**准备好了？** 现在可以：
1. 在测试网测试（无需 CDP API keys）
2. 获取 CDP API keys
3. 切换到主网部署
4. 开始接收支付！🚀

