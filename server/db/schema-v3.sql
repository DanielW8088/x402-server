-- Database schema for token mint queue system with Uniswap V3
-- PostgreSQL 13+
-- Using gen_random_uuid() (built-in, no extension needed)

-- Batch mint records - tracks batch mint transactions
CREATE TABLE IF NOT EXISTS batch_mints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_tx_hash VARCHAR(66) NOT NULL UNIQUE,
    mint_count INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    confirmed_at TIMESTAMP,
    block_number BIGINT,
    gas_used BIGINT,
    error_message TEXT
);

-- Deployed tokens table - stores all deployed x402 tokens (V3)
CREATE TABLE IF NOT EXISTS deployed_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address VARCHAR(42) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    deployer_address VARCHAR(42) NOT NULL,
    mint_amount VARCHAR(78) NOT NULL,
    max_mint_count INTEGER NOT NULL,
    price VARCHAR(78) NOT NULL,
    payment_token_address VARCHAR(42) NOT NULL,
    payment_token_symbol VARCHAR(10) NOT NULL,
    payment_seed VARCHAR(78),
    pool_seed_amount VARCHAR(78),
    
    -- LP deployment configuration
    lp_deployer_address VARCHAR(42),
    position_manager VARCHAR(42),
    pool_manager VARCHAR(42),
    permit2 VARCHAR(42),
    
    -- Pool configuration
    pool_fee INTEGER DEFAULT 10000,
    pool_tick_spacing INTEGER DEFAULT 200,
    sqrt_price_payment_first VARCHAR(78),
    sqrt_price_token_first VARCHAR(78),
    
    -- Network and supply
    network VARCHAR(20) NOT NULL,
    total_supply VARCHAR(78) DEFAULT '0',
    max_supply VARCHAR(78),
    mint_count INTEGER DEFAULT 0,
    
    -- LP deployment status
    liquidity_deployed BOOLEAN DEFAULT false,
    liquidity_tx_hash VARCHAR(66),
    liquidity_deployed_at TIMESTAMP,
    lp_token_id VARCHAR(100),
    lp_deployment_error TEXT,
    lp_deployment_error_at TIMESTAMP,
    lp_retry_count INTEGER DEFAULT 0,
    
    -- Contract verification and metadata
    verified BOOLEAN DEFAULT false,
    deploy_tx_hash VARCHAR(66),
    deploy_block_number BIGINT,
    description TEXT,
    website_url TEXT,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Mint history table - stores completed mints for analytics
CREATE TABLE IF NOT EXISTS mint_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_address VARCHAR(42) NOT NULL,
    payment_tx_hash VARCHAR(66),
    tx_hash_bytes32 VARCHAR(66) NOT NULL UNIQUE,
    token_address VARCHAR(42),
    mint_tx_hash VARCHAR(66) NOT NULL,
    amount VARCHAR(78) NOT NULL,
    block_number BIGINT,
    payment_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Mint queue table - stores pending mint requests
CREATE TABLE IF NOT EXISTS mint_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_address VARCHAR(42) NOT NULL,
    payment_tx_hash VARCHAR(66),
    authorization_data JSONB,
    tx_hash_bytes32 VARCHAR(66) NOT NULL UNIQUE,
    token_address VARCHAR(42),
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMP,
    mint_tx_hash VARCHAR(66),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    payment_type VARCHAR(20) DEFAULT 'x402' NOT NULL,
    queue_position INTEGER
);

-- System settings table for extensibility
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mint_queue_status ON mint_queue(status);
CREATE INDEX IF NOT EXISTS idx_mint_queue_created_at ON mint_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_mint_queue_payer ON mint_queue(payer_address);
CREATE INDEX IF NOT EXISTS idx_mint_queue_token ON mint_queue(token_address);
CREATE INDEX IF NOT EXISTS idx_mint_history_payer ON mint_history(payer_address);
CREATE INDEX IF NOT EXISTS idx_mint_history_created_at ON mint_history(created_at);
CREATE INDEX IF NOT EXISTS idx_mint_history_token ON mint_history(token_address);
CREATE INDEX IF NOT EXISTS idx_batch_mints_status ON batch_mints(status);
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_deployer ON deployed_tokens(deployer_address);
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_network ON deployed_tokens(network);
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_created_at ON deployed_tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_active ON deployed_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_tokens_lp_pending ON deployed_tokens(liquidity_deployed, is_active) 
    WHERE liquidity_deployed = false AND is_active = true;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_mint_queue_updated_at ON mint_queue;
CREATE TRIGGER update_mint_queue_updated_at BEFORE UPDATE ON mint_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deployed_tokens_updated_at ON deployed_tokens;
CREATE TRIGGER update_deployed_tokens_updated_at BEFORE UPDATE ON deployed_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
    ('batch_interval_seconds', '10', 'Seconds between batch mint operations'),
    ('max_batch_size', '50', 'Maximum number of mints per batch'),
    ('retry_max_attempts', '3', 'Maximum retry attempts for failed mints')
ON CONFLICT (key) DO NOTHING;

-- View for queue statistics
CREATE OR REPLACE VIEW queue_stats AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    MIN(created_at) FILTER (WHERE status = 'pending') as oldest_pending,
    COUNT(DISTINCT payer_address) FILTER (WHERE status = 'pending') as unique_payers_pending
FROM mint_queue
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Comments on deployed_tokens
COMMENT ON TABLE deployed_tokens IS 'Deployed tokens using Uniswap V3';
COMMENT ON COLUMN deployed_tokens.position_manager IS 'Uniswap V3 NonfungiblePositionManager address';
COMMENT ON COLUMN deployed_tokens.lp_deployer_address IS 'Address that will receive tokens and USDC for LP deployment';
COMMENT ON COLUMN deployed_tokens.pool_fee IS 'Uniswap V3 pool fee tier (3000 = 0.3%, 500 = 0.05%, 10000 = 1%)';
COMMENT ON COLUMN deployed_tokens.pool_tick_spacing IS 'Pool tick spacing (e.g., 200)';
COMMENT ON COLUMN deployed_tokens.lp_token_id IS 'Uniswap V3 NFT position token ID';
COMMENT ON COLUMN deployed_tokens.lp_retry_count IS 'Number of times LP deployment has been retried';
COMMENT ON COLUMN deployed_tokens.lp_deployment_error IS 'Last error message if LP deployment failed';
COMMENT ON COLUMN deployed_tokens.lp_deployment_error_at IS 'Timestamp of last LP deployment error';
COMMENT ON COLUMN deployed_tokens.liquidity_tx_hash IS 'Transaction hash of liquidity deployment';
COMMENT ON COLUMN deployed_tokens.liquidity_deployed_at IS 'Timestamp when liquidity was deployed';
