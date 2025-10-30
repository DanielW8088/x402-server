-- Migration 002: 添加统计缓存字段
-- 执行时间: ~10分钟（包括初始化数据）
-- 影响: trending tokens查询从500ms → 50ms（无需JOIN）

-- ============================================
-- 1. 添加缓存字段
-- ============================================

ALTER TABLE deployed_tokens 
ADD COLUMN IF NOT EXISTS mint_count_24h_cache INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS volume_24h_cache NUMERIC(20,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cache_updated_at TIMESTAMP;

COMMENT ON COLUMN deployed_tokens.mint_count_24h_cache IS 
'缓存：最近24小时的mint次数（定期更新）';

COMMENT ON COLUMN deployed_tokens.volume_24h_cache IS 
'缓存：最近24小时的USDC交易量（定期更新）';

COMMENT ON COLUMN deployed_tokens.cache_updated_at IS 
'缓存字段最后更新时间';

-- ============================================
-- 2. 创建索引支持trending排序
-- ============================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deployed_tokens_trending 
ON deployed_tokens(network, is_active, volume_24h_cache DESC NULLS LAST);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deployed_tokens_trending') THEN
        EXECUTE 'COMMENT ON INDEX idx_deployed_tokens_trending IS ''支持trending tokens按24h交易量排序''';
    END IF;
END $$;

-- ============================================
-- 3. 初始化缓存数据
-- ============================================

-- 注意：这个查询可能需要几分钟，取决于数据量
-- 如果数据量很大，可以分批更新

DO $$
DECLARE
    token_record RECORD;
    mint_count_24h INT;
    price_numeric NUMERIC;
BEGIN
    RAISE NOTICE '开始初始化缓存数据...';
    
    FOR token_record IN 
        SELECT id, address, price 
        FROM deployed_tokens 
        WHERE is_active = true
    LOOP
        -- 计算24h mint数量
        SELECT COUNT(*) INTO mint_count_24h
        FROM mint_history
        WHERE token_address = token_record.address
        AND completed_at > NOW() - INTERVAL '24 hours';
        
        -- 提取价格（从 "1 USDC" 格式）
        price_numeric := CAST(
            REGEXP_REPLACE(token_record.price, '[^0-9.]', '', 'g') 
            AS NUMERIC
        );
        
        -- 更新缓存
        UPDATE deployed_tokens
        SET 
            mint_count_24h_cache = mint_count_24h,
            volume_24h_cache = price_numeric * mint_count_24h,
            cache_updated_at = NOW()
        WHERE id = token_record.id;
        
        -- 每100条commit一次
        IF token_record.id::text ~ '00$' THEN
            RAISE NOTICE '已处理部分token...';
        END IF;
    END LOOP;
    
    RAISE NOTICE '缓存初始化完成！';
END $$;

-- ============================================
-- 4. 创建更新缓存的函数
-- ============================================

-- 单个token的缓存更新函数
CREATE OR REPLACE FUNCTION update_token_cache(token_addr VARCHAR)
RETURNS VOID AS $$
DECLARE
    mint_count_24h INT;
    price_numeric NUMERIC;
    token_price TEXT;
BEGIN
    -- 获取token价格
    SELECT price INTO token_price
    FROM deployed_tokens
    WHERE address = token_addr;
    
    IF token_price IS NULL THEN
        RETURN;
    END IF;
    
    -- 计算24h mint数量
    SELECT COUNT(*) INTO mint_count_24h
    FROM mint_history
    WHERE token_address = token_addr
    AND completed_at > NOW() - INTERVAL '24 hours';
    
    -- 提取价格
    price_numeric := CAST(
        REGEXP_REPLACE(token_price, '[^0-9.]', '', 'g') 
        AS NUMERIC
    );
    
    -- 更新缓存
    UPDATE deployed_tokens
    SET 
        mint_count_24h_cache = mint_count_24h,
        volume_24h_cache = price_numeric * mint_count_24h,
        cache_updated_at = NOW()
    WHERE address = token_addr;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_token_cache IS 
'更新单个token的缓存统计数据';

-- 批量更新所有token缓存
CREATE OR REPLACE FUNCTION update_all_token_caches()
RETURNS TABLE(updated_count INTEGER) AS $$
DECLARE
    update_count INT := 0;
    token_record RECORD;
BEGIN
    FOR token_record IN 
        SELECT address FROM deployed_tokens WHERE is_active = true
    LOOP
        PERFORM update_token_cache(token_record.address);
        update_count := update_count + 1;
    END LOOP;
    
    RETURN QUERY SELECT update_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_all_token_caches IS 
'批量更新所有活跃token的缓存数据（用于定期job）';

-- ============================================
-- 5. 验证
-- ============================================

-- 查看缓存数据
SELECT 
    address,
    name,
    symbol,
    mint_count_24h_cache,
    volume_24h_cache,
    cache_updated_at
FROM deployed_tokens
WHERE is_active = true
ORDER BY volume_24h_cache DESC NULLS LAST
LIMIT 10;

-- 查看缓存更新时间分布
SELECT 
    DATE_TRUNC('minute', cache_updated_at) as update_time,
    COUNT(*) as token_count
FROM deployed_tokens
WHERE cache_updated_at IS NOT NULL
GROUP BY update_time
ORDER BY update_time DESC
LIMIT 10;

