# Token Mint Client

简化版的代币 Mint 客户端，不依赖本地 x402 包，直接使用标准库实现完整的支付和 mint 流程。

## 功能

- 自动发送 USDC 支付
- 调用服务器 API 进行 mint
- 完整的错误处理
- 余额检查和交易确认

## 工作流程

1. **获取服务器信息** - 查询服务器配置和代币信息
2. **发送 USDC 支付** - 向服务器指定地址发送 USDC
3. **请求 Mint** - 调用服务器 API，提供支付交易哈希
4. **接收代币** - 服务器验证支付后 mint 代币到你的地址

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
# 你的私钥（用于发送 USDC 和接收代币）
PRIVATE_KEY=0x...

# 服务器 URL
SERVER_URL=http://localhost:4021

# USDC 合约地址
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# 网络
NETWORK=base-sepolia

# 支付金额（USDC）
PAYMENT_AMOUNT_USDC=1
```

### 3. 确保有足够的 USDC

你的钱包需要有：
- 至少 1 USDC（或配置的支付金额）
- 少量 ETH 用于 gas

**Base Sepolia 测试网获取 USDC：**
- 从 Uniswap 测试网 swap 获取
- 或者从其他 DEX 获取测试 USDC

### 4. 运行客户端

```bash
npm start
```

## 使用示例

**完整流程：**

```bash
# 1. 确保服务器在运行
curl http://localhost:4021/health

# 2. 运行客户端
npm start
```

**输出示例：**

```
🚀 Token Mint Client
====================

Network: base-sepolia
Your address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
Server: http://localhost:4021

📋 Step 1: Getting server info...
   Token contract: 0x1234567890123456789012345678901234567890
   Pay to address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
   Tokens per payment: 10000
   Remaining supply: 990000

💰 Step 2: Sending 1 USDC payment...
💸 Sending 1 USDC to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2...
   Your USDC balance: 10.5 USDC
   Transaction hash: 0xabc123...
   Waiting for confirmation...
   ✅ USDC transfer confirmed at block 12345

🎨 Step 3: Minting tokens...
🎫 Requesting token mint from server...

✨ SUCCESS! Tokens minted!
============================
Payer: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
Amount: 10000 tokens
Payment TX: 0xabc123...
Mint TX: 0xdef456...
Block: 12346

🎉 All done!
```

## API 调用

客户端会调用服务器的以下端点：

### GET `/info` 或 `/health`

获取服务器信息：

```bash
curl http://localhost:4021/info
```

### POST `/mint`

请求 mint 代币：

```bash
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTxHash": "0xabc123...",
    "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2"
  }'
```

## 错误处理

客户端会处理以下错误情况：

### 余额不足

```
❌ Error: Insufficient USDC balance. You have 0.5 USDC but need 1 USDC

💡 Tip: Get USDC from a faucet or DEX
   Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

### 服务器错误

```
❌ Error: Request failed with status code 400
Server response: {
  error: "Maximum supply reached",
  remainingSupply: "0",
  message: "Cannot mint more tokens, supply cap has been reached"
}
```

### 交易失败

```
❌ Error: USDC transfer failed
```

## 手动 Mint（无 USDC 自动发送）

如果不配置 `USDC_CONTRACT_ADDRESS`，客户端会提示手动操作：

```
⚠️  USDC_CONTRACT_ADDRESS not configured in .env
   Please manually send USDC and provide the transaction hash.

   Send 1 USDC to: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
   Then run: curl -X POST http://localhost:4021/mint \
     -H "Content-Type: application/json" \
     -d '{"paymentTxHash": "0x...", "payer": "0x742d35..."}'
```

## 开发

```bash
# 安装依赖
npm install

# 运行客户端
npm start

# 编译 TypeScript
npm run build
```

## 配置说明

### 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `PRIVATE_KEY` | ✅ | - | 你的钱包私钥 |
| `SERVER_URL` | ❌ | `http://localhost:4021` | 服务器地址 |
| `USDC_CONTRACT_ADDRESS` | ⚠️ | - | USDC 合约地址（不配置则手动支付） |
| `NETWORK` | ❌ | `base-sepolia` | 网络（base-sepolia 或 base） |
| `PAYMENT_AMOUNT_USDC` | ❌ | `1` | 支付金额（USDC） |

### 网络配置

**Base Sepolia (测试网):**
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- RPC: `https://sepolia.base.org`

**Base Mainnet (主网):**
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- RPC: `https://mainnet.base.org`

## 依赖项

主要依赖：
- `axios` - HTTP 客户端
- `viem` - 以太坊交互库
- `dotenv` - 环境变量管理

## 安全注意事项

1. **私钥安全**：永远不要提交 `.env` 文件到 git
2. **测试网优先**：先在 Base Sepolia 测试
3. **余额检查**：确保有足够的 USDC 和 ETH
4. **服务器验证**：确保连接到正确的服务器地址

## 常见问题

### Q: 没有 USDC 怎么办？

**Base Sepolia 测试网：**
1. 从 [Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet) 获取 ETH
2. 在 Uniswap 或其他 DEX 上 swap ETH -> USDC

**Base Mainnet：**
1. 从交易所购买 USDC
2. 提现到 Base 网络

### Q: 交易卡住了怎么办？

检查：
1. 网络状态 - 是否连接正确的网络
2. Gas 价格 - 是否足够
3. 余额 - 是否有足够的 ETH 支付 gas

### Q: 如何查看我的代币余额？

```bash
# 使用 viem 或其他工具查询 ERC20 余额
cast balance --erc20 <TOKEN_ADDRESS> <YOUR_ADDRESS> --rpc-url https://sepolia.base.org
```

## 与原版的区别

**原版（使用 x402-axios）：**
- 集成 x402 支付协议
- 自动处理支付头和签名
- 使用 x402 facilitator 服务

**重构版（独立）：**
- 不依赖本地 x402 包
- 手动发送 USDC 交易
- 直接调用服务器 REST API
- 更直观的工作流程

## License

Apache-2.0

