-- Migration 003: 添加外键约束
-- 执行时间: ~5分钟
-- 影响: 保证数据完整性，防止脏数据

-- ============================================
-- 1. 清理脏数据（必须先执行）
-- ============================================

-- 检查脏数据
SELECT 
    'mint_history' as table_name,
    COUNT(*) as orphaned_records
FROM mint_history m
WHERE m.token_address NOT IN (SELECT address FROM deployed_tokens)
UNION ALL
SELECT 
    'mint_queue' as table_name,
    COUNT(*) as orphaned_records
FROM mint_queue q
WHERE q.token_address IS NOT NULL 
AND q.token_address NOT IN (SELECT address FROM deployed_tokens);

-- 备份脏数据（可选，用于调试）
CREATE TABLE IF NOT EXISTS mint_history_orphaned AS
SELECT * FROM mint_history
WHERE token_address NOT IN (SELECT address FROM deployed_tokens);

CREATE TABLE IF NOT EXISTS mint_queue_orphaned AS
SELECT * FROM mint_queue
WHERE token_address IS NOT NULL 
AND token_address NOT IN (SELECT address FROM deployed_tokens);

-- 删除脏数据
DELETE FROM mint_history
WHERE token_address NOT IN (SELECT address FROM deployed_tokens);

DELETE FROM mint_queue
WHERE token_address IS NOT NULL 
AND token_address NOT IN (SELECT address FROM deployed_tokens);

-- 报告清理结果
DO $$
DECLARE
    history_deleted INT;
    queue_deleted INT;
BEGIN
    SELECT COUNT(*) INTO history_deleted FROM mint_history_orphaned;
    SELECT COUNT(*) INTO queue_deleted FROM mint_queue_orphaned;
    
    RAISE NOTICE '清理完成：';
    RAISE NOTICE '- mint_history: % 条脏数据已删除', history_deleted;
    RAISE NOTICE '- mint_queue: % 条脏数据已删除', queue_deleted;
END $$;

-- ============================================
-- 2. 添加外键约束
-- ============================================

-- mint_history -> deployed_tokens
ALTER TABLE mint_history
ADD CONSTRAINT fk_mint_history_token
FOREIGN KEY (token_address) 
REFERENCES deployed_tokens(address)
ON DELETE CASCADE
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_mint_history_token ON mint_history IS 
'确保mint历史记录关联到有效的token';

-- mint_queue -> deployed_tokens
ALTER TABLE mint_queue
ADD CONSTRAINT fk_mint_queue_token
FOREIGN KEY (token_address)
REFERENCES deployed_tokens(address)
ON DELETE CASCADE
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_mint_queue_token ON mint_queue IS 
'确保mint队列关联到有效的token';

-- ============================================
-- 3. 验证外键约束
-- ============================================

-- 查看所有外键
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- 测试外键约束（应该失败）
-- 尝试插入不存在的token_address
DO $$
BEGIN
    -- 这应该失败
    INSERT INTO mint_history (
        payer_address,
        tx_hash_bytes32,
        token_address,
        mint_tx_hash,
        amount,
        payment_type
    ) VALUES (
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        '0xnonexistent000000000000000000000000',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        '1000000000000000000',
        'test'
    );
    
    RAISE EXCEPTION '外键约束测试失败：应该拒绝无效的token_address';
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE '✅ 外键约束工作正常：成功拒绝无效的token_address';
END $$;

-- ============================================
-- 4. 性能影响分析
-- ============================================

-- 外键会略微影响INSERT/DELETE性能，但保证数据完整性
-- 查看表大小和行数
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
    (SELECT COUNT(*) FROM mint_history) as mint_history_rows,
    (SELECT COUNT(*) FROM mint_queue) as mint_queue_rows
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('mint_history', 'mint_queue', 'deployed_tokens')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

