# x402 实现方式对比

这个文档对比了三种 x402 客户端实现方式。

## 快速对比表

| 特性 | Coinbase x402-axios | Coinbase x402-fetch | 手动实现 |
|------|---------------------|---------------------|----------|
| **实现文件** | `index-x402-standard.ts` | `index-x402-fetch.ts` | `index-x402-working.ts` |
| **需要USDC** | ❌ 不需要 | ❌ 不需要 | ✅ 需要 |
| **需要gas** | ❌ 不需要 | ❌ 不需要 | ✅ 需要 |
| **代码行数** | ~120行 | ~130行 | ~315行 |
| **复杂度** | 🟢 简单 | 🟢 简单 | 🔴 复杂 |
| **支付方式** | EIP-712签名 | EIP-712签名 | USDC转账 |
| **支付速度** | ⚡ 即时 | ⚡ 即时 | 🐌 等待确认 |
| **错误处理** | ✅ 自动 | ✅ 自动 | ⚠️ 手动 |
| **重试逻辑** | ✅ 自动 | ✅ 自动 | ⚠️ 手动 |
| **推荐度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

## 详细对比

### 1. Coinbase x402-axios (推荐)

**文件**: `client/index-x402-standard.ts`

**运行**: `npm run start:x402-standard`

#### 优点
- ✅ Axios用户的最佳选择
- ✅ 自动拦截402响应
- ✅ 支持所有axios功能
- ✅ 不需要USDC或gas
- ✅ 代码简洁清晰

#### 使用场景
- 项目中已使用axios
- 需要完整的HTTP客户端功能
- 需要请求/响应拦截器

#### 核心代码

```typescript
import { withPaymentInterceptor } from "x402-axios";

const axiosClient = axios.create();
const client = withPaymentInterceptor(axiosClient, account);

const response = await client.post(`${serverUrl}/mint`, {
  payer: account.address,
});
```

---

### 2. Coinbase x402-fetch

**文件**: `client/index-x402-fetch.ts`

**运行**: `npm run start:x402-fetch`

#### 优点
- ✅ 原生fetch API
- ✅ 轻量级，无额外依赖
- ✅ 现代化API设计
- ✅ 不需要USDC或gas
- ✅ 完美集成原生fetch

#### 使用场景
- 喜欢原生API
- 不想引入axios依赖
- 需要最小化bundle大小

#### 核心代码

```typescript
import { wrapFetchWithPayment } from "x402-fetch";

const fetchWithPayment = wrapFetchWithPayment(fetch, account);

const response = await fetchWithPayment(`${serverUrl}/mint`, {
  method: "POST",
  body: JSON.stringify({ payer: account.address }),
});
```

---

### 3. 手动实现（传统方式）

**文件**: `client/index-x402-working.ts`

**运行**: `npm run start:x402`

#### 优点
- ✅ 完整控制整个流程
- ✅ 教育价值高
- ✅ 易于理解x402原理
- ✅ 实际的USDC转账

#### 缺点
- ❌ 需要钱包有USDC
- ❌ 需要ETH支付gas
- ❌ 代码复杂
- ❌ 需要等待交易确认
- ❌ 手动处理错误

#### 使用场景
- 学习x402协议原理
- 需要实际转账USDC
- 特殊的业务逻辑

#### 核心代码

```typescript
// 1. 检测402响应
if (error.response?.status === 402) {
  // 2. 解析支付要求
  const instructions = parseX402Instructions(error.response);
  
  // 3. 发送USDC
  const paymentTxHash = await sendUSDCPayment(
    instructions.payTo,
    instructions.asset,
    instructions.maxAmountRequired
  );
  
  // 4. 创建支付证明
  const paymentProof = createPaymentProof(paymentTxHash, account.address);
  
  // 5. 重试请求
  const response = await axios({
    method,
    url,
    headers: { 'X-PAYMENT': paymentProof },
  });
}
```

---

## 工作流程对比

### Coinbase官方实现

```
客户端请求
    ↓
x402包拦截
    ↓
检测到402
    ↓
自动签名 (EIP-712)
    ↓
自动重试
    ↓
获得资源
```

**时间**: < 1秒  
**成本**: 0 USDC, 0 gas

### 手动实现

```
客户端请求
    ↓
收到402
    ↓
解析支付要求
    ↓
发送USDC交易
    ↓
等待链上确认 (2-15秒)
    ↓
创建支付证明
    ↓
手动重试请求
    ↓
获得资源
```

**时间**: 5-20秒  
**成本**: 需要USDC + gas

---

## 技术细节对比

### 支付验证方式

#### Coinbase官方 (EIP-712签名)

```typescript
// 签名消息
const signature = await account.signTypedData({
  domain,
  types,
  primaryType: 'Payment',
  message: paymentDetails,
});

// X-PAYMENT header
{
  signature,
  payer,
  amount,
  timestamp
}
```

**优势**:
- 不上链，即时验证
- Facilitator验证签名
- 防重放攻击

#### 手动实现 (链上转账)

```typescript
// 发送USDC交易
const hash = await walletClient.writeContract({
  address: usdcAddress,
  abi: usdcAbi,
  functionName: "transfer",
  args: [to, amount],
});

// 等待确认
const receipt = await publicClient.waitForTransactionReceipt({ hash });

// X-PAYMENT header
{
  type: "transaction",
  txHash: hash,
  payer,
  timestamp
}
```

**劣势**:
- 需要上链，等待确认
- 消耗gas
- 需要USDC余额

---

## 依赖对比

### Coinbase x402-axios

```json
{
  "dependencies": {
    "x402-axios": "^0.6.6",
    "axios": "^1.7.9",
    "viem": "^2.21.54",
    "@coinbase/x402": "^0.6.6"
  }
}
```

### Coinbase x402-fetch

```json
{
  "dependencies": {
    "x402-fetch": "^0.6.6",
    "viem": "^2.21.54",
    "@coinbase/x402": "^0.6.6"
  }
}
```

### 手动实现

```json
{
  "dependencies": {
    "axios": "^1.7.9",
    "viem": "^2.21.54"
  }
}
```

---

## 选择建议

### 选择 x402-axios 如果:
- ✅ 项目中使用axios
- ✅ 需要拦截器功能
- ✅ 想要最简单的集成

### 选择 x402-fetch 如果:
- ✅ 喜欢原生API
- ✅ 追求最小化依赖
- ✅ 使用现代化的fetch

### 选择手动实现 如果:
- ✅ 学习x402协议
- ✅ 需要完全控制流程
- ✅ 特殊业务需求
- ⚠️ 愿意支付gas费用
- ⚠️ 有USDC余额

---

## 性能对比

### Coinbase官方实现

| 指标 | 值 |
|------|------|
| 初始请求 | ~100ms |
| 签名时间 | ~50ms |
| 重试请求 | ~100ms |
| **总时间** | **~250ms** |
| Gas费用 | 0 |
| USDC消耗 | 0 (只验证) |

### 手动实现

| 指标 | 值 |
|------|------|
| 初始请求 | ~100ms |
| USDC转账 | ~2-15秒 |
| 等待确认 | ~2-5秒 |
| 重试请求 | ~100ms |
| **总时间** | **~5-20秒** |
| Gas费用 | ~$0.01-0.05 |
| USDC消耗 | 实际转账金额 |

---

## 安全性对比

### Coinbase官方实现

- ✅ EIP-712标准签名
- ✅ 防重放攻击
- ✅ 时间戳验证
- ✅ 金额限制保护
- ✅ Facilitator验证

### 手动实现

- ✅ 链上交易可验证
- ✅ 不可篡改
- ⚠️ 需要自行实现防重放
- ⚠️ 需要自行验证金额
- ⚠️ 可能被抢跑

---

## 迁移指南

### 从手动实现迁移到Coinbase官方

1. **安装依赖**:
```bash
npm install x402-axios x402-fetch
```

2. **替换代码**:

**之前** (手动实现):
```typescript
// 复杂的402处理逻辑
if (error.response?.status === 402) {
  const instructions = parseX402Instructions(error.response);
  const paymentTxHash = await sendUSDCPayment(...);
  const paymentProof = createPaymentProof(...);
  const response = await axios({ headers: { 'X-PAYMENT': paymentProof } });
}
```

**之后** (Coinbase官方):
```typescript
// 简单的一行配置
const client = withPaymentInterceptor(axios.create(), account);
const response = await client.post(url, data);
```

3. **移除不需要的代码**:
- ❌ USDC转账逻辑
- ❌ 余额检查
- ❌ 交易等待
- ❌ 手动重试逻辑

---

## 总结

| 选择 | 适合 | 不适合 |
|------|------|--------|
| **x402-axios** | 生产环境、已用axios | 追求最小依赖 |
| **x402-fetch** | 生产环境、喜欢原生API | 需要axios特性 |
| **手动实现** | 学习、特殊需求 | 生产环境、追求性能 |

**推荐**: 
- 🥇 **生产环境**: `x402-axios` 或 `x402-fetch`
- 🥈 **学习阶段**: 手动实现
- 🥉 **特殊需求**: 根据具体情况选择

---

**开始使用**: 查看 [QUICK_START_X402.md](./client/QUICK_START_X402.md) 快速上手！

