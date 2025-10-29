# Client 变更日志

## 2024-10-29 - 多 Token 支持更新

### 🚨 Breaking Changes

#### 1. 新增必需环境变量

```bash
# 必须添加!
TOKEN_ADDRESS=0x...
```

从 server 的 `/api/tokens` 端点获取可用地址。

#### 2. API 端点变更

| 旧端点 | 新端点 | 状态 |
|--------|--------|------|
| `GET /info` | `GET /api/tokens/:address` | ✅ 已更新 |
| `POST /mint` | `POST /api/mint/:address` | ✅ 已更新 |
| - | `GET /api/tokens` | ✨ 新增 |
| - | `GET /api/queue/:queueId` | ✨ 新增 |

### ✨ 新功能

1. **多 Token 支持**
   - 可以 mint 任何部署在 server 上的 token
   - 每个 token 独立配置价格、供应量、元数据

2. **队列系统支持**
   - Server 可能返回队列 ID 而非立即 mint
   - Client 会显示队列状态和查询 URL

3. **增强的 Token 信息**
   - 显示 token 名称、符号
   - 显示 mint 进度
   - 显示 logo 和元数据

### 📝 代码变更

#### 环境变量

```diff
  NETWORK=base-sepolia
  PRIVATE_KEY=0x...
  SERVER_URL=http://localhost:4021
+ TOKEN_ADDRESS=0x...
```

#### API 调用

```diff
- const response = await fetchWithPayment(`${serverUrl}/mint`, {...});
+ const response = await fetchWithPayment(`${serverUrl}/api/mint/${tokenAddress}`, {...});
```

```diff
- const serverInfo = await axios.get(`${serverUrl}/info`);
+ const tokenInfo = await axios.get(`${serverUrl}/api/tokens/${tokenAddress}`);
```

#### 响应处理

```diff
  const result = await response.json();
  
+ // 处理队列响应
+ if (result.queueId) {
+   console.log('Queue ID:', result.queueId);
+   console.log('Check status:', `${serverUrl}/api/queue/${result.queueId}`);
+ } else {
    console.log('Minted!');
    console.log('TX:', result.mintTxHash);
+ }
```

### 🔧 迁移指南

#### 步骤 1: 更新环境变量

```bash
# 在 .env 文件中添加
TOKEN_ADDRESS=0x...
```

#### 步骤 2: 获取 Token 地址

```bash
# 查看所有可用 token
curl http://localhost:4021/api/tokens

# 或查看特定 token
curl http://localhost:4021/api/tokens/0x...
```

#### 步骤 3: 测试运行

```bash
npm start
```

### 📚 新文档

- [USAGE.md](./USAGE.md) - 详细使用说明和 API 变更
- 更新了 [README.md](./README.md) - 反映最新 API

### ⚠️ 注意事项

1. **必须提供 TOKEN_ADDRESS**
   - 未设置会报错退出
   - 必须是 server 上已部署的 token

2. **Server 兼容性**
   - 需要 server 版本支持多 token
   - 旧版 server 不兼容

3. **队列响应**
   - Mint 可能被放入队列
   - 需要通过 `/api/queue/:queueId` 查询状态

### 🐛 Bug 修复

- 修复了与新版 server API 不兼容的问题
- 修复了缺失的 token 地址参数
- 修复了错误的端点路径

### 📦 依赖版本

保持不变：
- `x402-fetch` ^0.6.6
- `x402-axios` ^0.6.6
- `@coinbase/x402` ^0.6.6
- `viem` ^2.38.4

### 🔗 相关链接

- Server README: [../server/README.md](../server/README.md)
- Server 变更: 多 token 系统架构
- 前端集成: [../0x402.io/README.md](../0x402.io/README.md)

