# Token Mint 项目快速开始

完整的代币 Mint 系统，包含服务端和客户端，不依赖本地 x402 包。

## 项目结构

```
token-mint/
├── server/          # Mint 服务器
│   ├── index.ts     # 服务器主文件
│   ├── package.json
│   └── README.md
├── client/          # Mint 客户端
│   ├── index.ts     # 客户端主文件
│   ├── package.json
│   └── README.md
└── contracts/       # 智能合约
    ├── contracts/
    └── scripts/
```

## 🚀 5 分钟快速开始

### 1. 启动服务器

```bash
cd server
npm install

# 配置环境变量
cp .env.example .env
nano .env  # 填入配置

# 启动
npm start
```

服务器会在 `http://localhost:4021` 运行。

### 2. 运行客户端

```bash
cd client
npm install

# 配置环境变量
cp .env.example .env
nano .env  # 填入你的私钥

# 运行
npm start
```

客户端会：
1. 自动发送 USDC 支付
2. 调用服务器 mint
3. 显示 mint 结果

## 📋 完整部署流程

### Step 1: 部署合约

```bash
cd contracts
npm install

# 配置
cp .env.example .env
nano .env  # 填入 DEPLOYER_PRIVATE_KEY

# 部署
npm run deploy:payx
```

记录部署的合约地址。

### Step 2: 配置服务器

```bash
cd ../server

# 创建 .env
cat > .env << EOF
SERVER_PRIVATE_KEY=0xYourPrivateKey
TOKEN_CONTRACT_ADDRESS=0xDeployedTokenAddress
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
PAY_TO_ADDRESS=0xYourPaymentAddress
NETWORK=base-sepolia
REQUIRED_PAYMENT_USDC=1
PORT=4021
EOF

# 安装并启动
npm install
npm start
```

### Step 3: 授予 Minter 角色

```bash
cd ../contracts

# 在 .env 中配置
TOKEN_CONTRACT_ADDRESS=0xDeployedTokenAddress
SERVER_ADDRESS=0xServerAddress  # 从服务器启动日志中获取

# 授权
npm run grant:minter
```

### Step 4: 测试客户端

```bash
cd ../client

# 创建 .env
cat > .env << EOF
PRIVATE_KEY=0xYourPrivateKey
SERVER_URL=http://localhost:4021
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NETWORK=base-sepolia
PAYMENT_AMOUNT_USDC=1
EOF

# 安装并运行
npm install
npm start
```

## 🔧 环境变量配置

### Server 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `SERVER_PRIVATE_KEY` | ✅ | 服务器私钥（需要 MINTER_ROLE） |
| `TOKEN_CONTRACT_ADDRESS` | ✅ | 代币合约地址 |
| `PAY_TO_ADDRESS` | ✅ | 接收 USDC 的地址 |
| `USDC_CONTRACT_ADDRESS` | ⚠️ | USDC 合约地址（可选） |
| `NETWORK` | ❌ | base-sepolia 或 base |
| `REQUIRED_PAYMENT_USDC` | ❌ | 所需 USDC 金额 |
| `PORT` | ❌ | 服务器端口 |

### Client 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `PRIVATE_KEY` | ✅ | 你的私钥 |
| `SERVER_URL` | ❌ | 服务器地址 |
| `USDC_CONTRACT_ADDRESS` | ⚠️ | USDC 合约地址 |
| `NETWORK` | ❌ | base-sepolia 或 base |
| `PAYMENT_AMOUNT_USDC` | ❌ | 支付金额 |

## 📡 API 端点

### Server API

```bash
# 健康检查
GET /health

# 获取 mint 信息
GET /info

# Mint 代币
POST /mint
Body: {
  "paymentTxHash": "0x...",
  "payer": "0x..."
}
```

### 使用示例

```bash
# 查看服务器状态
curl http://localhost:4021/health

# 查看 mint 信息
curl http://localhost:4021/info

# Mint 代币
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTxHash": "0xabc123...",
    "payer": "0x742d35Cc..."
  }'
```

## 🎯 工作流程

```
1. 用户（客户端）
   ↓
2. 发送 USDC 到 PAY_TO_ADDRESS
   ↓
3. 获取交易哈希
   ↓
4. POST /mint 到服务器
   ↓
5. 服务器验证 USDC 支付
   ↓
6. 服务器调用合约 mint
   ↓
7. 代币发送到用户地址
```

## 📦 依赖包

两个项目使用相同的核心依赖：

- `viem` - 以太坊交互
- `express` - Web 框架（仅服务器）
- `axios` - HTTP 客户端（仅客户端）
- `dotenv` - 环境变量
- `@coinbase/cdp-sdk` - Coinbase SDK（可选）

**没有本地 x402 包依赖！**

## 🛠 开发命令

### Server

```bash
cd server

# 开发模式
npm run dev

# 编译
npm run build

# 启动
npm start

# 查看服务器地址
npm run address
```

### Client

```bash
cd client

# 运行
npm start

# 编译
npm run build
```

## 🧪 测试

### 测试网配置

**Base Sepolia:**
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- RPC: `https://sepolia.base.org`
- Explorer: https://sepolia.basescan.org
- Faucet: https://portal.cdp.coinbase.com/products/faucet

### 测试步骤

1. **获取测试币**
   ```bash
   # 从 faucet 获取 ETH
   # 在 Uniswap 上 swap ETH -> USDC
   ```

2. **启动服务器**
   ```bash
   cd server && npm start
   ```

3. **运行客户端**
   ```bash
   cd client && npm start
   ```

4. **验证结果**
   ```bash
   # 查看交易
   https://sepolia.basescan.org/tx/<TX_HASH>
   
   # 查看代币余额
   cast balance --erc20 <TOKEN_ADDRESS> <YOUR_ADDRESS>
   ```

## 🔍 故障排除

### Server 问题

**端口被占用：**
```bash
lsof -ti:4021 | xargs kill -9
```

**权限错误：**
- 确保 SERVER_PRIVATE_KEY 对应的地址有 MINTER_ROLE

**Gas 不足：**
- 给服务器地址发送一些 ETH

### Client 问题

**余额不足：**
- 确保有足够的 USDC 和 ETH

**连接失败：**
- 检查 SERVER_URL 是否正确
- 确保服务器在运行

**交易失败：**
- 检查网络配置
- 查看 Basescan 上的错误信息

## 📚 文档

- [Server README](./server/README.md) - 服务器详细文档
- [Client README](./client/README.md) - 客户端详细文档
- [Client USAGE](./client/USAGE.md) - 客户端使用指南
- [Contracts README](./contracts/README.md) - 合约文档

## 🔐 安全注意事项

1. ✅ 永远不要提交 `.env` 文件
2. ✅ 使用测试网测试
3. ✅ 妥善保管私钥
4. ✅ 生产环境使用硬件钱包
5. ✅ 定期审计合约代码

## 🚀 生产部署

### Server 部署

**使用 PM2：**
```bash
npm install -g pm2
cd server
pm2 start npm --name "token-mint-server" -- start
pm2 save
```

**使用 Docker：**
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### 监控

```bash
# PM2 监控
pm2 monit

# 日志
pm2 logs token-mint-server

# 重启
pm2 restart token-mint-server
```

## 📈 扩展功能

可以添加的功能：

1. **数据库持久化** - 保存 mint 记录
2. **Rate limiting** - 防止滥用
3. **Webhook 通知** - mint 成功后通知
4. **批量 mint** - 一次 mint 多个地址
5. **NFT 支持** - 扩展到 NFT mint
6. **多代币支持** - 支持 ETH、DAI 等支付

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 📄 License

Apache-2.0

---

**快速链接：**
- [Base Sepolia Explorer](https://sepolia.basescan.org)
- [Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)
- [Uniswap](https://app.uniswap.org)
- [Viem Docs](https://viem.sh)

