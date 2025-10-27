-- Add retry count field for LP deployment
-- Run this migration to support automatic LP deployment retry

-- Add lp_retry_count column
ALTER TABLE deployed_tokens 
  ADD COLUMN IF NOT EXISTS lp_retry_count INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN deployed_tokens.lp_retry_count IS 'Number of times LP deployment has been retried';

-- Reset retry count for existing errors (allow them to retry)
UPDATE deployed_tokens 
SET lp_retry_count = 0
WHERE lp_deployment_error IS NOT NULL 
  AND lp_retry_count IS NULL;

-- Show result
SELECT 
  address, 
  symbol,
  liquidity_deployed,
  lp_deployment_error IS NOT NULL as has_error,
  lp_retry_count
FROM deployed_tokens
WHERE liquidity_deployed = false
ORDER BY created_at DESC;

