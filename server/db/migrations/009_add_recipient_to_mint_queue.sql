-- Migration: Add recipient column to mint_queue
-- This allows minting tokens to a different address than the payer
-- 
-- Use case: AI Agent pays USDC on behalf of user, but tokens should go to user's wallet

-- Add recipient column (defaults to payer_address for backward compatibility)
ALTER TABLE mint_queue
ADD COLUMN recipient TEXT;

-- Set existing rows to use payer_address as recipient
UPDATE mint_queue
SET recipient = payer_address
WHERE recipient IS NULL;

-- Add index for recipient lookups
CREATE INDEX IF NOT EXISTS idx_mint_queue_recipient ON mint_queue(recipient);

-- Add comment
COMMENT ON COLUMN mint_queue.recipient IS 'Address that will receive the minted tokens (may differ from payer)';

