# Token Mint Server

简化版的代币 Mint 服务器，不依赖 `x402-express` 包，直接使用 Express + Viem 实现。

## 功能

- ✅ 验证 USDC 支付交易
- ✅ 调用代币合约进行 mint
- ✅ 防止重复 mint
- ✅ 检查供应量上限
- ✅ **EIP-3009 免 gas 费 mint**（用户无需支付 gas）
- ✅ **SQLite 数据库持久化**（防止重启丢失数据）
- ✅ **Nonce 管理系统**（防止并发冲突）
- ✅ **并发请求支持**（多人同时 mint 不会失败）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

必需配置：

```bash
# 服务器私钥（需要有 MINTER_ROLE）
SERVER_PRIVATE_KEY=0x...

# 代币合约地址
TOKEN_CONTRACT_ADDRESS=0x...

# 接收 USDC 的地址
PAY_TO_ADDRESS=0x...

# USDC 合约地址
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# 网络
NETWORK=base-sepolia

# 要求的 USDC 支付金额
REQUIRED_PAYMENT_USDC=1
```

### 3. 编译并运行

```bash
# 编译 TypeScript
npm run build

# 运行服务器
npm start

# 或者开发模式（自动重载）
npm run dev
```

## API 端点

### POST `/mint`

传统模式：用户先支付 USDC，然后 mint 代币。

**请求体：**

```json
{
  "paymentTxHash": "0x...",  // USDC 转账交易哈希
  "payer": "0x..."           // 支付者地址
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "Tokens minted successfully",
  "payer": "0x...",
  "amount": "10000000000000000000000",
  "mintTxHash": "0x...",
  "paymentTxHash": "0x...",
  "blockNumber": "12345"
}
```

### POST `/mint-gasless` 🆓

**免 gas 费模式**：用户签名授权，服务器代付所有 gas 费。使用 EIP-3009 标准。

**请求体：**

```json
{
  "authorization": {
    "from": "0x...",           // 用户地址
    "to": "0x...",             // 接收 USDC 地址
    "value": "1000000",        // USDC 金额（6 decimals）
    "validAfter": "0",         // 有效期开始时间
    "validBefore": "1234567890", // 有效期结束时间
    "nonce": "0x...",          // 随机 nonce
    "signature": "0x..."       // EIP-712 签名
  }
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "Tokens minted successfully (gasless!)",
  "payer": "0x...",
  "amount": "10000000000000000000000",
  "mintTxHash": "0x...",
  "paymentTxHash": "0x...",
  "blockNumber": "12345",
  "gasless": true
}
```

**优势：**
- 用户完全免 gas 费
- 更好的用户体验
- 服务器控制交易时序

### GET `/health`

健康检查端点。

**响应示例：**

```json
{
  "status": "ok",
  "network": "base-sepolia",
  "tokenContract": "0x...",
  "payTo": "0x..."
}
```

### GET `/info`

获取 mint 信息。

**响应示例：**

```json
{
  "price": "1 USDC",
  "tokensPerPayment": "10000000000000000000000",
  "maxSupply": "1000000000000000000000000",
  "totalSupply": "50000000000000000000000",
  "remainingSupply": "950000000000000000000000",
  "maxPossibleMints": "95",
  "mintCount": "5",
  "maxMintCount": "100",
  "mintProgress": "5.00%",
  "liquidityDeployed": false,
  "liquidityDeployTrigger": "After 100 mints",
  "network": "base-sepolia",
  "tokenContract": "0x..."
}
```

## 使用流程

1. **用户发送 USDC**
   - 用户向 `PAY_TO_ADDRESS` 发送 USDC
   - 记录交易哈希

2. **调用 Mint API**
   ```bash
   curl -X POST http://localhost:4021/mint \
     -H "Content-Type: application/json" \
     -d '{
       "paymentTxHash": "0x123...",
       "payer": "0xabc..."
     }'
   ```

3. **接收代币**
   - 服务器验证 USDC 支付
   - 调用代币合约 mint
   - 代币发送到支付者地址

## 安全特性

- ✅ 验证 USDC 支付交易的真实性
- ✅ 检查支付金额是否足够
- ✅ 防止同一笔交易重复 mint
- ✅ 检查代币供应量上限
- ✅ 链上状态验证（hasMinted）

## 依赖项

主要依赖：
- `express` - Web 服务器框架
- `viem` - 以太坊交互库
- `@coinbase/cdp-sdk` - Coinbase Developer Platform SDK
- `dotenv` - 环境变量管理

## 开发

```bash
# 安装依赖
npm install

# 开发模式（自动重载）
npm run dev

# 编译 TypeScript
npm run build

# 运行编译后的代码
npm start

# 查看服务器地址
npm run address
```

## 与原版的区别

**原版（使用 x402-express）：**
- 集成 x402 支付协议
- 使用 payment middleware 自动处理支付
- 支持 x402 facilitator 服务
- 自动生成支付墙

**重构版（独立）：**
- 不依赖本地 x402 包
- 直接验证 USDC 链上交易
- 更简单的 API（需要手动提供交易哈希）
- 使用标准的 REST API

## 新特性：并发安全 & 数据库持久化

### Nonce 管理系统

服务器使用 **SQLite 数据库 + Nonce Manager** 来防止并发请求导致的 nonce 冲突。

**特性：**
- 🔒 **互斥锁**：同一时间只处理一个 gasless mint 请求
- 📊 **数据库追踪**：记录所有 pending 交易和已完成的 mint
- 🔄 **自动恢复**：服务器重启后从数据库恢复状态
- ⚡ **智能 nonce**：自动跳过 pending 的 nonce，防止冲突

**文档：**
- 📖 [Nonce Management](./NONCE_MANAGEMENT.md) - 详细技术文档
- 🧪 [Concurrent Test](./CONCURRENT_TEST.md) - 测试并发 mint

### 数据库

**位置：** `mint-server.db` (自动创建)

**表结构：**
- `pending_transactions` - 追踪所有区块链交易
- `processed_payments` - 记录完成的 mint（防止重复）

**查询示例：**
```bash
# 查看待处理交易
sqlite3 mint-server.db "SELECT * FROM pending_transactions WHERE status='pending';"

# 查看已完成的 mint
sqlite3 mint-server.db "SELECT COUNT(*) FROM processed_payments;"
```

## 注意事项

1. **服务器私钥安全**：确保 `SERVER_PRIVATE_KEY` 妥善保管
2. **MINTER_ROLE**：服务器地址必须有合约的 `MINTER_ROLE`
3. **Gas 费用**：服务器地址需要有足够的 ETH 支付 gas（gasless 模式服务器代付）
4. **USDC 地址**：确保使用正确网络的 USDC 合约地址
5. **数据库备份**：定期备份 `mint-server.db` 文件
6. **并发性能**：gasless mint 串行处理，吞吐量约 5-10 笔/分钟

## License

Apache-2.0

