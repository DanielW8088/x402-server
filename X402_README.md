# Token Mint with x402

> 使用 x402 协议的 Token Mint 系统 - 支付 USDC mint 代币

## ⚡ 快速测试

```bash
# 1. 启动 x402 服务器
cd server
npm install
npx tsx index-x402.ts

# 2. 使用传统客户端测试
cd ../client
npm install
npm start
```

**就这么简单！** ✅

**注意：** x402 协议为浏览器钱包设计。CLI 测试请使用传统客户端 `npm start`，不要用 `npm run start:x402`。详见 [TESTING_GUIDE.md](./TESTING_GUIDE.md)

## 🚀 快速开始

### 选择版本

本项目提供两种实现：

#### 1. x402 版本 (推荐) ⭐

使用 HTTP 402 协议和 Coinbase Facilitator

**优势:**
- ✅ 客户端无需发送链上交易
- ✅ 客户端无需支付 gas
- ✅ 代码简化 70%
- ✅ 标准化支付流程

**运行:**
```bash
# 服务器
cd server
npm install
tsx index-x402.ts

# 客户端
cd client
npm install
npm run start:x402
```

#### 2. 传统版本

使用私钥直接签名和验证链上交易

**场景:**
- 不使用 Facilitator
- 需要完全控制交易流程
- 学习和对比用途

**运行:**
```bash
# 服务器
cd server
npm install
tsx index.ts

# 客户端
cd client
npm install
npm start
```

## 📚 文档

| 文档 | 说明 |
|------|------|
| [X402_QUICKSTART.md](./X402_QUICKSTART.md) | 5 分钟快速启动指南 |
| [X402_IMPLEMENTATION_SUMMARY.md](./X402_IMPLEMENTATION_SUMMARY.md) | 实现总结和架构对比 |
| [X402_MIGRATION_GUIDE.md](./X402_MIGRATION_GUIDE.md) | 详细迁移指南 |

## 🎯 使用场景

### x402 版本适合

- ✅ 生产环境部署
- ✅ 需要标准化支付流程
- ✅ 希望简化代码和维护
- ✅ 客户端无 gas 费用需求
- ✅ 使用 Coinbase Facilitator

### 传统版本适合

- ✅ 学习区块链交互
- ✅ 不依赖第三方服务
- ✅ 需要完全控制交易
- ✅ 自定义支付验证逻辑

## 📦 依赖对比

### x402 版本

**服务器:**
```json
{
  "x402-express": "latest",
  "@coinbase/x402": "latest",
  "viem": "^2.21.54",
  "express": "^4.21.2"
}
```

**客户端:**
```json
{
  "@coinbase/x402": "latest",
  "viem": "^2.21.54",
  "axios": "^1.7.9"
}
```

### 传统版本

**服务器:**
```json
{
  "viem": "^2.21.54",
  "express": "^4.21.2",
  "better-sqlite3": "^12.4.1"
}
```

**客户端:**
```json
{
  "viem": "^2.21.54",
  "axios": "^1.7.9"
}
```

## 🔧 配置

### 环境变量

#### x402 版本

**服务器 (.env) - 测试网:**
```bash
NETWORK=base-sepolia          # 测试网
SERVER_PRIVATE_KEY=0x...      # 调用 mint 函数
TOKEN_CONTRACT_ADDRESS=0x...  # Token 合约
PAY_TO_ADDRESS=0x...          # 接收地址
REQUIRED_PAYMENT_USDC=1       # USDC 金额

# 测试网不需要 CDP API Keys
```

**服务器 (.env) - 主网:**
```bash
NETWORK=base                  # 主网
SERVER_PRIVATE_KEY=0x...      # 调用 mint 函数
TOKEN_CONTRACT_ADDRESS=0x...  # Token 合约（主网地址）
PAY_TO_ADDRESS=0x...          # 接收地址（主网地址）
REQUIRED_PAYMENT_USDC=1       # USDC 金额

# 主网必需 CDP API Keys
CDP_API_KEY_ID=organizations/xxx/apiKeys/xxx
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
```

**获取 CDP API Keys:**
- 访问: https://portal.cdp.coinbase.com/
- 详细步骤: [CDP_SETUP_GUIDE.md](./CDP_SETUP_GUIDE.md)

**客户端 (.env):**
```bash
PRIVATE_KEY=0x...             # 签名支付凭证
SERVER_URL=http://localhost:4021
NETWORK=base-sepolia
```

#### 传统版本

**服务器 (.env):**
```bash
SERVER_PRIVATE_KEY=0x...      # 调用 mint 和验证
TOKEN_CONTRACT_ADDRESS=0x...
USDC_CONTRACT_ADDRESS=0x...   # USDC 合约
PAY_TO_ADDRESS=0x...
NETWORK=base-sepolia
REQUIRED_PAYMENT_USDC=1
```

**客户端 (.env):**
```bash
PRIVATE_KEY=0x...             # 发送 USDC 交易
USDC_CONTRACT_ADDRESS=0x...   # USDC 合约
SERVER_URL=http://localhost:4021
NETWORK=base-sepolia
USE_GASLESS=false             # 或 true
```

## 📊 架构对比

### x402 版本

```
┌─────────┐           ┌─────────┐           ┌─────────────┐
│ 客户端   │  签名凭证  │ 服务器   │  验证支付  │ Facilitator │
│ (签名)   ├─────────>│ (mint)  ├─────────>│  (验证)      │
└─────────┘           └─────────┘           └─────────────┘
     ▲                                              │
     └──────────────── 支付确认 ────────────────────┘
```

**特点:**
- 客户端: 签名 EIP-712 支付凭证
- Facilitator: 验证支付
- 服务器: 只执行 mint

### 传统版本

```
┌─────────┐  USDC tx  ┌─────────┐
│ 客户端   ├─────────>│ 链上     │
│ (交易)   │           │ (USDC)  │
└────┬────┘           └─────────┘
     │                     ▲
     │  txHash             │ 验证
     ▼                     │
┌─────────┐           ┌───┴──────┐
│ 服务器   │  读取状态 │  服务器   │
│ (验证)   │<─────────┤  (mint)  │
└─────────┘           └──────────┘
```

**特点:**
- 客户端: 发送 USDC 到链上
- 服务器: 验证链上交易 + mint
- 复杂: 队列、监控、gas 加速

## 🧪 测试

### x402 版本测试

```bash
# 1. 启动服务器
cd server
tsx index-x402.ts

# 2. 测试健康检查
curl http://localhost:4021/health
# 期望: {"status": "ok", "protocol": "x402", ...}

# 3. 测试 402 响应
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{"payer": "0xYourAddress"}'
# 期望: 402 Payment Required + 支付指令

# 4. 运行客户端
cd client
npm run start:x402
# 期望: 成功 mint
```

### 传统版本测试

```bash
# 1. 启动服务器
cd server
tsx index.ts

# 2. 测试健康检查
curl http://localhost:4021/health

# 3. 运行客户端
cd client
npm start
# 期望: 发送 USDC → mint 成功
```

## 📈 性能对比

| 指标 | 传统版本 | x402 版本 |
|------|---------|-----------|
| 代码行数 | ~1,653 | ~500 |
| 客户端交易 | 1 USDC tx | 0 |
| 客户端 gas | ~0.0001 ETH | 0 |
| 响应时间 | 15-30s | 2-5s |
| 服务器复杂度 | 高 | 低 |
| 依赖数 | 多 | 少 |

## 🔒 安全性

### x402 版本

- ✅ 客户端私钥只用于签名（离链）
- ✅ Facilitator 验证支付
- ✅ 服务器验证签名和支付
- ✅ 标准化流程减少错误

### 传统版本

- ⚠️ 客户端需要 USDC 和 ETH
- ⚠️ 服务器需要验证链上交易
- ⚠️ 更多潜在失败点

## 🛠️ 开发

### 安装依赖

```bash
# x402 版本
cd server && npm install x402-express @coinbase/x402
cd client && npm install @coinbase/x402

# 传统版本
cd server && npm install
cd client && npm install
```

### 开发模式

```bash
# 服务器 (自动重启)
npm run dev

# 客户端
npm start        # 传统版本
npm run start:x402  # x402 版本
```

### 构建

```bash
npm run build
```

## 🌐 网络支持

### Base Sepolia (测试网)

- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Facilitator: `https://x402.org/facilitator`
- Faucet: [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet)

### Base (主网)

- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Facilitator: `@coinbase/x402`

## 📖 学习路径

1. **初学者** → 从传统版本开始，理解基本流程
2. **进阶** → 运行 x402 版本，体验简化流程
3. **对比** → 同时运行两个版本，理解差异
4. **生产** → 使用 x402 版本部署

## 🤝 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing`)
5. 开启 Pull Request

## 📝 许可证

MIT

## 🔗 链接

- [x402 Documentation](https://x402.gitbook.io/x402/)
- [Coinbase x402](https://github.com/coinbase/x402)
- [Base](https://base.org)
- [Viem](https://viem.sh)

## ❓ 支持

- 📖 阅读文档
- 💬 [x402 Discord](https://discord.gg/x402)
- 🐛 [GitHub Issues](https://github.com/coinbase/x402/issues)

## 🎉 致谢

- [Coinbase](https://coinbase.com) - x402 协议和 Facilitator
- [Base](https://base.org) - Layer 2 网络
- [Viem](https://viem.sh) - 以太坊库

---

**开始使用:** 运行 `npm run start:x402` 体验 x402 版本！

