# 数据库优化建议

## 当前问题分析

### 1. 🔴 缺少关键索引

**最严重的问题**：`mint_history`表没有任何索引！

当前trending tokens查询：
```sql
SELECT t.*, COUNT(m.id) FILTER (WHERE m.completed_at > NOW() - INTERVAL '24 hours')
FROM deployed_tokens t
LEFT JOIN mint_history m ON m.token_address = t.address
GROUP BY t.id;
```

这个查询需要扫描整个`mint_history`表，性能随数据增长线性下降：
- 1万条记录：还行
- 10万条记录：慢
- 100万条记录：很慢
- **没有索引支持！**

### 2. ⚠️ 数据类型不优化

```sql
-- 当前使用varchar存储固定长度
address varchar(42)         -- 应该用 char(42) 或 bytea
tx_hash varchar(66)         -- 应该用 char(66) 或 bytea
mint_amount varchar(78)     -- 应该用 numeric

-- varchar需要额外的长度字段，char更紧凑
-- bytea可以节省50%空间（0x前缀 + hex编码）
```

### 3. 📊 缺少查询优化字段

trending tokens需要频繁计算24h统计，但没有缓存机制。

### 4. 🔗 缺少外键约束

数据完整性依赖应用层，容易出现脏数据。

## 优化方案

### ⚡️ 优先级1：添加关键索引（立即执行）

**影响**：查询性能提升10-100倍

```sql
-- 最关键：mint_history的24h查询索引
CREATE INDEX idx_mint_history_token_time 
ON mint_history(token_address, completed_at DESC)
WHERE completed_at > NOW() - INTERVAL '7 days';  -- 部分索引，只索引近期数据

-- deployed_tokens的常用查询索引
CREATE INDEX idx_deployed_tokens_network_active 
ON deployed_tokens(network, is_active, created_at DESC)
WHERE is_active = true;

-- mint_queue的状态查询索引
CREATE INDEX idx_mint_queue_status_token 
ON mint_queue(status, token_address, created_at)
WHERE status IN ('pending', 'processing');

-- mint_history的token聚合索引（用于JOIN）
CREATE INDEX idx_mint_history_token_completed 
ON mint_history(token_address, completed_at)
INCLUDE (id);  -- 包含id用于COUNT(id)
```

**为什么这些索引有效**：
- `token_address, completed_at DESC` - 支持按token和时间范围的过滤
- 部分索引（WHERE子句）- 只索引活跃数据，减小索引大小
- `INCLUDE` - 覆盖索引，避免回表查询

### 📈 优先级2：添加统计缓存字段

**影响**：trending tokens完全避免JOIN查询

```sql
-- 添加缓存字段到deployed_tokens
ALTER TABLE deployed_tokens 
ADD COLUMN mint_count_cache INTEGER DEFAULT 0,
ADD COLUMN mint_count_24h_cache INTEGER DEFAULT 0,
ADD COLUMN volume_24h_cache NUMERIC(20,2) DEFAULT 0,
ADD COLUMN cache_updated_at TIMESTAMP;

-- 添加索引用于trending排序
CREATE INDEX idx_deployed_tokens_trending 
ON deployed_tokens(network, is_active, volume_24h_cache DESC NULLS LAST)
WHERE is_active = true;
```

然后trending tokens查询变为：
```sql
-- 超快！无需JOIN，无需COUNT
SELECT * FROM deployed_tokens
WHERE network = 'base-sepolia' AND is_active = true
ORDER BY volume_24h_cache DESC NULLS LAST
LIMIT 50;
```

**更新策略**：
1. 每次mint完成时更新该token的缓存
2. 或者用后台job每10-30秒批量更新

### 🔧 优先级3：添加外键约束

**影响**：保证数据完整性

```sql
-- mint_history -> deployed_tokens
ALTER TABLE mint_history
ADD CONSTRAINT fk_mint_history_token
FOREIGN KEY (token_address) 
REFERENCES deployed_tokens(address)
ON DELETE CASCADE;

-- mint_queue -> deployed_tokens
ALTER TABLE mint_queue
ADD CONSTRAINT fk_mint_queue_token
FOREIGN KEY (token_address)
REFERENCES deployed_tokens(address)
ON DELETE CASCADE;

-- 注意：需要先清理脏数据
DELETE FROM mint_history WHERE token_address IS NULL;
DELETE FROM mint_history WHERE token_address NOT IN (SELECT address FROM deployed_tokens);
```

### 🗂️ 优先级4：mint_history按时间分区

**影响**：支持海量历史数据（百万级以上）

```sql
-- 将mint_history改为分区表（按月分区）
-- 需要重建表，谨慎操作！

CREATE TABLE mint_history_partitioned (
    -- 同样的列定义
    ...
    completed_at timestamp NOT NULL
) PARTITION BY RANGE (completed_at);

-- 创建分区
CREATE TABLE mint_history_2025_01 
PARTITION OF mint_history_partitioned
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- 自动创建未来分区（用pg_cron或应用层）
```

**何时需要**：
- mint_history > 100万条记录
- 查询速度明显下降
- 需要定期归档历史数据

### 📊 优先级5：物化视图（可选）

**影响**：极致性能，适合分析查询

```sql
-- 创建trending tokens物化视图
CREATE MATERIALIZED VIEW trending_tokens_24h AS
SELECT 
    t.*,
    COUNT(m.id) as mint_count_24h,
    SUM(CAST(REGEXP_REPLACE(t.price, '[^0-9.]', '', 'g') AS NUMERIC) * COUNT(m.id)) as volume_24h_usdc
FROM deployed_tokens t
LEFT JOIN mint_history m ON m.token_address = t.address 
    AND m.completed_at > NOW() - INTERVAL '24 hours'
WHERE t.is_active = true
GROUP BY t.id;

-- 创建索引
CREATE INDEX idx_trending_network_volume 
ON trending_tokens_24h(network, volume_24h_usdc DESC);

-- 定期刷新（每30秒）
REFRESH MATERIALIZED VIEW CONCURRENTLY trending_tokens_24h;
```

配合Redis缓存：
- 物化视图30秒刷新
- Redis缓存30秒TTL
- 完美配合，实时性足够

## 性能对比

### 查询trending tokens (100个token, 10万条mint历史)

| 方案 | 查询时间 | 实时性 | 复杂度 |
|-----|---------|-------|--------|
| **当前（无索引）** | ~2-5秒 | 实时 | 简单 |
| **加索引** | ~200-500ms | 实时 | 简单 |
| **加缓存字段** | ~50ms | 10-30s延迟 | 中等 |
| **物化视图** | ~10ms | 30s延迟 | 高 |

## 推荐实施顺序

### 阶段1：立即可做（5分钟）
```sql
-- 添加关键索引
CREATE INDEX idx_mint_history_token_time ON mint_history(token_address, completed_at DESC);
CREATE INDEX idx_deployed_tokens_network_active ON deployed_tokens(network, is_active) WHERE is_active = true;
CREATE INDEX idx_mint_queue_status ON mint_queue(status, created_at) WHERE status IN ('pending', 'processing');
```

**预期效果**：trending tokens查询从5秒 → 500ms

### 阶段2：缓存字段（30分钟）
```sql
-- 1. 添加字段
ALTER TABLE deployed_tokens 
ADD COLUMN mint_count_24h_cache INTEGER DEFAULT 0,
ADD COLUMN volume_24h_cache NUMERIC(20,2) DEFAULT 0,
ADD COLUMN cache_updated_at TIMESTAMP;

-- 2. 创建索引
CREATE INDEX idx_deployed_tokens_trending 
ON deployed_tokens(network, volume_24h_cache DESC) 
WHERE is_active = true;

-- 3. 初始化数据
UPDATE deployed_tokens t
SET 
  mint_count_24h_cache = (
    SELECT COUNT(*) FROM mint_history m 
    WHERE m.token_address = t.address 
    AND m.completed_at > NOW() - INTERVAL '24 hours'
  ),
  cache_updated_at = NOW();

-- 4. 修改查询（在应用代码中）
-- SELECT * FROM deployed_tokens 
-- WHERE network = 'base' AND is_active = true
-- ORDER BY volume_24h_cache DESC LIMIT 50;
```

**预期效果**：trending tokens查询从500ms → 50ms，无需JOIN

### 阶段3：数据完整性（10分钟）
```sql
-- 1. 清理脏数据
DELETE FROM mint_history WHERE token_address NOT IN (SELECT address FROM deployed_tokens);
DELETE FROM mint_queue WHERE token_address NOT IN (SELECT address FROM deployed_tokens);

-- 2. 添加外键
ALTER TABLE mint_history
ADD CONSTRAINT fk_mint_history_token FOREIGN KEY (token_address) 
REFERENCES deployed_tokens(address) ON DELETE CASCADE;

ALTER TABLE mint_queue
ADD CONSTRAINT fk_mint_queue_token FOREIGN KEY (token_address)
REFERENCES deployed_tokens(address) ON DELETE CASCADE;
```

## 其他优化建议

### 1. 数据清理策略
```sql
-- 定期清理旧的mint_history（保留3个月）
DELETE FROM mint_history 
WHERE completed_at < NOW() - INTERVAL '90 days';

-- 或者归档到另一个表
CREATE TABLE mint_history_archive AS 
SELECT * FROM mint_history WHERE completed_at < NOW() - INTERVAL '90 days';
```

### 2. VACUUM和ANALYZE
```sql
-- 定期维护
VACUUM ANALYZE mint_history;
VACUUM ANALYZE deployed_tokens;

-- 查看表膨胀
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### 3. 连接池配置（已完成）
```typescript
// ✅ 已优化
const pool = new Pool({
  max: 50,
  statement_timeout: 30000,
  ...
});
```

### 4. 监控查询性能
```sql
-- 启用慢查询日志
ALTER DATABASE token_mint SET log_min_duration_statement = 1000; -- 1秒

-- 查看慢查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY total_time DESC
LIMIT 10;
```

## 总结

**必须做**（阶段1）：
- ✅ 添加`mint_history(token_address, completed_at)`索引
- ✅ 添加`deployed_tokens(network, is_active)`索引

**强烈建议**（阶段2）：
- ✅ 添加缓存字段`mint_count_24h_cache`, `volume_24h_cache`
- ✅ 修改trending tokens查询使用缓存字段

**可选优化**（按需）：
- 外键约束（数据完整性）
- 分区表（海量数据）
- 物化视图（极致性能）

**预期效果**：
- 阶段1：5秒 → 500ms（10倍提升）
- 阶段2：500ms → 50ms（再10倍提升）
- 总体：**100倍性能提升** 🚀

