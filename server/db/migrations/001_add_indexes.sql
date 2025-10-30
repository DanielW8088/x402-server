-- Migration 001: 添加关键索引
-- 执行时间: ~5分钟（取决于数据量）
-- 影响: 查询性能提升10-100倍

-- ============================================
-- 1. mint_history 索引（最关键！）
-- ============================================

-- 用于trending tokens的24h统计查询
-- 支持: WHERE token_address = ? AND completed_at > ?
-- 注意：不使用部分索引（WHERE子句），因为NOW()不是IMMUTABLE函数
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mint_history_token_time 
ON mint_history(token_address, completed_at DESC);

-- 添加复合索引用于JOIN和COUNT查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mint_history_token_completed 
ON mint_history(token_address, completed_at DESC)
INCLUDE (id);

-- 说明
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mint_history_token_time') THEN
        EXECUTE 'COMMENT ON INDEX idx_mint_history_token_time IS ''支持token的时间范围查询和24h统计''';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mint_history_token_completed') THEN
        EXECUTE 'COMMENT ON INDEX idx_mint_history_token_completed IS ''覆盖索引，支持COUNT(id)而无需回表查询''';
    END IF;
END $$;

-- ============================================
-- 2. deployed_tokens 索引
-- ============================================

-- 用于trending tokens列表查询
-- 支持: WHERE network = ? AND is_active = true ORDER BY created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deployed_tokens_network_active 
ON deployed_tokens(network, is_active, created_at DESC);

-- 用于按deployer查询
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deployed_tokens_deployer 
ON deployed_tokens(deployer_address, is_active, created_at DESC);

-- 添加说明
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deployed_tokens_network_active') THEN
        EXECUTE 'COMMENT ON INDEX idx_deployed_tokens_network_active IS ''支持按network过滤的token查询''';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deployed_tokens_deployer') THEN
        EXECUTE 'COMMENT ON INDEX idx_deployed_tokens_deployer IS ''支持查询特定deployer的tokens''';
    END IF;
END $$;

-- ============================================
-- 3. mint_queue 索引
-- ============================================

-- 用于队列处理器查询pending/processing状态
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mint_queue_status_token 
ON mint_queue(status, token_address, created_at);

-- 用于查询单个token的队列状态
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mint_queue_token_status 
ON mint_queue(token_address, status, created_at DESC);

-- 添加说明
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mint_queue_status_token') THEN
        EXECUTE 'COMMENT ON INDEX idx_mint_queue_status_token IS ''支持队列处理器的批量查询''';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mint_queue_token_status') THEN
        EXECUTE 'COMMENT ON INDEX idx_mint_queue_token_status IS ''支持查询特定token的mint队列''';
    END IF;
END $$;

-- ============================================
-- 4. 验证索引是否创建成功
-- ============================================

-- 查看所有新建的索引
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- 检查索引是否有效（usage stats，需要运行一段时间后查看）
-- SELECT 
--     schemaname, tablename, indexname,
--     idx_scan as index_scans,
--     idx_tup_read as tuples_read,
--     idx_tup_fetch as tuples_fetched
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan ASC;

