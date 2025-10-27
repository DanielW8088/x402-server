# 🔧 数据库迁移指南

## 快速迁移

你的数据库需要更新来支持多token功能。

### 方法1: 使用迁移脚本（推荐）

```bash
cd server

# 运行迁移
psql $DATABASE_URL < migrate-to-multi-token.sql
```

### 方法2: 手动更新

```bash
psql $DATABASE_URL
```

然后执行：

```sql
-- 添加token_address字段
ALTER TABLE mint_queue ADD COLUMN IF NOT EXISTS token_address VARCHAR(42);
ALTER TABLE mint_history ADD COLUMN IF NOT EXISTS token_address VARCHAR(42);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_mint_queue_token ON mint_queue(token_address);
CREATE INDEX IF NOT EXISTS idx_mint_history_token ON mint_history(token_address);

-- 创建deployed_tokens表（见 migrate-to-multi-token.sql）
```

### 方法3: 重新创建数据库（如果是测试环境）

```bash
# 警告：这会删除所有数据！
dropdb token_launchpad
createdb token_launchpad
psql token_launchpad < db/schema.sql
```

## 验证迁移

```bash
psql $DATABASE_URL -c "\d mint_queue" | grep token_address
psql $DATABASE_URL -c "\d mint_history" | grep token_address
psql $DATABASE_URL -c "\dt" | grep deployed_tokens
```

应该看到：
- `mint_queue` 有 `token_address` 列
- `mint_history` 有 `token_address` 列
- `deployed_tokens` 表存在

## 重启服务器

迁移完成后重启：

```bash
# 停止服务器（Ctrl+C）
# 重新启动
npx tsx index-multi-token.ts
```

应该看到：
```
✅ Database initialized
✅ Queue processor started
🚀 Multi-Token x402 Server running on port 4022
```

不应该再有 "relation does not exist" 或 "column does not exist" 错误。

