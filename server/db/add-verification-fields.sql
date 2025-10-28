-- Add verification fields to deployed_tokens table
-- Run this migration to add fields for contract verification

ALTER TABLE deployed_tokens 
ADD COLUMN IF NOT EXISTS constructor_args JSONB,
ADD COLUMN IF NOT EXISTS compiler_version VARCHAR(20) DEFAULT '0.8.26',
ADD COLUMN IF NOT EXISTS optimization_runs INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS via_ir BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verification_guid VARCHAR(100),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS verification_error TEXT,
ADD COLUMN IF NOT EXISTS verification_retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS verification_last_attempt TIMESTAMP;

-- Create index for verification queries
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_verification_status 
ON deployed_tokens(verification_status);

CREATE INDEX IF NOT EXISTS idx_deployed_tokens_verification_retry 
ON deployed_tokens(verification_status, verification_retry_count) 
WHERE verification_status = 'failed';

-- Update existing records to set constructor_args
COMMENT ON COLUMN deployed_tokens.constructor_args IS 'JSON object containing all constructor arguments for contract verification';
COMMENT ON COLUMN deployed_tokens.verification_status IS 'Status: pending, verifying, verified, failed';
COMMENT ON COLUMN deployed_tokens.verification_guid IS 'Etherscan/Basescan verification GUID';
COMMENT ON COLUMN deployed_tokens.verification_retry_count IS 'Number of times verification has been attempted';
COMMENT ON COLUMN deployed_tokens.verification_last_attempt IS 'Timestamp of last verification attempt';
COMMENT ON COLUMN deployed_tokens.verification_error IS 'Last error message from verification attempt';

-- Add verification stats view
CREATE OR REPLACE VIEW verification_stats AS
SELECT 
    network,
    COUNT(*) FILTER (WHERE verification_status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE verification_status = 'verifying') as verifying_count,
    COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_count,
    COUNT(*) FILTER (WHERE verification_status = 'failed') as failed_count,
    COUNT(*) as total_count
FROM deployed_tokens
GROUP BY network;

