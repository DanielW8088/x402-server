-- Reset LP deployment retry for token 17
-- This allows it to retry with the fixed price calculation

UPDATE deployed_tokens 
SET lp_deployment_error = NULL,
    lp_deployment_error_at = NULL,
    lp_retry_count = 0
WHERE address = '0x27c922caf9e5e82adf57222f86078a70cae27a94';

-- Show updated status
SELECT 
  address,
  symbol,
  liquidity_deployed,
  lp_deployment_error,
  lp_retry_count
FROM deployed_tokens
WHERE address = '0x27c922caf9e5e82adf57222f86078a70cae27a94';

