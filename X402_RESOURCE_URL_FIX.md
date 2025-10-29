# 修复 x402 Resource URL 验证错误 ✅

## 🎯 问题

Zod 验证错误：
```
{
  "validation": "url",
  "code": "invalid_string",
  "message": "Invalid url",
  "path": ["resource"]
}
```

## 🔍 根本原因

**`resource` 字段必须是完整的 URL，不能是相对路径！**

### ❌ 错误的实现（之前）

```typescript
const paymentRequirements = {
  scheme: "exact",
  resource: `/api/mint/${tokenAddress}`,  // ❌ 相对路径
  ...
};
```

### ✅ 正确的实现（现在）

```typescript
// 构建完整的 URL
const baseUrl = `${req.protocol}://${req.get('host')}`;
const fullResourceUrl = `${baseUrl}/api/mint/${tokenAddress}`;

const paymentRequirements = {
  scheme: "exact",
  resource: fullResourceUrl,  // ✅ 完整 URL: http://localhost:4021/api/mint/0x...
  ...
};
```

## 📝 修改详情

**文件：** `server/index-multi-token.ts:979-987`

```typescript
// x402 standard PaymentRequirements format (exact scheme)
// Based on x402-fetch expectations: response must have x402Version and accepts array
// Construct full URL for resource (Zod requires valid URL, not relative path)
const baseUrl = `${req.protocol}://${req.get('host')}`;
const fullResourceUrl = `${baseUrl}/api/mint/${tokenAddress}`;

const paymentRequirements = {
  scheme: "exact" as const,
  description: `Mint ${quantity}x tokens for ${totalPrice} USDC`,
  network: network as "base-sepolia" | "base",
  resource: fullResourceUrl, // Must be full URL, not relative path ✅
  mimeType: "application/json",
  payTo: tokenAddress,
  maxAmountRequired: totalPriceWei.toString(),
  maxTimeoutSeconds: 300,
  asset: network === 'base-sepolia' 
    ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};
```

## 🔍 为什么需要完整 URL？

### Zod 验证逻辑

x402 库使用 Zod schema 验证 `PaymentRequirements`：

```typescript
const PaymentRequirementsSchema = z.object({
  scheme: z.enum(["exact"]),
  resource: z.string().url(),  // ← 必须是有效的 URL！
  ...
});
```

`z.string().url()` 会检查：
- ✅ `http://localhost:4021/api/mint/0x...` - 有效
- ✅ `https://api.example.com/mint` - 有效
- ❌ `/api/mint/0x...` - 无效（相对路径）
- ❌ `api/mint` - 无效（缺少协议）

### 为什么 x402 需要完整 URL？

x402 协议设计允许：
1. **跨域支付** - 资源可能在不同的服务器上
2. **服务发现** - 客户端需要知道完整的资源位置
3. **审计和日志** - 完整 URL 便于追踪和记录

相对路径在这些场景下都不够用。

## 🚀 测试步骤

### 1. 重启后端

```bash
cd /Users/daniel/code/402/token-mint/server
# Ctrl+C 停止
npm run dev
```

### 2. 验证 402 响应

```bash
curl -X POST http://localhost:4021/api/mint/0xdd8bb663c7245437c9c53c19e4d561e248574acd \
  -H "Content-Type: application/json" \
  -d '{"quantity": 1}' \
  | jq '.accepts[0].resource'
```

**预期输出：**
```
"http://localhost:4021/api/mint/0xdd8bb663c7245437c9c53c19e4d561e248574acd"
```

✅ 完整的 URL，包含协议和主机名

### 3. 测试前端

1. 刷新浏览器（F5）
2. 打开控制台（F12）
3. 连接钱包
4. 点击 "Mint 1x"

**预期日志：**
```
🧪 Testing raw 402 response first...
402 Response status: 402
402 Response data: {
  x402Version: "1",
  accepts: [
    {
      scheme: "exact",
      resource: "http://localhost:4021/api/mint/0xdd8b...",  ✅ 完整 URL
      ...
    }
  ]
}

Creating fetchWithPayment wrapper...
[x402-fetch 验证通过] ✅
[签名支付] ✅
[重试请求] ✅

✅ x402 payment confirmed
✅ x402 mint request accepted!
```

## 📊 后端日志（成功）

```
POST /api/mint/0xdd8b... - Quantity: 1

💳 Returning 402 Payment Required (x402 format)
   Amount: 1 USDC (1000000 wei)
   Recipient: 0xdd8b...
   Resource URL: http://localhost:4021/api/mint/0xdd8b...  ✅
   x402 Response: {
     "x402Version": "1",
     "accepts": [
       {
         "scheme": "exact",
         "resource": "http://localhost:4021/api/mint/0xdd8b...",  ✅
         ...
       }
     ]
   }
```

## 🎓 学到的经验

### URL 构建最佳实践

在 Express 中构建完整 URL：

```typescript
// 方法 1: 从请求构建（推荐）
const baseUrl = `${req.protocol}://${req.get('host')}`;
const fullUrl = `${baseUrl}${req.originalUrl}`;

// 方法 2: 从环境变量
const baseUrl = process.env.BASE_URL || 'http://localhost:4021';
const fullUrl = `${baseUrl}/api/mint/${tokenAddress}`;

// 方法 3: 使用 URL 对象
const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
```

我们使用方法 1，因为：
- ✅ 自动适应开发/生产环境
- ✅ 支持不同端口
- ✅ 支持 HTTP/HTTPS
- ✅ 无需额外配置

### x402 字段验证规则

| 字段 | 类型 | 验证 | 示例 |
|------|------|------|------|
| `resource` | string | **必须是完整 URL** | `http://localhost:4021/api/mint/0x...` |
| `payTo` | string | 0x 开头的地址 | `0xdd8bb663...` |
| `asset` | string | 0x 开头的地址 | `0x036CbD53...` |
| `maxAmountRequired` | string | 数字字符串 | `"1000000"` |
| `maxTimeoutSeconds` | number | 正整数 | `300` |

## ✨ 所有修复总结

到目前为止，我们修复了：

1. ✅ **CORS 配置** - 暴露 x402 响应头
2. ✅ **402 响应格式** - 添加 `x402Version` 和 `accepts` 数组
3. ✅ **Resource URL** - 使用完整 URL 而不是相对路径 ⭐️ 当前修复

## 🚀 现在应该能工作了！

**重启后端，清除浏览器缓存，重新测试！**

如果还有其他 Zod 验证错误，检查：
1. 所有地址字段都以 `0x` 开头
2. 所有金额字段都是字符串类型
3. `maxTimeoutSeconds` 是数字类型
4. `network` 值在允许的列表中

参考完整的 Zod schema：
```bash
cat node_modules/x402/dist/cjs/x402Specs-*.d.ts | grep -A 20 "PaymentRequirementsSchema"
```

Good luck! 🎉

