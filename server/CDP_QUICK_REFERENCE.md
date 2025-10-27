# CDP API Keys 快速参考

## 何时需要 CDP API Keys？

| 网络 | CDP API Keys | Facilitator |
|------|-------------|-------------|
| base-sepolia (测试网) | ❌ 不需要 | 公共 facilitator |
| base (主网) | ✅ **必需** | Coinbase CDP |

## 快速设置

### 1. 获取 API Keys

访问: https://portal.cdp.coinbase.com/

```
注册 → 创建项目 → 生成 API Keys
```

### 2. 配置 .env

```bash
# 主网配置
NETWORK=base
CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
```

### 3. 启动服务器

```bash
npx tsx index-x402.ts
```

### 4. 验证

看到这个输出说明配置成功：

```
Facilitator: Coinbase CDP
  ✓ CDP API Key ID: organiza...
  ℹ️  Mainnet mode - using Coinbase Developer Platform
  📊 Your endpoint will be listed in x402 Bazaar
```

## 常见错误

### 错误 1: CDP API keys not configured

```
⚠️  Warning: CDP API keys not configured for mainnet!
```

**解决:**
- 检查 `.env` 文件是否包含 `CDP_API_KEY_ID` 和 `CDP_API_KEY_SECRET`
- 确认 `NETWORK=base`

### 错误 2: 找不到 .env 文件

```bash
# 复制示例文件
cp env.x402.example .env
# 编辑填入你的配置
```

### 错误 3: API Key格式错误

确保 API Key Secret 包含完整的 PEM 格式：

```
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEI...多行内容...
-----END EC PRIVATE KEY-----
```

## 测试流程

### 测试网测试 (无需 API Keys)

```bash
# 1. 配置测试网
NETWORK=base-sepolia

# 2. 启动
npx tsx index-x402.ts

# 3. 测试
curl http://localhost:4021/health
```

### 主网部署 (需要 API Keys)

```bash
# 1. 获取 CDP API Keys
# 2. 配置主网
NETWORK=base
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...

# 3. 启动
npx tsx index-x402.ts

# 4. 验证 facilitator 配置
# 应该看到 "Facilitator: Coinbase CDP"
```

## 环境切换

### 从测试网切换到主网

```diff
# .env
- NETWORK=base-sepolia
+ NETWORK=base

+ CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
+ CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
+ ...
+ -----END EC PRIVATE KEY-----

# 更新合约地址为主网地址
- TOKEN_CONTRACT_ADDRESS=0x...(测试网)
+ TOKEN_CONTRACT_ADDRESS=0x...(主网)

- PAY_TO_ADDRESS=0x...(测试网)
+ PAY_TO_ADDRESS=0x...(主网)
```

## 检查清单

主网上线前：

- [ ] 已注册 CDP 账号
- [ ] 已创建项目
- [ ] 已生成 API Keys
- [ ] `.env` 中配置了 `CDP_API_KEY_ID`
- [ ] `.env` 中配置了 `CDP_API_KEY_SECRET`
- [ ] `NETWORK=base`
- [ ] 合约地址是主网地址
- [ ] 服务器私钥有 MINTER_ROLE
- [ ] 服务器地址有 ETH for gas
- [ ] 已在测试网测试通过

## 资源链接

- 获取 API Keys: https://portal.cdp.coinbase.com/
- CDP 文档: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
- 详细设置指南: [CDP_SETUP_GUIDE.md](../CDP_SETUP_GUIDE.md)

---

**需要帮助?** 查看完整指南: [CDP_SETUP_GUIDE.md](../CDP_SETUP_GUIDE.md)

