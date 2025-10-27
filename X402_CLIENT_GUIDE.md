# x402 客户端使用指南

## 重要说明

x402 协议主要是为**浏览器钱包**和 **AI agents** 设计的，不是为命令行客户端设计的。

## 客户端类型对比

### 1. 浏览器钱包客户端（推荐）

x402 协议的标准用法：

```
用户浏览器 → 钱包插件（如 MetaMask）→ x402 服务器 → Facilitator
```

**优势：**
- ✅ 符合 x402 协议标准
- ✅ 钱包自动处理支付签名
- ✅ 用户体验好

**如何使用：**
1. 部署 x402 服务器
2. 使用支持 x402 的钱包
3. 在浏览器中访问受保护的endpoint

### 2. CLI 客户端（用于测试）

对于开发和测试，我们提供传统的 CLI 客户端：

```bash
cd client
npm start  # 使用传统客户端 (index.ts)
```

这个客户端：
- ✅ 直接发送 USDC 交易
- ✅ 调用服务器 mint endpoint
- ✅ 适合开发测试

### 3. x402 CLI 客户端（实验性）

`index-x402.ts` 是一个实验性的 x402 客户端，但它：
- ❌ 需要实现完整的 x402 支付协议
- ❌ 需要处理 facilitator 交互
- ❌ 目前不完整

## 推荐的测试流程

### 阶段 1: 本地测试（传统模式）

使用传统客户端测试基本功能：

```bash
# 1. 启动传统服务器
cd server
tsx index.ts

# 2. 使用传统客户端
cd ../client
npm start
```

### 阶段 2: x402 服务器测试（传统客户端）

启动 x402 服务器，但用传统客户端测试：

```bash
# 1. 启动 x402 服务器
cd server
npx tsx index-x402.ts

# 2. 使用传统客户端（直接支付）
cd ../client
npm start
```

**注意：** x402 服务器只是在 mint endpoint 加了 middleware，传统的 USDC 支付仍然有效。

### 阶段 3: 浏览器测试（完整 x402）

使用浏览器和钱包测试完整的 x402 流程：

1. 部署 x402 服务器
2. 创建简单的前端页面
3. 使用支持 x402 的钱包
4. 测试支付流程

## 当前 x402 客户端的问题

`client/index-x402.ts` 假设了一个简化的 x402 协议，但实际的 x402 协议要复杂得多：

### 服务器返回的 402 响应：

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "1000000",
    "resource": "http://localhost:4021/mint",
    "payTo": "0x...",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "extra": {"name": "USDC", "version": "2"}
  }]
}
```

### 正确的客户端实现需要：

1. **解析 `accepts` 数组**
   - 选择支付方式（scheme）
   - 获取 asset (USDC)、payTo、amount

2. **执行支付**
   - 方案 A: 直接发送 USDC 交易
   - 方案 B: 使用 EIP-3009 授权

3. **创建支付凭证**
   - 交易哈希，或
   - EIP-3009 授权数据

4. **编码支付凭证**
   - 格式化为 X-PAYMENT header

5. **重试请求**
   - 带上 X-PAYMENT header

这比简单的 EIP-712 签名复杂得多。

## 解决方案

### 方案 1: 使用传统客户端（推荐）

```bash
cd client
npm start
```

**优势：**
- ✅ 已经实现完整
- ✅ 支持 USDC 支付
- ✅ 支持 EIP-3009 gasless
- ✅ 可以测试 x402 服务器

### 方案 2: 实现完整的 x402 客户端

需要实现：
- USDC 支付流程
- EIP-3009 支付流程
- Facilitator 交互
- 支付凭证编码

**代码量：** ~500+ 行

### 方案 3: 使用浏览器钱包

这是 x402 的标准用法：
1. 部署前端应用
2. 集成钱包（如 MetaMask）
3. 钱包自动处理 x402 协议

## 快速测试指南

### 测试 x402 服务器是否正常运行：

```bash
# 1. 启动 x402 服务器
cd server
npx tsx index-x402.ts

# 2. 测试健康检查
curl http://localhost:4021/health

# 3. 测试 402 响应
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{"payer": "0xYourAddress"}'

# 应该返回 402 Payment Required
```

### 测试完整 mint 流程：

```bash
# 使用传统客户端
cd client
npm start
```

传统客户端会：
1. 发送 USDC 到服务器指定地址
2. 调用 /mint endpoint
3. 服务器验证支付并 mint

## x402 的真正用途

x402 协议的设计目标是：

### 1. AI Agents

AI agents 可以：
- 自动发现 API（通过 Bazaar）
- 读取 402 响应
- 自动完成支付
- 调用 API

### 2. 浏览器 DApp

用户可以：
- 通过钱包浏览受保护的内容
- 钱包自动处理支付
- 无缝体验

### 3. 微支付生态

开发者可以：
- 为 API 收费
- 列入 x402 Bazaar
- 被 AI agents 发现和使用

## 下一步

### 如果你想测试服务器：

使用传统客户端：
```bash
cd client
npm start
```

### 如果你想使用完整的 x402：

1. 创建前端应用
2. 集成钱包
3. 使用 x402 SDK

### 如果你想实现完整的 CLI 客户端：

参考传统客户端 `index.ts` 的实现：
- USDC 支付
- EIP-3009 授权
- 交易哈希作为凭证

## 文档参考

- [x402 Protocol](https://x402.gitbook.io/x402/)
- [Quickstart for Buyers](https://x402.gitbook.io/x402/getting-started/quickstart-for-buyers)
- 传统客户端: `client/index.ts`
- x402 服务器: `server/index-x402.ts`

## 总结

**现在可以做什么：**
1. ✅ 使用 x402 服务器（已实现）
2. ✅ 使用传统客户端测试（已实现）
3. ✅ 服务器自动列入 Bazaar（主网）

**未来可以做什么：**
1. 创建浏览器前端
2. 集成钱包（MetaMask 等）
3. 实现完整的 x402 CLI 客户端

**推荐方式：**
- 开发测试：使用传统客户端 `npm start`
- 生产环境：创建前端 + 钱包集成
- AI agents：他们会自动使用 x402 协议

