# x402 Token Mint Example

一个完整的x402支付集成示例：用户支付1 USDC即可mint 10,000个代币。

## 架构

```
User pays 1 USDC → x402 Server verifies payment → Smart contract mints 10,000 tokens to user
```

## 特性

- ✅ **简单集成**：一行代码添加支付中间件
- ✅ **防重放攻击**：使用USDC交易hash防止重复mint
- ✅ **Gasless**：用户只需签名，不需要支付gas
- ✅ **自动化**：支付成功后自动mint代币
- ✅ **安全**：使用OpenZeppelin AccessControl

## 项目结构

```
token-mint/
├── contracts/          # Smart contracts
│   ├── MintToken.sol  # ERC20 token with controlled minting
│   ├── scripts/       # Deployment scripts
│   └── hardhat.config.js
└── server/            # x402 payment server
    ├── index.ts       # Express server with x402 middleware
    └── package.json
```

## 快速开始

### 1. 部署合约

```bash
cd contracts
npm install
cp .env.example .env
# 编辑 .env 添加你的私钥

# 部署到Base Sepolia测试网
npm run deploy:sepolia

# 或部署到Base主网
npm run deploy:mainnet
```

记录下合约地址，例如：`0x1234...`

### 2. 授权服务器mint权限

使用Etherscan或脚本授权：

```javascript
// 你的服务器地址
const serverAddress = "0xYourServerAddress";

// 授权MINTER_ROLE
await token.grantRole(
  await token.MINTER_ROLE(),
  serverAddress
);
```

### 3. 启动服务器

```bash
cd server
npm install
cp .env.example .env
# 编辑 .env 配置：
# - PAY_TO_ADDRESS: 接收USDC的地址
# - SERVER_PRIVATE_KEY: 拥有MINTER_ROLE的私钥
# - TOKEN_CONTRACT_ADDRESS: 刚部署的合约地址

npm run dev
```

服务器将运行在 `http://localhost:4021`

### 4. 测试

```bash
# 查看信息
curl http://localhost:4021/info

# 健康检查
curl http://localhost:4021/health

# Mint代币 (需要x402客户端)
# 第一次请求会返回402，包含支付要求
curl -X POST http://localhost:4021/mint

# 使用x402客户端发送带支付的请求
# 查看 examples/typescript/clients/axios 了解客户端实现
```

## 智能合约

### MintToken.sol

简化的ERC20代币合约，特性：

- **批量mint**: `batchMint(address[] to, bytes32[] txHashes)`
- **单个mint**: `mint(address to, bytes32 txHash)`
- **防重放**: 使用`hasMinted`映射追踪已处理的交易hash
- **访问控制**: 只有`MINTER_ROLE`可以mint
- **可配置**: 构造函数设置mint数量和最大mint次数

```solidity
constructor(
    string memory name,      // 代币名称，如 "MyToken"
    string memory symbol,    // 代币符号，如 "MTK"
    uint256 _mintAmount,     // 每次mint数量，如 10000 * 10^18
    uint256 _maxMintCount    // 最大mint次数，0 = 无限
)
```

## 服务端

### 核心流程

1. **x402中间件**验证1 USDC支付
2. 从`X-PAYMENT-RESPONSE`头获取USDC交易hash和付款人地址
3. 调用合约的`mint()`函数
4. 返回mint结果给用户

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `FACILITATOR_URL` | x402 facilitator服务 | `https://x402.org/facilitator` |
| `PAY_TO_ADDRESS` | 接收USDC的地址 | `0x123...` |
| `SERVER_PRIVATE_KEY` | 服务器私钥(有MINTER_ROLE) | `0xabc...` |
| `TOKEN_CONTRACT_ADDRESS` | 代币合约地址 | `0x456...` |
| `NETWORK` | 网络 | `base-sepolia` 或 `base` |
| `PORT` | 服务器端口 | `4021` |

## API端点

### POST /mint

支付1 USDC mint代币

**请求头**:
- `X-PAYMENT`: Base64编码的支付payload (由x402客户端自动添加)

**成功响应** (200):
```json
{
  "success": true,
  "message": "Tokens minted successfully",
  "payer": "0x857b...",
  "amount": "10000000000000000000000",
  "mintTxHash": "0xabc...",
  "usdcTxHash": "0xdef...",
  "blockNumber": "12345"
}
```

**失败响应** (402):
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [...]
}
```

### GET /info

获取mint信息 (无需支付)

```json
{
  "price": "1 USDC",
  "tokensPerPayment": "10000000000000000000000",
  "network": "base-sepolia",
  "tokenContract": "0x123..."
}
```

### GET /health

健康检查 (无需支付)

```json
{
  "status": "ok",
  "network": "base-sepolia",
  "tokenContract": "0x123...",
  "payTo": "0x456..."
}
```

## x402协议集成

这个示例展示了如何将x402支付协议集成到你的应用：

```typescript
import { paymentMiddleware } from "x402-express";

app.use(
  paymentMiddleware(
    payTo,                    // 接收USDC的地址
    {
      "POST /mint": {
        price: "$1",          // 1 USDC
        network: "base-sepolia",
        config: {
          description: "Mint 10,000 tokens for 1 USDC",
        },
      },
    },
    { url: facilitatorUrl }   // Facilitator服务
  ),
);
```

就这么简单！中间件会自动处理：
- 返回402状态码和支付要求
- 验证支付签名
- 调用facilitator结算支付
- 设置`X-PAYMENT-RESPONSE`响应头

## 客户端集成

查看 `examples/typescript/clients/` 了解如何创建支付客户端：

```typescript
import { x402Axios } from "x402-axios";

const client = x402Axios({
  facilitatorUrl: "https://x402.org/facilitator",
  privateKey: process.env.PRIVATE_KEY,
});

// 自动处理支付流程
const response = await client.post("http://localhost:4021/mint");
console.log(response.data); // Mint成功信息
```

## 安全考虑

1. **私钥管理**：永远不要提交`.env`文件，使用环境变量或密钥管理服务
2. **MINTER_ROLE**：只授权给受信任的服务器地址
3. **重放保护**：合约自动防止使用相同txHash重复mint
4. **金额验证**：x402中间件自动验证支付金额 ≥ 要求金额

## 自定义

### 修改mint数量

编辑 `contracts/scripts/deploy.js`:

```javascript
const MINT_AMOUNT = hre.ethers.parseEther("50000"); // 50,000代币
```

### 修改价格

编辑 `server/index.ts`:

```typescript
{
  "POST /mint": {
    price: "$5",  // 5 USDC
    // ...
  }
}
```

### 添加最大mint限制

编辑 `contracts/scripts/deploy.js`:

```javascript
const MAX_MINT_COUNT = 10000; // 最多mint 10,000次
```

## 生产部署

### 合约
1. 部署到Base主网: `npm run deploy:mainnet`
2. 在Basescan上验证合约
3. 授予服务器地址MINTER_ROLE
4. 测试所有功能
5. 考虑添加Pausable功能以应对紧急情况

### 服务器
1. 使用环境变量管理密钥 (不要硬编码)
2. 设置速率限制防止滥用
3. 添加日志和监控
4. 使用反向代理 (如Nginx)
5. 启用HTTPS
6. 考虑使用多个facilitator节点

## 支持的网络

- **Base Sepolia** (测试网): `base-sepolia`
- **Base Mainnet**: `base`

可以通过`NETWORK`环境变量切换。

## 故障排除

### "Missing required environment variables"
检查`.env`文件是否包含所有必需变量。

### "Unable to find matching payment requirements"
确保客户端和服务器使用相同的网络。

### "Tokens already minted for this payment"
这是正常的防重放保护，该USDC交易已经mint过了。

### 合约部署失败
- 检查私钥是否有足够的ETH支付gas
- 检查RPC URL是否正确
- 确保使用正确的网络

## 资源

- [x402 Protocol](https://x402.org)
- [x402 GitHub](https://github.com/coinbase/x402)
- [Base Documentation](https://docs.base.org)
- [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)

## License

MIT

