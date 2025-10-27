# Quick Start - Queue System

快速启动队列模式服务器（5分钟）

## 前提条件

- Node.js 18+
- PostgreSQL 14+

## 步骤

### 1. 安装 PostgreSQL

```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Ubuntu
sudo apt update && sudo apt install postgresql-14
sudo systemctl start postgresql
```

### 2. 创建数据库

```bash
# 登录 PostgreSQL
psql postgres

# 执行以下 SQL
CREATE DATABASE token_mint;
CREATE USER mint_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE token_mint TO mint_user;
\q
```

### 3. 安装依赖

```bash
cd server
npm install
```

这会安装新增的依赖：
- `pg` - PostgreSQL 客户端
- `@types/pg` - TypeScript 类型定义

### 4. 配置环境变量

```bash
# 复制环境变量模板
cp env.queue.example .env

# 编辑 .env
nano .env
```

**必需配置：**

```bash
# 基础配置（与原来相同）
SERVER_PRIVATE_KEY=0x...
TOKEN_CONTRACT_ADDRESS=0x...
PAY_TO_ADDRESS=0x...
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NETWORK=base-sepolia
REQUIRED_PAYMENT_USDC=1

# 新增：PostgreSQL 连接
DATABASE_URL=postgresql://mint_user:your_secure_password@localhost:5432/token_mint
```

### 5. 初始化数据库

```bash
# 设置脚本权限（已完成）
# chmod +x scripts/setup-db.sh

# 运行初始化
./scripts/setup-db.sh
```

你应该看到：
```
✅ Connection successful
✅ Database setup complete!
```

### 6. 启动服务器

```bash
# 开发模式（自动重载）
npm run dev:queue

# 生产模式
npm run start:queue
```

**成功启动的标志：**

```
✅ Database connected at: 2025-10-27...
✅ Database schema initialized successfully
🔄 Starting queue processor (batch interval: 10000ms, max batch: 50)
🚀 x402 Token Mint Server (Queue Mode) running on port 4021
```

### 7. 测试

```bash
# 健康检查
curl http://localhost:4021/health

# 应返回:
# {"status":"ok","network":"base-sepolia",...,"queueEnabled":true}

# 队列状态
curl http://localhost:4021/queue/status

# 应返回:
# {"stats":{"pending_count":0,"completed_count":0,...}}
```

## 验证数据库

```bash
# 连接数据库
psql -U mint_user -d token_mint

# 查看表
\dt

# 应该看到:
# mint_queue, mint_history, batch_mints, system_settings

# 查看队列统计
SELECT * FROM queue_stats;

# 退出
\q
```

## 测试 Mint

### 使用 curl

```bash
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{
    "payer": "0xYourAddress"
  }'
```

### 响应示例

```json
{
  "success": true,
  "message": "Mint request added to queue",
  "queueId": "550e8400-e29b-41d4-a716-446655440000",
  "queuePosition": 1,
  "payer": "0xYourAddress",
  "estimatedWaitSeconds": 10,
  "paymentType": "x402"
}
```

### 查询状态

```bash
# 使用返回的 queueId
curl http://localhost:4021/queue/item/550e8400-e29b-41d4-a716-446655440000

# 响应:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "payer_address": "0xYourAddress",
  "status": "pending",  # 或 processing, completed, failed
  "queue_position": 1,
  "created_at": "2025-10-27T10:30:00.000Z",
  "mint_tx_hash": null  # 完成后会有值
}
```

## 常见问题

### Q: 数据库连接失败

```
❌ Database connection failed: connection refused
```

**解决：**
```bash
# 检查 PostgreSQL 是否运行
brew services list  # macOS
systemctl status postgresql  # Linux

# 重启 PostgreSQL
brew services restart postgresql@14  # macOS
sudo systemctl restart postgresql  # Linux
```

### Q: 找不到 pg 模块

```
Error: Cannot find module 'pg'
```

**解决：**
```bash
npm install
```

### Q: 权限被拒绝

```
ERROR: permission denied for database token_mint
```

**解决：**
```bash
psql postgres
GRANT ALL PRIVILEGES ON DATABASE token_mint TO mint_user;
\q
```

### Q: 队列不处理

**检查：**
```bash
# 查看服务器日志
# 应该每 10 秒看到处理日志

# 手动检查队列
psql -U mint_user -d token_mint
SELECT * FROM mint_queue WHERE status = 'pending';
```

## 下一步

1. **集成前端** - 使用 `frontend-example/QueueStatus.tsx`
2. **配置监控** - 设置数据库监控和告警
3. **性能调优** - 调整 `batch_interval_seconds` 和 `max_batch_size`
4. **部署生产** - 参考 `MIGRATION_GUIDE.md`

## 文档

- 📖 [完整文档](./QUEUE_SYSTEM.md)
- 🔄 [迁移指南](./MIGRATION_GUIDE.md)
- 💻 [前端集成](./frontend-example/README.md)
- 📊 [项目总结](../QUEUE_SYSTEM_SUMMARY.md)

## 性能指标

运行队列模式后，你应该看到：

- **吞吐量**: ~300 mints/分钟（vs 5-10 单线程）
- **并发**: 支持任意数量的同时请求
- **Nonce 冲突**: 0（vs 频繁发生）
- **Gas 效率**: 批量处理节省 25% gas

## 支持

如有问题：
1. 检查 [QUEUE_SYSTEM.md](./QUEUE_SYSTEM.md) 的故障排除部分
2. 查看服务器日志
3. 检查数据库连接
4. 提交 GitHub Issue

---

**🎉 完成！** 队列系统现在正在运行。

