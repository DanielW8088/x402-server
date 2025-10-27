# x402 Coinbase Official Implementation Guide

这个指南展示如何使用 Coinbase 官方的 x402 包来调用 x402 协议的服务端。

## 什么是 x402？

x402 是一个支付协议，基于 HTTP 402 (Payment Required) 状态码：

1. 客户端请求受保护的资源
2. 服务端返回 402 + 支付要求
3. 客户端创建支付证明
4. 客户端重试请求 + 支付证明
5. 服务端验证并提供资源

## 安装依赖

```bash
npm install x402-axios x402-fetch @coinbase/x402 viem dotenv
```

## 配置

创建 `.env` 文件：

```bash
# Network: base-sepolia (testnet) or base (mainnet)
NETWORK=base-sepolia

# 你的私钥 - 用于签名支付证明
PRIVATE_KEY=0x...

# 服务端地址
SERVER_URL=http://localhost:4021
```

## 两种实现方式

### 方式 1: 使用 x402-axios (推荐用于 Axios 用户)

文件: `index-x402-standard.ts`

```typescript
import { useAxios } from "x402-axios";

// 配置 axios 拦截器
const axiosWithPayment = useAxios(axios, account, {
  maxPaymentAmount: "1000000", // 最多 1 USDC (6位小数)
});

// 正常调用，自动处理 402 响应
const response = await axiosWithPayment.post(`${serverUrl}/mint`, {
  payer: account.address,
});
```

**特性:**
- 自动拦截 402 响应
- 自动解析支付要求
- 自动创建和附加支付证明
- 支持最大支付限额保护

### 方式 2: 使用 x402-fetch (推荐用于 Fetch 用户)

文件: `index-x402-fetch.ts`

```typescript
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";

// 包装原生 fetch
const fetchWithPayment = wrapFetchWithPayment(fetch, account);

// 正常使用，自动处理 402
const response = await fetchWithPayment(`${serverUrl}/mint`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ payer: account.address }),
});

// 解析支付响应
const paymentResponse = decodeXPaymentResponse(
  response.headers.get("x-payment-response")!
);
```

**特性:**
- 扩展原生 fetch API
- 自动处理 402 和支付流程
- 支持所有标准 fetch 选项
- 提供支付响应解码工具

## 运行客户端

### 使用 x402-axios:

```bash
npm run start:x402-standard
```

### 使用 x402-fetch:

```bash
npm run start:x402-fetch
```

## 工作流程

```
客户端                          x402库                          服务端
   |                              |                               |
   |-- POST /mint --------------->|                               |
   |                              |-- POST /mint ---------------->|
   |                              |<-- 402 Payment Required ------|
   |                              |   (payment requirements)      |
   |                              |                               |
   |                              |-- 解析支付要求                 |
   |                              |-- 验证金额                     |
   |                              |-- 创建支付证明 (签名)          |
   |                              |                               |
   |                              |-- POST /mint ---------------->|
   |                              |   + X-PAYMENT header          |
   |                              |                               |
   |                              |                          [验证支付]
   |                              |                          [处理请求]
   |                              |                               |
   |<-- 200 OK -------------------|<-- 200 OK (mint result) ------|
   |    (mint result)             |                               |
```

## 关键概念

### 1. 钱包客户端 (Wallet Client)

x402 需要一个钱包来签名支付证明：

```typescript
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});
```

### 2. 支付证明 (Payment Proof)

x402 使用 EIP-712 签名创建支付证明，不需要实际发送 USDC 交易：

- **签名方式**: EIP-712 typed data signature
- **包含信息**: 支付金额、接收方、时间戳等
- **验证方式**: Facilitator 验证签名和支付条件

### 3. 支付响应 (Payment Response)

服务端在 `X-PAYMENT-RESPONSE` header 中返回支付详情：

```typescript
const paymentResponse = decodeXPaymentResponse(
  response.headers.get("x-payment-response")!
);
console.log(paymentResponse);
```

## 对比其他实现

### 现有实现 (index-x402-working.ts)

- ✅ 手动处理 402 响应
- ✅ 实际发送 USDC 交易
- ❌ 需要钱包里有 USDC
- ❌ 需要支付 gas
- ❌ 代码复杂

### Coinbase 官方实现 (推荐)

- ✅ 自动处理 402 响应
- ✅ 只需要签名，不发送交易
- ✅ 不需要 USDC 或 gas
- ✅ 代码简洁
- ✅ 支持错误处理和重试

## 错误处理

x402 库会在以下情况抛出错误：

1. **缺少请求配置** - 检查请求格式
2. **已经尝试过支付** - 避免重复支付
3. **创建支付头失败** - 检查钱包配置

示例：

```typescript
try {
  const response = await fetchWithPayment(url, options);
} catch (error) {
  if (error.message.includes("payment")) {
    console.error("Payment failed:", error.message);
    // 检查钱包配置
    // 检查支付金额限制
  }
}
```

## 服务发现 (可选)

使用 x402 Bazaar 动态发现可用服务：

```typescript
import { useFacilitator } from "x402/verify";
import { facilitator } from "@coinbase/x402";

const { list } = useFacilitator(facilitator);
const services = await list();

// 遍历可用服务
services.forEach(service => {
  console.log(`${service.name}: ${service.endpoint}`);
  console.log(`  Price: ${service.price}`);
  console.log(`  Description: ${service.description}`);
});
```

## 参考资源

- [x402 Quickstart (Buyers)](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- [x402-fetch npm](https://www.npmjs.com/package/x402-fetch)
- [x402-axios npm](https://www.npmjs.com/package/x402-axios)
- [x402 Bazaar](https://docs.cdp.coinbase.com/x402/docs/bazaar)
- [Coinbase Developer Discord](https://discord.gg/cdp)

## 常见问题

### Q: 需要在钱包里有 USDC 吗？

A: **不需要**。x402 使用签名验证，不发送实际交易。

### Q: 需要支付 gas 费吗？

A: **不需要**。客户端只签名，不上链。

### Q: 和传统支付有什么区别？

A: 传统方式需要先转账 → 等待确认 → 提供证明。x402 只需要签名即可，即时验证。

### Q: maxPaymentAmount 有什么用？

A: 保护你不会意外支付过多。如果服务要求超过这个金额，会抛出错误。

### Q: 可以用于生产环境吗？

A: 可以。x402 是 Coinbase 官方支持的协议，在 Base 主网和测试网都可用。

## 下一步

1. ✅ 安装 x402 官方包
2. ✅ 配置钱包和环境变量
3. ✅ 运行示例客户端
4. 🔜 集成到你的应用
5. 🔜 探索 x402 Bazaar 服务发现
6. 🔜 部署到生产环境

## 总结

Coinbase x402 官方实现提供了：

- 🚀 **简单**: 只需几行代码
- 🔒 **安全**: 加密签名和验证
- ⚡ **快速**: 无需等待链上确认
- 💰 **经济**: 不需要 gas 费
- 🛠️ **强大**: 自动处理所有支付流程

开始使用 x402，体验 Web3 支付的新方式！

