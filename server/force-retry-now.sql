-- Force immediate retry of LP deployment
-- Run this to bypass the 5-minute wait

UPDATE deployed_tokens 
SET lp_deployment_error = NULL,
    lp_deployment_error_at = NULL,
    lp_retry_count = 0
WHERE liquidity_deployed = false
  AND lp_deployment_error IS NOT NULL;

-- Show tokens that will be retried
SELECT address, symbol, lp_retry_count 
FROM deployed_tokens 
WHERE liquidity_deployed = false;

