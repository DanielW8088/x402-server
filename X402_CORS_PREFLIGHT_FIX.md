# 修复 x402 CORS Preflight 错误 ✅

## 🎯 问题

CORS 错误：
```
Access to fetch at 'http://localhost:4021/api/mint/...' from origin 'http://localhost:3001' 
has been blocked by CORS policy: Request header field access-control-expose-headers is not 
allowed by Access-Control-Allow-Headers in preflight response.
```

## 🔍 根本原因

**`allowedHeaders` 配置太严格！**

x402-fetch 在重试支付请求时，会发送一些额外的头部字段，但后端的 CORS 配置只允许 `Content-Type` 和 `X-PAYMENT`。

### CORS Preflight 请求流程

1. 浏览器发送 OPTIONS 请求（preflight）
2. 后端返回允许的头部列表（`Access-Control-Allow-Headers`）
3. 如果客户端要发送的头不在允许列表中 → **CORS 阻止** ❌

## ✅ 修复

**文件：** `server/index-multi-token.ts:184-202`

### 修改前（太严格）

```typescript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-PAYMENT'],  // ❌ 太少了
  exposedHeaders: ['X-Payment-Required', 'X-Payment-Version', 'X-Payment-Response'],
  credentials: true,
}));
```

### 修改后（更宽松）

```typescript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],  // ✅ 添加 OPTIONS
  allowedHeaders: [
    'Content-Type', 
    'X-PAYMENT',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ],  // ✅ 允许更多常见头部
  exposedHeaders: ['X-Payment-Required', 'X-Payment-Version', 'X-Payment-Response'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,  // ✅ 标准 preflight 成功状态码
}));
```

## 📝 修改说明

### 新增的允许头部

1. **`Authorization`** - 标准认证头
2. **`Accept`** - 内容类型协商
3. **`Origin`** - 请求来源
4. **`X-Requested-With`** - AJAX 请求标识
5. **`Access-Control-Request-Method`** - Preflight 请求方法
6. **`Access-Control-Request-Headers`** - Preflight 请求头列表

### 新增的配置选项

1. **`methods: ['GET', 'POST', 'OPTIONS']`**
   - 明确允许 OPTIONS 方法（preflight 请求）

2. **`preflightContinue: false`**
   - 让 cors 中间件直接响应 preflight，不传递给后续处理

3. **`optionsSuccessStatus: 204`**
   - 标准 HTTP 204 No Content 响应（preflight 成功）

## 🚀 测试步骤

### 1. 重启后端

```bash
cd /Users/daniel/code/402/token-mint/server
# Ctrl+C 停止
npm run dev
```

⚠️ **CORS 配置只在服务器启动时加载，必须重启！**

### 2. 测试 Preflight 请求

使用 curl 模拟浏览器的 preflight 请求：

```bash
curl -X OPTIONS http://localhost:4021/api/mint/0xdd8bb663c7245437c9c53c19e4d561e248574acd \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-payment" \
  -v
```

**预期响应：**
```
< HTTP/1.1 204 No Content
< Access-Control-Allow-Origin: *
< Access-Control-Allow-Methods: GET,POST,OPTIONS
< Access-Control-Allow-Headers: Content-Type,X-PAYMENT,Authorization,Accept,Origin,X-Requested-With,Access-Control-Request-Method,Access-Control-Request-Headers
< Access-Control-Expose-Headers: X-Payment-Required,X-Payment-Version,X-Payment-Response
```

### 3. 测试前端

1. 刷新浏览器（F5）
2. 清除缓存（右键刷新 → "清空缓存并硬性重新加载"）
3. 打开控制台（F12）
4. 连接钱包
5. 点击 "Mint 1x"
6. 签名支付

**预期日志：**
```
🧪 Testing raw 402 response first...
402 Response status: 402
402 Response data: {...}

Creating fetchWithPayment wrapper...
Making x402 request...

[浏览器发送 OPTIONS preflight]
[OPTIONS 返回 204 - 成功] ✅

[x402-fetch 发送实际的 POST 请求，带 X-PAYMENT 头]
[后端验证支付] ✅
[添加到队列] ✅

✅ x402 payment confirmed
✅ x402 mint request accepted!
```

## 📊 Network 标签验证

在 Chrome DevTools 的 Network 标签：

### 应该看到两个请求：

#### 1. OPTIONS (Preflight)
```
Request Method: OPTIONS
Status Code: 204 No Content

Request Headers:
  Origin: http://localhost:3001
  Access-Control-Request-Method: POST
  Access-Control-Request-Headers: content-type,x-payment

Response Headers:
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET,POST,OPTIONS
  Access-Control-Allow-Headers: Content-Type,X-PAYMENT,...  ✅
```

#### 2. POST (实际请求)
```
Request Method: POST
Status Code: 200 OK

Request Headers:
  Content-Type: application/json
  X-PAYMENT: <base64-payment-data>

Response Headers:
  X-Payment-Response: <base64-receipt>
```

## 🎓 CORS 最佳实践

### 开发环境（当前配置）

```typescript
origin: '*',  // 允许所有来源
allowedHeaders: [...],  // 宽松的头部列表
```

✅ 适合开发调试  
⚠️ 生产环境需要更严格

### 生产环境建议

```typescript
origin: process.env.FRONTEND_URL || 'https://yourdomain.com',
allowedHeaders: [
  'Content-Type',
  'X-PAYMENT',
  // 只保留必需的头部
],
credentials: true,
```

## 🔧 如果还有 CORS 问题

### 问题 A: 仍然被阻止

**检查：**
1. 后端确实重启了吗？
2. 浏览器缓存清除了吗？
3. 使用的端口正确吗？

### 问题 B: 其他头部被阻止

**解决：**
查看浏览器控制台的完整错误信息，找到被阻止的头部名称，添加到 `allowedHeaders` 数组。

### 问题 C: 更简单的配置

如果开发环境问题频繁，可以暂时使用最宽松的配置：

```typescript
app.use(cors({
  origin: '*',
  methods: '*',  // 允许所有方法
  allowedHeaders: '*',  // 允许所有头部（需要 cors@^2.8.5）
  exposedHeaders: '*',
  credentials: true,
}));
```

⚠️ **注意：** 仅用于开发！生产环境必须配置具体的值。

## ✨ 所有修复总结

1. ✅ **CORS exposedHeaders** - 暴露 x402 响应头
2. ✅ **402 响应格式** - x402Version + accepts 数组
3. ✅ **Resource URL** - 完整 URL
4. ✅ **CORS allowedHeaders** - 宽松的请求头配置 ⭐️ 当前修复

## 🚀 现在应该能正常 Mint 了！

重启后端，清除浏览器缓存，重新测试！

完整的成功流程：
1. 用户点击 Mint
2. 前端发送初始请求 → 402
3. x402-fetch 签名支付
4. **OPTIONS preflight → 204 ✅**
5. POST 带 X-PAYMENT → 200 ✅
6. 后端验证+结算支付 ✅
7. 添加到队列 ✅
8. 队列处理完成 ✅
9. 用户收到代币 🎉

