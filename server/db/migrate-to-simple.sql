-- Migration: Add LP deployer address field for simplified LP deployment
-- Run this on existing database to support PAYX_Simple contract

-- Add lp_deployer_address column
ALTER TABLE deployed_tokens 
  ADD COLUMN IF NOT EXISTS lp_deployer_address VARCHAR(42);

-- Add index for LP deployer lookups
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_lp_deployer 
  ON deployed_tokens(lp_deployer_address);

-- Add comment
COMMENT ON COLUMN deployed_tokens.lp_deployer_address IS 'Address that will receive tokens and USDC for LP deployment';

-- For existing rows, you may want to set a default LP deployer
-- UPDATE deployed_tokens 
-- SET lp_deployer_address = '0xYourLPDeployerAddress'
-- WHERE lp_deployer_address IS NULL;

-- Verify the changes
\d deployed_tokens;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'deployed_tokens' 
  AND column_name = 'lp_deployer_address';

