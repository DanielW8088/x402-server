-- Run all pending migrations for LP retry feature

-- 1. Add lp_retry_count if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='deployed_tokens' AND column_name='lp_retry_count'
    ) THEN
        ALTER TABLE deployed_tokens 
        ADD COLUMN lp_retry_count INTEGER DEFAULT 0;
        
        COMMENT ON COLUMN deployed_tokens.lp_retry_count IS 'Number of times LP deployment has been retried';
        
        RAISE NOTICE 'Added lp_retry_count column';
    ELSE
        RAISE NOTICE 'lp_retry_count column already exists';
    END IF;
END $$;

-- 2. Reset retry count for existing errors (allow them to retry with new code)
UPDATE deployed_tokens 
SET lp_retry_count = 0
WHERE lp_deployment_error IS NOT NULL 
  AND (lp_retry_count IS NULL OR lp_retry_count >= 5);

-- Show current status
SELECT 
  address, 
  symbol,
  liquidity_deployed,
  lp_deployment_error IS NOT NULL as has_error,
  COALESCE(lp_retry_count, 0) as retry_count,
  lp_deployment_error_at
FROM deployed_tokens
WHERE liquidity_deployed = false
ORDER BY created_at DESC;

