# x402 Token Mint Client

基于 Coinbase 官方 x402 协议的代币 Mint 客户端。

## 🚀 快速开始

查看 [QUICK_START_X402.md](./QUICK_START_X402.md) 获取 5 分钟快速上手指南。

## 特性

✅ **Coinbase 官方 x402 实现**
- `x402-fetch` - 原生 fetch API 包装器（默认）
- `x402-axios` - Axios 拦截器
- 自动处理 402 响应和支付流程

⚡ **无需 USDC，无需 gas**
- 只需签名，不发送链上交易
- 使用 EIP-712 签名验证
- Facilitator 验证支付

📚 **完整文档**
- [QUICK_START_X402.md](./QUICK_START_X402.md) - 快速开始
- [X402_COINBASE_GUIDE.md](./X402_COINBASE_GUIDE.md) - 完整指南
- [X402_SUMMARY.md](./X402_SUMMARY.md) - 实现总结

## 安装

```bash
npm install
```

## 配置

复制环境变量模板：

```bash
cp env.x402.example .env
```

编辑 `.env`:

```bash
NETWORK=base-sepolia              # 或 base
PRIVATE_KEY=0x...                 # 你的私钥（仅用于签名）
SERVER_URL=http://localhost:4021  # 服务端地址
TOKEN_ADDRESS=0x...               # 要 mint 的代币合约地址
```

> **注意**: 
> - 私钥只用于签名，不需要钱包里有 USDC 或 ETH！
> - TOKEN_ADDRESS 从服务端的代币列表获取（访问 `GET /api/tokens`）

## 运行

**重要**: 确保先设置 `TOKEN_ADDRESS` 环境变量！

```bash
# 方式 1: x402 协议 (无需 USDC 和 gas)
npm start

# 方式 2: 直接支付 USDC (需要 USDC 和 gas)
npm run start:direct

# 或使用环境变量覆盖
TOKEN_ADDRESS=0x... npm start
```

## 实现方式

### 方式 1: x402 协议（推荐）

**文件**: `index.ts`  
**命令**: `npm start`

**特性**:
- ✅ 无需 USDC 余额
- ✅ 无需 gas 费用
- ✅ 快速 (~1秒)
- ✅ 使用 EIP-712 签名

**使用**:
```typescript
import { wrapFetchWithPayment } from "x402-fetch";

const fetchWithPayment = wrapFetchWithPayment(
  fetch, 
  walletClient as any,
  BigInt(1_500_000)
);

const response = await fetchWithPayment(`${serverUrl}/api/mint/${tokenAddress}`, {
  method: "POST",
  body: JSON.stringify({ payer: account.address }),
});
```

### 方式 2: 直接支付 USDC

**文件**: `index-direct-payment.ts`  
**命令**: `npm run start:direct`

**特性**:
- ⚠️ 需要 USDC 余额
- ⚠️ 需要 gas 费用 (ETH)
- 🐢 较慢 (~5秒，等待确认)
- ✅ 传统链上支付

**使用**:
```typescript
// 1. 转账 USDC
const hash = await walletClient.writeContract({
  address: USDC_ADDRESS,
  abi: usdcAbi,
  functionName: "transfer",
  args: [tokenAddress, amount],
});

// 2. 请求 mint
const response = await axios.post(`${serverUrl}/api/mint/${tokenAddress}`, {
  payer: account.address,
  paymentTxHash: hash,
});
```

**详细文档**: 查看 [DIRECT_PAYMENT_GUIDE.md](./DIRECT_PAYMENT_GUIDE.md)

## 工作流程

```
客户端请求
    ↓
x402 拦截/包装
    ↓
检测到 402
    ↓
自动签名 (EIP-712)
    ↓
自动重试 + X-PAYMENT
    ↓
服务端验证
    ↓
返回资源
```

**时间**: < 1 秒  
**成本**: $0

## 对比

| 特性 | x402 协议 | 直接支付 USDC |
|------|-----------|---------------|
| 命令 | `npm start` | `npm run start:direct` |
| 需要 USDC | ❌ 不需要 | ✅ 需要 |
| 需要 gas | ❌ 不需要 | ✅ 需要 |
| 速度 | 快 (~1秒) | 慢 (~5秒) |
| 成本 | $0 | Gas 费 (~$0.01-0.05) |
| 链上交易 | 0 笔 | 1 笔 |
| 实现方式 | EIP-712 签名 | USDC 转账 |
| 适用场景 | 测试、开发 | 生产、传统流程 |

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.ts` | x402 协议实现 (推荐) |
| `index-direct-payment.ts` | 直接支付 USDC 实现 |
| `package.json` | 依赖配置 |
| `env.x402.example` | 环境变量模板 |
| `README.md` | 完整文档 |
| `USAGE.md` | 使用说明（包含 API 变更） ⭐ |
| `DIRECT_PAYMENT_GUIDE.md` | 直接支付指南 ⭐ |
| `QUICK_REFERENCE.md` | 快速参考 |

## 常见问题

### Q: 钱包需要有 USDC 吗？

**A: 不需要！** Coinbase 官方 x402 使用签名验证，不发送实际交易。

### Q: 需要支付 gas 费吗？

**A: 不需要！** 只签名，不上链。

### Q: 需要 TOKEN_ADDRESS 了吗？

**A: 是的！** Server 现在是多 token 系统，必须指定要 mint 的 token。从 `GET /api/tokens` 获取可用地址。详见 [USAGE.md](./USAGE.md)

### Q: x402 和直接支付哪个好？

**A:** 
- **x402** (`npm start`): 测试、开发、无成本 ✅
- **直接支付** (`npm run start:direct`): 需要链上记录、传统流程

详见 [DIRECT_PAYMENT_GUIDE.md](./DIRECT_PAYMENT_GUIDE.md)

### Q: 出现 TypeScript 错误？

**A:** 使用 `as any` 类型断言绕过 viem/x402 兼容性问题：
```typescript
walletClient as any
```

## 调试

查看服务端日志：
```bash
cd ../server
npm start
# 查看 🎨 POST /mint received 等日志
```

查看支付响应：
```typescript
const paymentResponse = response.headers.get("x-payment-response");
console.log('Payment:', decodeXPaymentResponse(paymentResponse));
```

## 技术栈

- `x402-fetch` ^0.6.6 - Fetch 包装器
- `x402-axios` ^0.6.6 - Axios 拦截器
- `@coinbase/x402` ^0.6.6 - 核心库
- `viem` ^2.38.4 - 以太坊交互
- `axios` ^1.7.9 - HTTP 客户端

## 参考资源

- 📖 [Coinbase x402 文档](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- 📦 [x402-fetch npm](https://www.npmjs.com/package/x402-fetch)
- 📦 [x402-axios npm](https://www.npmjs.com/package/x402-axios)
- 💬 [CDP Discord](https://discord.gg/cdp)

## License

Apache-2.0
