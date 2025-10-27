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
```

> **注意**: 私钥只用于签名，不需要钱包里有 USDC 或 ETH！

## 运行

### 方式 1: 使用测试脚本（推荐）

```bash
./test-x402.sh
```

选择实现：
1. x402-axios (Axios 拦截器)
2. x402-fetch (Fetch 包装器) - **默认**
3. 手动实现 (需要 USDC)

### 方式 2: 直接运行

```bash
# 默认 (x402-fetch)
npm start

# x402-fetch
npm run start:fetch

# x402-axios
npm run start:axios

# 手动实现 (需要 USDC)
npm run start:manual
```

## 实现方式

### 1. x402-fetch（默认，推荐）

**文件**: `index-x402-fetch.ts` (复制为 `index.ts`)

**特性**:
- ✅ 原生 fetch API
- ✅ 轻量级，最小依赖
- ✅ 自动处理 402 响应
- ✅ 不需要 USDC 或 gas

**使用**:
```typescript
import { wrapFetchWithPayment } from "x402-fetch";

const walletClient = createWalletClient({...}).extend(publicActions);
const fetchWithPayment = wrapFetchWithPayment(
  fetch, 
  walletClient as any,
  BigInt(1_500_000) // Max 1.5 USDC
);

const response = await fetchWithPayment(`${serverUrl}/mint`, {
  method: "POST",
  body: JSON.stringify({ payer: account.address }),
});
```

### 2. x402-axios

**文件**: `index-x402-standard.ts`

**特性**:
- ✅ Axios 拦截器
- ✅ 完整的 HTTP 客户端功能
- ✅ 自动处理 402 响应
- ✅ 不需要 USDC 或 gas

**使用**:
```typescript
import { withPaymentInterceptor } from "x402-axios";

const walletClient = createWalletClient({...}).extend(publicActions);
const axiosWithPayment = withPaymentInterceptor(
  axios.create(), 
  walletClient as any
);

const response = await axiosWithPayment.post(`${serverUrl}/mint`, {
  payer: account.address,
});
```

### 3. 手动实现（参考）

**文件**: `index-x402-working.ts`

**特性**:
- 完整控制整个流程
- 实际发送 USDC 交易
- ❌ 需要 USDC 余额
- ❌ 需要 gas 费用

**用途**: 学习 x402 协议原理，或需要实际转账的场景

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

| 特性 | x402 官方 | 手动实现 |
|------|-----------|----------|
| 需要 USDC | ❌ 不需要 | ✅ 需要 |
| 需要 gas | ❌ 不需要 | ✅ 需要 |
| 代码行数 | ~180 行 | ~315 行 |
| 响应时间 | ~250ms | 5-20秒 |
| 实现方式 | EIP-712签名 | USDC转账 |

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.ts` | 默认入口（x402-fetch） |
| `index-x402-fetch.ts` | x402-fetch 实现 ⭐ |
| `index-x402-standard.ts` | x402-axios 实现 ⭐ |
| `index-x402-working.ts` | 手动 USDC 转账实现（参考） |
| `test-x402.sh` | 交互式测试脚本 |
| `QUICK_START_X402.md` | 快速开始指南 |
| `X402_COINBASE_GUIDE.md` | 完整使用文档 |
| `X402_SUMMARY.md` | 实现总结 |

## 常见问题

### Q: 钱包需要有 USDC 吗？

**A: 不需要！** Coinbase 官方 x402 使用签名验证，不发送实际交易。

### Q: 需要支付 gas 费吗？

**A: 不需要！** 只签名，不上链。

### Q: 如何选择实现？

**A:**
- **x402-fetch**: 喜欢原生 API，追求轻量 ⭐
- **x402-axios**: 已使用 axios，需要拦截器
- **手动实现**: 学习协议原理，或需要实际转账

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
