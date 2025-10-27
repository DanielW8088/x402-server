# Token Mint System

完整的代币 Mint 系统：用户支付 1 USDC 即可 mint 10,000 个代币。

**特点：** 不依赖本地 x402 包，使用标准库实现。

## 🎯 架构

```
User pays 1 USDC → Server verifies payment → Smart contract mints tokens to user
```

## ✨ 特性

- ✅ **独立运行**：不依赖本地 x402 包，使用标准库
- ✅ **链上验证**：直接验证 USDC 转账交易
- ✅ **防重放攻击**：使用交易 hash 防止重复 mint
- ✅ **访问控制**：使用 OpenZeppelin AccessControl
- ✅ **完整工具**：提供诊断、监控、测试工具
- ✅ **自动化客户端**：自动发送 USDC 并请求 mint

## 📦 项目结构

```
token-mint/
├── contracts/          # 智能合约
│   ├── contracts/
│   │   └── PAYX.sol   # ERC20 代币合约
│   ├── scripts/       # 部署和管理脚本
│   └── hardhat.config.js
│
├── server/            # Mint 服务器
│   ├── index.ts           # 主服务器
│   ├── checkPendingTx.ts  # 检查 pending 交易
│   ├── checkRole.ts       # 检查权限
│   ├── getAddress.ts      # 获取服务器地址
│   └── package.json
│
└── client/            # Mint 客户端
    ├── index.ts       # 自动化客户端
    ├── README.md      # 客户端文档
    ├── USAGE.md       # 使用指南
    └── package.json
```

## 🚀 快速开始

### 1. 部署合约

```bash
cd contracts
npm install

# 配置环境变量
cp .env.example .env
nano .env  # 添加 DEPLOYER_PRIVATE_KEY

# 部署到 Base Sepolia 测试网
npx hardhat run scripts/deployPAYX.js --network baseSepolia
```

记录合约地址，例如：`0x1009ca37fD2237249B5c9592e7979d62Bdc89706`

### 2. 配置服务器

```bash
cd server
npm install

# 创建环境配置
cat > .env << 'EOF'
SERVER_PRIVATE_KEY=0xYourPrivateKey
TOKEN_CONTRACT_ADDRESS=0xDeployedTokenAddress
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
PAY_TO_ADDRESS=0xYourPaymentAddress
NETWORK=base-sepolia
REQUIRED_PAYMENT_USDC=1
PORT=4021
EOF
```

### 3. 授予 MINTER_ROLE

```bash
cd contracts

# 配置 .env
echo "SERVER_ADDRESS=0xYourServerAddress" >> .env
echo "TOKEN_CONTRACT_ADDRESS=0xDeployedTokenAddress" >> .env

# 授权
npx hardhat run scripts/grantRole.js --network baseSepolia
```

### 4. 启动服务器

```bash
cd server

# 检查配置
npm run check:role  # 验证权限
npm run check       # 检查 pending 交易

# 启动
npm start
```

服务器将运行在 `http://localhost:4021`

### 5. 运行客户端

```bash
cd client
npm install

# 配置
cat > .env << 'EOF'
PRIVATE_KEY=0xYourPrivateKey
SERVER_URL=http://localhost:4021
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NETWORK=base-sepolia
PAYMENT_AMOUNT_USDC=1
EOF

# 运行
npm start
```

## 🔧 依赖包

### Server
- `express` - Web 框架
- `viem` - 以太坊交互
- `@coinbase/cdp-sdk` - Coinbase SDK
- `dotenv` - 环境变量

### Client
- `axios` - HTTP 客户端
- `viem` - 以太坊交互
- `dotenv` - 环境变量

**无本地 x402 包依赖！**

## 📡 API 端点

### POST `/mint`

Mint 代币到支付者地址。

**请求体：**
```json
{
  "paymentTxHash": "0x...",  // USDC 交易哈希
  "payer": "0x..."           // 支付者地址
}
```

**成功响应：**
```json
{
  "success": true,
  "message": "Tokens minted successfully",
  "payer": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2",
  "amount": "10000000000000000000000",
  "mintTxHash": "0xabc123...",
  "paymentTxHash": "0xdef456...",
  "blockNumber": "12345"
}
```

**错误响应：**
```json
{
  "error": "Maximum supply exceeded",
  "message": "Cannot mint more tokens, supply cap has been reached"
}
```

### GET `/info`

获取 mint 信息（无需支付）。

**响应：**
```json
{
  "price": "1 USDC",
  "tokensPerPayment": "10000000000000000000000",
  "maxSupply": "2000000000000000000000000000",
  "totalSupply": "1000010000000000000000000000",
  "remainingSupply": "999990000000000000000000000",
  "maxPossibleMints": "99999",
  "mintCount": "1",
  "maxMintCount": "100000",
  "mintProgress": "0.00%",
  "liquidityDeployed": false,
  "network": "base-sepolia",
  "tokenContract": "0x1009ca37fD2237249B5c9592e7979d62Bdc89706",
  "payTo": "0x130777e1166c89a9cd539f6e8ee86f5c615bcff7"
}
```

### GET `/health`

健康检查（无需支付）。

**响应：**
```json
{
  "status": "ok",
  "network": "base-sepolia",
  "tokenContract": "0x1009ca37fD2237249B5c9592e7979d62Bdc89706",
  "payTo": "0x130777e1166c89a9cd539f6e8ee86f5c615bcff7"
}
```

## 🔄 工作流程

### 自动化流程（使用客户端）

```bash
cd client
npm start
```

1. **获取服务器信息** - 查询 `/info` 获取配置
2. **发送 USDC** - 向 `payTo` 地址发送 1 USDC
3. **等待确认** - 等待 USDC 交易上链
4. **请求 Mint** - POST `/mint` 提供交易哈希
5. **接收代币** - 服务器验证并 mint 代币

### 手动流程

```bash
# 1. 使用钱包发送 1 USDC
# 到: 0x130777e1166c89a9cd539f6e8ee86f5c615bcff7
# USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

# 2. 记录交易哈希
TX_HASH="0xabc123..."

# 3. 调用 mint API
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d "{
    \"paymentTxHash\": \"$TX_HASH\",
    \"payer\": \"0xYourAddress\"
  }"
```

## 🛠 工具命令

### Server 工具

```bash
cd server

# 查看服务器地址
npm run address

# 检查 pending 交易
npm run check

# 检查 MINTER_ROLE 权限
npm run check:role

# 编译 TypeScript
npm run build

# 开发模式（自动重载）
npm run dev
```

### 测试命令

```bash
# 测试服务器 API
cd server
./testMint.sh

# 测试客户端
cd client
npm start
```

## 🔐 环境变量

### Server (.env)

| 变量 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `SERVER_PRIVATE_KEY` | ✅ | 服务器私钥（需要 MINTER_ROLE） | `0x...` |
| `TOKEN_CONTRACT_ADDRESS` | ✅ | 代币合约地址 | `0x1009...` |
| `PAY_TO_ADDRESS` | ✅ | 接收 USDC 的地址 | `0x1307...` |
| `USDC_CONTRACT_ADDRESS` | ⚠️ | USDC 合约地址（用于验证） | `0x036C...` |
| `NETWORK` | ❌ | 网络（默认 base-sepolia） | `base-sepolia` |
| `REQUIRED_PAYMENT_USDC` | ❌ | 所需 USDC 金额（默认 1） | `1` |
| `PORT` | ❌ | 服务器端口（默认 4021） | `4021` |

### Client (.env)

| 变量 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `PRIVATE_KEY` | ✅ | 你的私钥 | `0x...` |
| `SERVER_URL` | ❌ | 服务器地址 | `http://localhost:4021` |
| `USDC_CONTRACT_ADDRESS` | ⚠️ | USDC 合约地址 | `0x036C...` |
| `NETWORK` | ❌ | 网络 | `base-sepolia` |
| `PAYMENT_AMOUNT_USDC` | ❌ | 支付金额 | `1` |

## 🌐 支持的网络

### Base Sepolia (测试网)
- Network ID: `base-sepolia`
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- RPC: `https://sepolia.base.org`
- Explorer: https://sepolia.basescan.org
- Faucet: https://portal.cdp.coinbase.com/products/faucet

### Base Mainnet
- Network ID: `base`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- RPC: `https://mainnet.base.org`
- Explorer: https://basescan.org

## 📚 智能合约

### PAYX.sol

高级 ERC20 代币合约，特性：

- **访问控制**：使用 OpenZeppelin AccessControl
- **防重放**：通过 `hasMinted` 映射追踪已处理交易
- **供应量控制**：配置最大供应量和 mint 次数
- **Uniswap V4 集成**：自动部署流动性池
- **批量 Mint**：支持批量 mint 多个地址

**核心函数：**

```solidity
// Mint 代币
function mint(address to, bytes32 txHash) external onlyRole(MINTER_ROLE)

// 检查是否已 mint
function hasMinted(bytes32 txHash) public view returns (bool)

// 部署 Uniswap V4 流动性
function deployLiquidity() external onlyRole(DEFAULT_ADMIN_ROLE)
```

## 🔍 故障排除

### 端口被占用

```bash
lsof -ti:4021 | xargs kill -9
```

### Pending 交易卡住

```bash
cd server
npm run check
# 等待 pending 完成或查看 Basescan
```

### 权限错误

```bash
cd server
npm run check:role
# 如果没有 MINTER_ROLE，重新授权
```

### 余额不足

**服务器需要：**
- ETH（用于 gas）：至少 0.001 ETH

**客户端需要：**
- USDC：至少 1 USDC
- ETH（用于 gas）：至少 0.001 ETH

### 交易超时

交易可能仍在处理中：
1. 等待 1-2 分钟
2. 在 Basescan 上检查交易状态
3. 使用 `npm run check` 查看 pending 状态

## 📖 完整文档

- [QUICK_START.md](./QUICK_START.md) - 5分钟快速开始
- [CURRENT_STATUS.md](./CURRENT_STATUS.md) - 当前系统状态
- [server/README.md](./server/README.md) - 服务器详细文档
- [client/README.md](./client/README.md) - 客户端详细文档
- [client/USAGE.md](./client/USAGE.md) - 客户端使用指南
- [PROJECT_STATUS.md](./PROJECT_STATUS.md) - 项目完成状态

## 🎯 使用示例

### 示例 1：完整自动化

```bash
# Terminal 1 - 启动服务器
cd server && npm start

# Terminal 2 - 运行客户端（自动发送 USDC + mint）
cd client && npm start
```

### 示例 2：手动控制

```bash
# 1. 查看 mint 信息
curl http://localhost:4021/info

# 2. 使用 MetaMask 发送 1 USDC
# 到: payTo 地址
# 记录交易哈希

# 3. 手动请求 mint
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTxHash": "0xYourUSDCTransactionHash",
    "payer": "0xYourAddress"
  }'
```

## 🔒 安全考虑

1. **私钥管理**
   - 永远不要提交 `.env` 文件
   - 使用环境变量或密钥管理服务
   - 生产环境使用硬件钱包

2. **访问控制**
   - 只授予 MINTER_ROLE 给受信任地址
   - 定期审计权限

3. **支付验证**
   - 服务器验证链上 USDC 交易
   - 检查 Transfer 事件
   - 确认支付金额和接收地址

4. **防重放**
   - 合约自动防止重复 mint
   - 使用交易哈希作为唯一标识

## 🚀 生产部署

### 合约部署

1. 部署到 Base Mainnet
2. 在 Basescan 上验证合约
3. 授予服务器 MINTER_ROLE
4. 充分测试所有功能
5. 考虑添加 Pausable 功能

### 服务器部署

1. 使用环境变量管理密钥
2. 设置速率限制
3. 添加日志和监控
4. 使用 PM2 或 Docker
5. 配置反向代理（Nginx）
6. 启用 HTTPS

**使用 PM2：**
```bash
npm install -g pm2
cd server
pm2 start npm --name "token-mint-server" -- start
pm2 save
pm2 startup
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

## 🆘 获取帮助

### 检查清单

- [ ] 服务器在运行（`curl http://localhost:4021/health`）
- [ ] 服务器有 MINTER_ROLE（`npm run check:role`）
- [ ] 服务器有足够 ETH（`npm run check`）
- [ ] 客户端有 USDC 和 ETH
- [ ] 网络配置正确（服务器和客户端一致）
- [ ] 没有 pending 交易（`npm run check`）

### 常用命令

```bash
# 停止服务器
lsof -ti:4021 | xargs kill -9

# 检查状态
cd server && npm run check

# 查看日志
tail -f /tmp/server-new.log

# 测试 API
curl http://localhost:4021/info | python3 -m json.tool
```

## 📄 License

Apache-2.0

## 🔗 资源

- [Base Documentation](https://docs.base.org)
- [Viem Documentation](https://viem.sh)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Uniswap V4 Docs](https://docs.uniswap.org/contracts/v4/overview)

---

**享受 Minting！** 🎉
