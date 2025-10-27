-- Migration: Remove V4-specific fields, keep V3-compatible schema
-- Run this to clean up V4 fields from deployed_tokens table

-- Drop V4-specific columns
ALTER TABLE deployed_tokens 
  DROP COLUMN IF EXISTS pool_manager,
  DROP COLUMN IF EXISTS permit2,
  DROP COLUMN IF EXISTS sqrt_price_payment_first,
  DROP COLUMN IF EXISTS sqrt_price_token_first,
  DROP COLUMN IF EXISTS pool_tick_spacing;

-- Update pool_fee default to 3000 (0.3% - V3 standard)
ALTER TABLE deployed_tokens 
  ALTER COLUMN pool_fee SET DEFAULT 3000;

-- Comment the table
COMMENT ON TABLE deployed_tokens IS 'Deployed tokens using Uniswap V3';
COMMENT ON COLUMN deployed_tokens.position_manager IS 'Uniswap V3 NonfungiblePositionManager address';
COMMENT ON COLUMN deployed_tokens.pool_fee IS 'Uniswap V3 pool fee tier (3000 = 0.3%)';
COMMENT ON COLUMN deployed_tokens.lp_token_id IS 'Uniswap V3 NFT position token ID';

-- Verify the changes
\d deployed_tokens;

-- Show column list
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'deployed_tokens'
ORDER BY ordinal_position;

