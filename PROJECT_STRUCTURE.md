# Project Structure

```
token-mint/
├── README.md                    # 完整文档
├── QUICKSTART.md               # 5分钟快速启动指南
├── ARCHITECTURE.md             # 架构详解
├── PROJECT_STRUCTURE.md        # 本文件
├── .gitignore
│
├── contracts/                  # 智能合约
│   ├── MintToken.sol          # 主合约
│   ├── hardhat.config.js      # Hardhat配置
│   ├── package.json
│   ├── .env.example
│   └── scripts/
│       ├── deploy.js          # 部署脚本
│       ├── grantRole.js       # 授权MINTER_ROLE
│       └── checkStatus.js     # 检查合约状态
│
├── server/                     # x402支付服务器
│   ├── index.ts               # Express服务器 + x402中间件
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
└── client/                     # 测试客户端
    ├── index.ts               # x402客户端示例
    ├── package.json
    ├── tsconfig.json
    └── .env.example
```

## 文件说明

### 合约 (contracts/)

#### `MintToken.sol`
简化的ERC20代币合约，核心功能：
- ERC20标准实现 (OpenZeppelin)
- `mint()` / `batchMint()` - 铸造代币
- `hasMinted` - 防重放映射
- AccessControl - 角色管理

**关键点**:
- 每次支付mint固定数量代币 (构造函数设置)
- 使用USDC交易hash防止重复mint
- 只有MINTER_ROLE可以调用mint

#### `scripts/deploy.js`
合约部署脚本，配置项：
```javascript
const TOKEN_NAME = "Your Token Name";
const TOKEN_SYMBOL = "YTN";
const MINT_AMOUNT = hre.ethers.parseEther("10000");
const MAX_MINT_COUNT = 0; // 0 = unlimited
```

运行: `npm run deploy:sepolia`

#### `scripts/grantRole.js`
授权服务器地址MINTER_ROLE
```bash
export TOKEN_CONTRACT_ADDRESS=0x123...
export SERVER_ADDRESS=0xabc...
npm run grant:sepolia
```

#### `scripts/checkStatus.js`
检查合约状态：
- Token信息 (name, symbol, totalSupply)
- Mint配置 (mintAmount, maxMintCount, mintCount)
- 角色信息 (owner, 是否有MINTER_ROLE)

运行: `npm run status:sepolia`

### 服务器 (server/)

#### `index.ts`
Express + x402集成，核心逻辑：

1. **x402中间件** - 自动处理支付
```typescript
app.use(paymentMiddleware(payTo, {
  "POST /mint": {
    price: "$1",
    network: "base-sepolia"
  }
}));
```

2. **Mint端点** - 在支付后mint代币
```typescript
app.post("/mint", async (req, res) => {
  // 获取支付信息
  const { transaction, payer } = decodePaymentResponse(req);
  
  // 检查是否已mint
  // 调用合约mint
  // 返回结果
});
```

3. **信息端点** (无需支付)
- `GET /health` - 健康检查
- `GET /info` - 获取mint信息

#### 环境变量 (.env)
```
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=0x...              # 接收USDC
SERVER_PRIVATE_KEY=0x...          # 有MINTER_ROLE的私钥
TOKEN_CONTRACT_ADDRESS=0x...      # 合约地址
NETWORK=base-sepolia
PORT=4021
```

### 客户端 (client/)

#### `index.ts`
使用x402-axios的测试客户端，演示：
1. 获取服务器信息 (GET /info)
2. 支付并mint代币 (POST /mint)
3. 显示支付和mint交易hash

#### 环境变量 (.env)
```
SERVER_URL=http://localhost:4021
PRIVATE_KEY=0x...                 # 客户端私钥 (有USDC的账户)
FACILITATOR_URL=https://x402.org/facilitator
```

## 工作流程

### 开发流程

```bash
# 1. 部署合约
cd contracts && npm install
npm run deploy:sepolia
# 记录合约地址: 0x123...

# 2. 授权服务器
export TOKEN_CONTRACT_ADDRESS=0x123...
export SERVER_ADDRESS=0xServerAddress
npm run grant:sepolia

# 3. 启动服务器
cd ../server && npm install
# 配置.env
npm run dev

# 4. 测试客户端
cd ../client && npm install
# 配置.env
npm start
```

### 生产部署

```bash
# 1. 部署到主网
cd contracts
npm run deploy:mainnet

# 2. 授权服务器
npm run grant:mainnet

# 3. 验证合约
npm run verify -- <address> <args...>

# 4. 更新服务器配置
cd ../server
# 更新.env: NETWORK=base
npm start

# 5. 监控
npm run status:mainnet
```

## 依赖关系

### Contracts
```json
{
  "@openzeppelin/contracts": "^5.4.0",    // ERC20, AccessControl
  "hardhat": "^2.22.0",                    // 开发框架
  "@nomicfoundation/hardhat-toolbox": "^5.0.0"
}
```

### Server
```json
{
  "x402-express": "workspace:*",  // x402中间件
  "express": "^4.21.2",           // Web框架
  "viem": "^2.21.54",             // 以太坊交互
  "dotenv": "^16.4.7"             // 环境变量
}
```

### Client
```json
{
  "x402-axios": "workspace:*",    // x402客户端
  "dotenv": "^16.4.7"
}
```

## 配置说明

### 修改Mint数量

**合约**: `contracts/scripts/deploy.js`
```javascript
const MINT_AMOUNT = hre.ethers.parseEther("50000"); // 改为50,000
```

### 修改价格

**服务器**: `server/index.ts`
```typescript
{
  "POST /mint": {
    price: "$5",  // 改为5 USDC
    // ...
  }
}
```

### 添加最大Mint限制

**合约**: `contracts/scripts/deploy.js`
```javascript
const MAX_MINT_COUNT = 10000; // 最多10,000次
```

### 切换网络

**所有.env文件**:
```
NETWORK=base  # base-sepolia -> base
```

## 脚本命令

### Contracts
```bash
npm run compile          # 编译合约
npm run deploy:sepolia   # 部署到测试网
npm run deploy:mainnet   # 部署到主网
npm run grant:sepolia    # 授权MINTER_ROLE (测试网)
npm run grant:mainnet    # 授权MINTER_ROLE (主网)
npm run status:sepolia   # 检查状态 (测试网)
npm run status:mainnet   # 检查状态 (主网)
npm run verify           # 验证合约
```

### Server
```bash
npm run dev    # 开发模式 (热重载)
npm start      # 生产模式
npm run build  # 编译TypeScript
```

### Client
```bash
npm start      # 运行客户端
```

## 端口

- Server: `4021` (可通过PORT环境变量修改)
- Client: 连接到SERVER_URL

## 网络支持

### 测试网
- **Base Sepolia**: Chain ID 84532
  - RPC: https://sepolia.base.org
  - Explorer: https://sepolia.basescan.org
  - Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

### 主网
- **Base**: Chain ID 8453
  - RPC: https://mainnet.base.org
  - Explorer: https://basescan.org

## 代币配置

### USDC地址
- Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

x402中间件自动使用正确的USDC地址（基于network配置）。

## 安全检查清单

部署前检查：

- [ ] 合约已审计
- [ ] 环境变量不在版本控制中
- [ ] 私钥安全存储
- [ ] 测试网完整测试
- [ ] 设置速率限制
- [ ] 配置监控和告警
- [ ] 备份部署者私钥
- [ ] 文档化恢复流程

## 故障排除

### 常见问题

1. **"Missing required environment variables"**
   → 检查.env文件

2. **"insufficient funds for gas"**
   → 部署者地址需要ETH

3. **"Unable to find matching payment requirements"**
   → 客户端和服务器网络不匹配

4. **"Tokens already minted for this payment"**
   → 正常，防重放保护

5. **合约调用失败**
   → 确保服务器有MINTER_ROLE: `npm run status:sepolia`

### 调试

启用详细日志:
```typescript
// server/index.ts
console.log("Payment received:", decoded);
console.log("Minting to:", payer);
console.log("Mint tx:", hash);
```

检查facilitator状态:
```bash
curl https://x402.org/facilitator/supported
```

## 更多资源

- [完整文档](./README.md)
- [快速启动](./QUICKSTART.md)  
- [架构详解](./ARCHITECTURE.md)
- [x402协议](https://x402.org)
- [Base文档](https://docs.base.org)

