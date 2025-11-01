# Server 代码重构说明

## 📋 重构概述

将原来 2282 行的 `index-multi-token.ts` 重构为模块化结构，提高代码可读性和可维护性。

## 📁 新文件结构

```
server/
├── config/              # 配置模块
│   ├── env.ts          # 环境变量和常量
│   ├── database.ts     # 数据库连接 (PostgreSQL + Redis)
│   └── blockchain.ts   # 区块链配置 (Viem, RPC, ABIs)
│
├── lib/                 # 工具函数库
│   ├── validation.ts   # 输入验证函数
│   ├── helpers.ts      # 辅助函数 (generateMintTxHash, etc.)
│   └── x402.ts         # x402 支付验证和结算
│
├── routes/              # API 路由模块
│   ├── deployment.ts   # Token 部署相关 API
│   ├── tokens.ts       # Token 查询相关 API
│   ├── mint.ts         # Mint 相关 API (x402 + 传统支付)
│   ├── queue.ts        # 队列状态查询 API
│   ├── user.ts         # 用户和积分系统 API
│   └── ai-agent.ts     # AI Agent 相关 API
│
├── services/            # 业务逻辑服务 (未改动)
│   ├── tokenDeployer.ts
│   ├── userService.ts
│   └── aiAgentService.ts
│
├── queue/               # 队列处理器 (未改动)
│   ├── processor.ts
│   ├── payment-processor.ts
│   └── ai-agent-executor.ts
│
├── index-multi-token.ts     # 新主文件 (简化版)
└── index-multi-token-old.ts # 旧文件备份 (可删除)
```

## 🔧 各模块详细说明

### 1. `config/env.ts`
- 环境变量定义和验证
- 常量定义 (MAX_NAME_LENGTH, DEPLOY_FEE_USDC, etc.)
- `validateEnv()` 函数检查必需的环境变量

### 2. `config/database.ts`
- PostgreSQL 连接池配置 (SSL 支持)
- Redis 客户端初始化
- 导出 `pool` 和 `initRedis()` 函数

### 3. `config/blockchain.ts`
- Viem 客户端配置 (serverWalletClient, minterWalletClient, publicClient)
- RPC 负载均衡器设置
- 合约 ABI 定义 (tokenAbi, usdcAbi)

### 4. `lib/validation.ts`
输入验证函数：
- `isValidTokenName()` - 验证 token 名称
- `isValidSymbol()` - 验证 token 符号
- `isValidHttpUrl()` - 验证 URL 格式

### 5. `lib/helpers.ts`
工具函数：
- `generateMintTxHash()` - 生成 mint 交易哈希
- `generatePaymentRequirements()` - 生成 x402 支付要求
- `getAdvisoryLockId()` - 生成数据库锁 ID

### 6. `lib/x402.ts`
x402 协议相关：
- `verifyX402Payment()` - 验证 x402 支付
- `settleX402Payment()` - 结算 x402 支付

### 7. `routes/deployment.ts`
部署相关 API：
- `GET /api/deploy-address` - 获取部署服务地址
- `POST /api/deploy` - 部署新 token

### 8. `routes/tokens.ts`
Token 查询 API：
- `GET /api/tokens` - 获取所有 token (支持缓存)
- `GET /api/tokens/:address` - 获取特定 token 信息

### 9. `routes/mint.ts`
Mint 相关 API：
- `POST /api/mint/:address` - Mint tokens (支持 x402 和传统支付)

### 10. `routes/queue.ts`
队列查询 API：
- `GET /api/payment/:paymentId` - 查询支付状态
- `GET /api/payment/stats` - 支付队列统计
- `GET /api/queue/:queueId` - 查询 mint 队列状态
- `GET /api/queue/stats` - Mint 队列统计

### 11. `routes/user.ts`
用户和积分系统 API：
- `GET /api/user/:address` - 获取/创建用户
- `POST /api/user/:address/invite` - 使用邀请码
- `GET /api/user/:address/rank` - 获取用户排名
- `GET /api/user/:address/referrals` - 获取推荐列表
- `GET /api/leaderboard` - 获取排行榜
- `GET /api/leaderboard/stats` - 排行榜统计

### 12. `routes/ai-agent.ts`
AI Agent API：
- `POST /api/ai-agent/chat` - 发送消息给 AI Agent
- `GET /api/ai-agent/wallet/:address` - 获取 Agent 钱包信息
- `GET /api/ai-agent/history/:address` - 获取聊天历史
- `GET /api/ai-agent/tasks/:address` - 获取用户任务列表
- `GET /api/ai-agent/task/:taskId` - 获取特定任务
- `POST /api/ai-agent/task/:taskId/cancel` - 取消任务
- `POST /api/ai-agent/task/:taskId/retry` - 重试失败任务

### 13. `index-multi-token.ts` (新主文件)
精简为 ~300 行：
- 导入所有配置和路由模块
- 初始化服务和队列处理器
- 注册路由
- 启动服务器
- 优雅关闭处理

## ✅ 重构优势

1. **代码可读性提升**
   - 单个文件从 2282 行减少到 ~300 行
   - 每个模块职责单一，易于理解

2. **可维护性提升**
   - 模块化结构便于定位问题
   - 修改某个功能只需修改对应模块
   - 减少代码冲突

3. **可测试性提升**
   - 每个模块可以独立测试
   - 易于编写单元测试

4. **可扩展性提升**
   - 新增 API 只需新建路由文件
   - 新增配置只需修改 config 模块
   - 不影响其他模块

5. **团队协作友好**
   - 多人可以同时修改不同模块
   - 代码审查更容易
   - 降低学习曲线

## 🔄 迁移说明

### 对于开发者
重构后的代码**完全兼容**旧版本，无需修改：
- 所有 API 端点保持不变
- 环境变量配置保持不变
- 数据库结构保持不变
- 功能逻辑保持不变

### 如何使用
1. **编译**
   ```bash
   npm run build
   ```

2. **运行**
   ```bash
   npm start
   # 或
   pm2 start ecosystem.config.cjs
   ```

3. **开发模式**
   ```bash
   npm run dev
   ```

### 旧文件处理
- `index-multi-token-old.ts` - 旧文件备份，可删除
- 建议在确认新版本运行正常后删除

## 🐛 故障排查

如果遇到问题：

1. **编译错误**
   ```bash
   npm run build
   ```
   检查错误信息，通常是导入路径问题

2. **运行时错误**
   - 检查环境变量是否正确设置
   - 检查所有模块文件是否存在
   - 查看服务器日志

3. **回滚到旧版本**
   ```bash
   mv index-multi-token.ts index-multi-token-new.ts
   mv index-multi-token-old.ts index-multi-token.ts
   npm run build
   ```

## 📝 后续改进建议

1. **添加单元测试**
   - 为每个工具函数添加测试
   - 为每个 API 端点添加集成测试

2. **添加 API 文档**
   - 使用 Swagger/OpenAPI 自动生成文档
   - 为每个端点添加详细说明

3. **性能优化**
   - 考虑使用缓存层
   - 优化数据库查询
   - 添加请求限流

4. **监控和日志**
   - 集成结构化日志 (winston, pino)
   - 添加性能监控 (Prometheus)
   - 错误追踪 (Sentry)

## 🎉 总结

重构完成后：
- ✅ 主文件从 2282 行精简到 ~300 行
- ✅ 代码模块化，易于维护
- ✅ 功能完全兼容，无需迁移
- ✅ 编译通过，无错误
- ✅ 可以立即使用

享受更清晰的代码结构！ 🚀

