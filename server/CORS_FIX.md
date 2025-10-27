# ✅ CORS配置已修复

## 问题
浏览器无法连接到服务器，报错：
```
Failed to connect to server: Failed to fetch
```

## 原因
服务器缺少CORS（跨域资源共享）配置，浏览器阻止了从`http://localhost:3000`到`http://localhost:4021`的请求。

## 解决方案
已添加CORS中间件配置：

```typescript
import cors from "cors";

app.use(cors({
  origin: '*', // 开发环境允许所有来源
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
```

## 如何应用修复

### 1. 停止当前运行的服务器
按 `Ctrl+C` 停止服务器

### 2. 重启服务器
```bash
cd server
npm run dev
```

### 3. 验证服务器正常运行
应该看到：
```
🚀 Token Mint Server running on port 4021
Network: base-sepolia
Token Contract: 0x...
Pay To Address: 0x...
Server Address: 0x...
```

### 4. 刷新网页
在浏览器中刷新 `http://localhost:3000/mint` 页面

## 预期结果

✅ 页面应该正常显示token信息：
- Price: 1 USDC
- Tokens per Payment: (数量)
- Mint Progress: X / Y
- Remaining Supply: (数量)

## 生产环境注意事项

⚠️ 当前配置 `origin: '*'` 允许所有来源访问，这适合开发环境。

**生产环境建议**：
```typescript
app.use(cors({
  origin: 'https://your-domain.com', // 指定你的域名
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true, // 如果需要cookies
}));
```

或者使用环境变量：
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
```

然后在`.env`中配置：
```env
ALLOWED_ORIGIN=https://your-domain.com
```

## 验证修复

### 测试1: 健康检查
```bash
curl http://localhost:4021/health
```

应该返回：
```json
{
  "status": "ok",
  "network": "base-sepolia",
  "tokenContract": "0x...",
  "payTo": "0x..."
}
```

### 测试2: 信息端点
```bash
curl http://localhost:4021/info
```

应该返回token信息

### 测试3: 从浏览器访问
打开浏览器控制台(F12)，在Console中运行：
```javascript
fetch('http://localhost:4021/info')
  .then(r => r.json())
  .then(console.log)
```

应该看到token信息，无CORS错误

## 完成 ✅

CORS配置已完成！现在网页应该可以正常连接到服务器了。

