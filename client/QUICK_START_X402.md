# x402 快速开始指南

## 5分钟快速上手

### 1. 安装依赖

```bash
npm install
```

已安装的x402包：
- ✅ `x402-axios` - Axios拦截器
- ✅ `x402-fetch` - Fetch包装器
- ✅ `@coinbase/x402` - 核心库

### 2. 配置环境

```bash
cp env.x402.example .env
```

编辑 `.env`:

```bash
NETWORK=base-sepolia
PRIVATE_KEY=0x...        # 你的私钥
SERVER_URL=http://localhost:4021
```

> **注意**: 使用Coinbase官方x402，**不需要**钱包里有USDC或ETH！

### 3. 运行测试

**方式1 - 使用测试脚本** (推荐):

```bash
./test-x402.sh
```

**方式2 - 直接运行**:

```bash
# x402-axios (推荐)
npm run start:x402-standard

# x402-fetch
npm run start:x402-fetch

# 手动实现 (需要USDC)
npm run start:x402
```

## 代码示例

### x402-axios (推荐)

```typescript
import { withPaymentInterceptor } from "x402-axios";
import axios from "axios";

// 创建带支付拦截器的axios实例
const axiosClient = axios.create();
const client = withPaymentInterceptor(axiosClient, account);

// 正常调用API，自动处理402支付
const response = await client.post(`${serverUrl}/mint`, {
  payer: account.address,
});
```

**特性**:
- ✅ 自动拦截402响应
- ✅ 自动创建支付证明
- ✅ 自动重试请求
- ✅ 支持所有axios功能

### x402-fetch

```typescript
import { wrapFetchWithPayment } from "x402-fetch";

// 包装原生fetch
const fetchWithPayment = wrapFetchWithPayment(fetch, account);

// 使用fetch API，自动处理402
const response = await fetchWithPayment(`${serverUrl}/mint`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ payer: account.address }),
});
```

**特性**:
- ✅ 原生fetch API
- ✅ 自动处理402
- ✅ 轻量级
- ✅ 支持所有fetch选项

## 工作原理

```
客户端发起请求
    ↓
服务端返回 402 Payment Required
    ↓
x402自动解析支付要求
    ↓
x402用钱包签名创建支付证明
    ↓
x402自动重试请求 + X-PAYMENT header
    ↓
服务端验证并返回数据
    ↓
成功！
```

## 关键区别

### Coinbase官方x402 vs 手动实现

| 特性 | Coinbase x402 | 手动实现 |
|------|---------------|----------|
| 需要USDC | ❌ 不需要 | ✅ 需要 |
| 需要gas | ❌ 不需要 | ✅ 需要 |
| 代码复杂度 | 🟢 简单 | 🔴 复杂 |
| 支付速度 | ⚡ 即时 | 🐌 等待确认 |
| 实现方式 | 签名验证 | 链上转账 |

## 核心概念

### 1. Signer (签名者)

x402需要一个可以签名的账户：

```typescript
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(
  process.env.PRIVATE_KEY as `0x${string}`
);
```

### 2. 支付证明

x402使用**EIP-712签名**创建支付证明：
- 不发送链上交易
- 只签名消息
- Facilitator验证签名

### 3. 402响应

服务端返回的402响应包含：

```json
{
  "accepts": [{
    "network": "base-sepolia",
    "asset": "0x036CbD...",
    "payTo": "0x123...",
    "maxAmountRequired": "1000000",
    "description": "Mint tokens"
  }]
}
```

### 4. X-PAYMENT Header

客户端在重试时发送：

```
X-PAYMENT: <base64-encoded-payment-proof>
```

包含签名和支付信息。

## 常见问题

### Q: 钱包需要有USDC吗？

**A: 不需要！** Coinbase官方x402使用签名验证，不发送实际交易。

### Q: 需要支付gas费吗？

**A: 不需要！** 只签名，不上链。

### Q: 和传统支付有什么区别？

**A:**
- 传统: 转账 → 等待确认 → 提供证明
- x402: 签名 → 即时验证 → 获取资源

### Q: 哪个客户端更好？

**A:**
- **已经用axios**: 用 `x402-axios`
- **喜欢原生fetch**: 用 `x402-fetch`
- **需要USDC转账**: 用手动实现

### Q: 支付安全吗？

**A: 是的！**
- EIP-712标准签名
- Facilitator验证
- 防重放攻击
- 金额限制保护

## 文件说明

| 文件 | 说明 |
|------|------|
| `index-x402-standard.ts` | x402-axios实现 |
| `index-x402-fetch.ts` | x402-fetch实现 |
| `index-x402-working.ts` | 手动实现(需USDC) |
| `test-x402.sh` | 测试脚本 |
| `X402_COINBASE_GUIDE.md` | 详细文档 |

## 下一步

1. ✅ 配置 `.env`
2. ✅ 运行 `./test-x402.sh`
3. ✅ 选择客户端测试
4. 📖 阅读 `X402_COINBASE_GUIDE.md` 了解更多
5. 🚀 集成到你的应用

## 调试技巧

### 检查服务端

```bash
curl http://localhost:4021/health
# 或
curl http://localhost:4021/info
```

### 查看请求详情

在代码中添加日志：

```typescript
// 查看支付响应
const paymentResponse = response.headers['x-payment-response'];
console.log('Payment info:', 
  Buffer.from(paymentResponse, 'base64').toString()
);
```

### 常见错误

**"Server not reachable"**
→ 启动服务端: `cd ../server && npm start`

**"PRIVATE_KEY not set"**
→ 检查 `.env` 文件

**"Payment failed"**
→ 检查服务端日志
→ 确认网络配置正确

## 资源链接

- 📖 [Coinbase x402文档](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- 📦 [x402-axios npm](https://www.npmjs.com/package/x402-axios)
- 📦 [x402-fetch npm](https://www.npmjs.com/package/x402-fetch)
- 💬 [CDP Discord](https://discord.gg/cdp)

---

**🎉 准备好了吗？运行 `./test-x402.sh` 开始测试！**

