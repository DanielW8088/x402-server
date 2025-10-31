# Migration Fix - "role postgres does not exist"

## 问题
运行migration时出现错误：
```
ERROR: role "postgres" does not exist
```

## 解决方案
已修复！SQL文件中移除了硬编码的 `OWNER TO postgres` 语句。

## 重新运行 Migration

### 方法 1: 分步执行（推荐）

```bash
# 1. 创建用户表
./scripts/run-migration-only.sh

# 2. 迁移历史数据
./scripts/migrate-historical-data.sh
```

### 方法 2: 一键执行

```bash
./scripts/setup-users-system.sh
```

### 方法 3: 手动执行

```bash
# 设置数据库连接
export DATABASE_URL='your-database-url'

# 1. 创建表
psql $DATABASE_URL -f db/migrations/005_add_users_and_points.sql

# 2. 迁移数据
psql $DATABASE_URL -f scripts/migrate-historical-mints.sql
```

## 如果表已经创建了（但有错误）

如果之前的migration部分成功，需要先删除表：

```bash
psql $DATABASE_URL -c "DROP TABLE IF EXISTS users CASCADE;"
```

然后重新运行migration。

## 验证安装

```bash
# 检查表是否创建成功
psql $DATABASE_URL -c "\d users"

# 查看用户数量
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# 查看前10名用户
psql $DATABASE_URL -c "SELECT wallet_address, invitation_code, points FROM users ORDER BY points DESC LIMIT 10;"
```

## 常见问题

### Q: 我的数据库用户不是 postgres
A: 没问题！现在SQL文件会自动使用当前数据库用户作为owner。

### Q: 如何找到我的数据库用户名？
```bash
psql $DATABASE_URL -c "SELECT current_user;"
```

### Q: Migration说表已存在
如果表已经部分创建，有两个选择：

**选项 1: 删除重建（推荐）**
```bash
psql $DATABASE_URL -c "DROP TABLE IF EXISTS users CASCADE;"
./scripts/run-migration-only.sh
```

**选项 2: 跳过表创建，只迁移数据**
```bash
./scripts/migrate-historical-data.sh
```

## 测试 API

Migration完成后，重启服务器并测试：

```bash
# 重启服务器
npm run dev

# 在另一个终端测试API
./scripts/test-user-api.sh
```

## 需要帮助？

查看完整文档：
- `USER_POINTS_GUIDE.md` - 完整使用指南
- `API_QUICK_REFERENCE.md` - API参考

