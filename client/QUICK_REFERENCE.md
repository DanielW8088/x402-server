# Client 快速参考

## 🚀 5 分钟快速开始

```bash
# 1. 进入目录
cd client

# 2. 安装依赖（如未安装）
npm install

# 3. 配置环境
cp env.x402.example .env

# 4. 编辑 .env - 必须设置这些！
# PRIVATE_KEY=0x...
# TOKEN_ADDRESS=0x...
# SERVER_URL=http://localhost:4021
# NETWORK=base-sepolia

# 5. 运行
npm start
```

## 📋 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `PRIVATE_KEY` | ✅ | - | 签名用私钥（不需要 USDC/gas） |
| `TOKEN_ADDRESS` | ✅ | - | 要 mint 的 token 地址 |
| `SERVER_URL` | ❌ | `http://localhost:4021` | Server 地址 |
| `NETWORK` | ❌ | `base-sepolia` | `base-sepolia` 或 `base` |

## 🔍 获取 TOKEN_ADDRESS

```bash
# 方法 1: curl
curl http://localhost:4021/api/tokens | jq

# 方法 2: 浏览器
# 访问 http://localhost:4021/api/tokens

# 方法 3: 测试脚本
./test-example.sh  # 会自动显示可用 token
```

## 🛠️ 常用命令

```bash
# 方式 1: x402 协议 (无需 USDC/gas)
npm start

# 方式 2: 直接支付 USDC (需要 USDC/gas)
npm run start:direct

# 编译
npm run build

# 测试（交互式）
npm test

# 环境变量覆盖
TOKEN_ADDRESS=0xABC... npm start
```

## 📊 API 端点 (Server)

```bash
# 获取所有 token
GET /api/tokens

# 获取特定 token 信息
GET /api/tokens/:address

# Mint token (需要 x402 支付)
POST /api/mint/:address
  Body: { "payer": "0x..." }

# 查询队列状态
GET /api/queue/:queueId
```

## 🔄 响应类型

### 队列响应
```json
{
  "queueId": "uuid",
  "status": "pending",
  "position": 3
}
```

### 立即 Mint 响应
```json
{
  "payer": "0x...",
  "amount": "1000000000000000000",
  "mintTxHash": "0x...",
  "blockNumber": 12345
}
```

## ❌ 常见错误

### 1. Missing TOKEN_ADDRESS
```
❌ Missing TOKEN_ADDRESS in .env
```
**解决**: 在 .env 设置 `TOKEN_ADDRESS=0x...`

### 2. Failed to get token info
```
❌ Failed to get token info for 0x...
```
**解决**: 
- 检查 server 是否运行
- 检查 TOKEN_ADDRESS 是否有效
- 检查 SERVER_URL 是否正确

### 3. Connection refused
```
ECONNREFUSED 127.0.0.1:4021
```
**解决**: 启动 server (`cd ../server && npm start`)

### 4. Invalid network
```
Network mismatch
```
**解决**: 确保 client 和 server 的 NETWORK 一致

## 📦 代码示例

### 基础用法
```typescript
import { wrapFetchWithPayment } from "x402-fetch";

const fetchWithPayment = wrapFetchWithPayment(
  fetch,
  walletClient as any,
  BigInt(1_500_000)
);

const response = await fetchWithPayment(
  `${serverUrl}/api/mint/${tokenAddress}`,
  {
    method: "POST",
    body: JSON.stringify({ payer: address }),
  }
);
```

### 获取 Token 信息
```typescript
const tokenInfo = await fetch(
  `${serverUrl}/api/tokens/${tokenAddress}`
).then(r => r.json());

console.log(tokenInfo.name);        // "My Token"
console.log(tokenInfo.symbol);      // "MTK"
console.log(tokenInfo.price);       // "1 USDC"
console.log(tokenInfo.mintProgress); // "45.50%"
```

### 查询队列状态
```typescript
if (mintResult.queueId) {
  const status = await fetch(
    `${serverUrl}/api/queue/${mintResult.queueId}`
  ).then(r => r.json());
  
  console.log(status.status);   // "pending" | "processing" | "completed"
  console.log(status.mintTxHash); // 如果 completed
}
```

## 📚 完整文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 完整文档和特性介绍 |
| [USAGE.md](./USAGE.md) | 详细使用说明和 API 变更 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更历史 |
| [UPDATE_SUMMARY.md](./UPDATE_SUMMARY.md) | 本次更新总结 |
| [test-example.sh](./test-example.sh) | 交互式测试脚本 |

## 🔗 相关链接

- **Server**: `../server/README.md`
- **Frontend**: `../0x402.io/README.md`
- **x402 协议**: https://docs.cdp.coinbase.com/x402
- **x402-fetch**: https://www.npmjs.com/package/x402-fetch

## 💡 Tips

1. **不需要 USDC 或 gas** - x402 使用签名机制
2. **TOKEN_ADDRESS 很重要** - 必须是 server 上已部署的 token
3. **使用测试脚本** - `npm test` 提供交互式体验
4. **查看 server 日志** - 调试时很有用
5. **队列系统** - mint 可能被队列化，需要查询状态

## 📞 获取帮助

1. 查看 [USAGE.md](./USAGE.md) 详细说明
2. 运行 `./test-example.sh` 诊断配置问题
3. 检查 server 日志
4. 查看 [UPDATE_SUMMARY.md](./UPDATE_SUMMARY.md) 了解最新变更

