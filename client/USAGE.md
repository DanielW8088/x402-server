# Client 使用说明

## ⚠️ 重要更新

Client 已更新以支持 Server 的**多 Token 系统**。现在需要指定要 mint 的 token 地址。

## 快速开始

### 1. 安装依赖

```bash
cd client
npm install
```

### 2. 配置环境变量

```bash
cp env.x402.example .env
```

编辑 `.env` 文件：

```bash
# 网络 (base-sepolia 或 base)
NETWORK=base-sepolia

# 你的私钥 (仅用于签名，不需要 gas 或 USDC)
PRIVATE_KEY=0x...

# Server 地址
SERVER_URL=http://localhost:4021

# Token 合约地址 (必填!)
TOKEN_ADDRESS=0x...
```

### 3. 获取 Token 地址

从 server 获取可用的 token 列表：

```bash
curl http://localhost:4021/api/tokens
```

或在浏览器访问: `http://localhost:4021/api/tokens`

选择一个 token 的地址，填入 `.env` 的 `TOKEN_ADDRESS`。

### 4. 运行

```bash
npm start
```

## API 变更

### 旧版 (单 Token)

```typescript
// 旧: 固定的单个 token
GET /info                 → ❌ 已移除
POST /mint                → ❌ 已移除
```

### 新版 (多 Token)

```typescript
// 新: 支持多个 token
GET /api/tokens                 → 获取所有 token
GET /api/tokens/:address        → 获取特定 token 信息
POST /api/mint/:address         → Mint 特定 token
GET /api/queue/:queueId         → 查询队列状态
```

## 完整示例

```typescript
import { wrapFetchWithPayment } from "x402-fetch";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Setup
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
}).extend(publicActions);

// 1. 获取 token 信息
const tokenInfo = await fetch(
  `${serverUrl}/api/tokens/${tokenAddress}`
).then(r => r.json());

console.log('Token:', tokenInfo.name);
console.log('Price:', tokenInfo.price);
console.log('Remaining:', tokenInfo.remainingSupply);

// 2. Mint with x402
const fetchWithPayment = wrapFetchWithPayment(
  fetch, 
  walletClient as any,
  BigInt(1_500_000) // Max 1.5 USDC
);

const response = await fetchWithPayment(
  `${serverUrl}/api/mint/${tokenAddress}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payer: account.address }),
  }
);

const result = await response.json();

// 3. 处理结果
if (result.queueId) {
  // 队列模式
  console.log('Queued! ID:', result.queueId);
  console.log('Check status:', `${serverUrl}/api/queue/${result.queueId}`);
} else {
  // 立即 mint
  console.log('Minted!');
  console.log('TX:', result.mintTxHash);
  console.log('Amount:', result.amount);
}
```

## 常见问题

### Q: TOKEN_ADDRESS 从哪里获取？

访问 server 的 `/api/tokens` 端点查看所有已部署的 token：

```bash
curl http://localhost:4021/api/tokens | jq
```

### Q: 为什么需要 TOKEN_ADDRESS？

Server 现在支持部署和管理多个 token。每个 token 都有独立的：
- 价格配置
- 供应量
- Logo 和元数据
- Mint 统计

### Q: 能否使用命令行参数传入 TOKEN_ADDRESS？

当前版本从环境变量读取。如需命令行参数，可以这样运行：

```bash
TOKEN_ADDRESS=0x123... npm start
```

### Q: 老的 /mint 端点还能用吗？

不能。Server 已完全迁移到多 token 架构。必须使用 `/api/mint/:address`。

## 依赖版本

确保使用最新版本：

- `x402-fetch` ^0.6.6
- `x402-axios` ^0.6.6  
- `@coinbase/x402` ^0.6.6
- `viem` ^2.38.4

## 相关文档

- [README.md](./README.md) - 完整文档
- [env.x402.example](./env.x402.example) - 配置模板
- [../server/README.md](../server/README.md) - Server 文档

