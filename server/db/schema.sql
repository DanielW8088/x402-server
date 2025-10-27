-- Database schema for token mint queue system
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Mint queue table - stores pending mint requests
CREATE TABLE IF NOT EXISTS mint_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payer_address VARCHAR(42) NOT NULL,
    payment_tx_hash VARCHAR(66),
    authorization_data JSONB,
    tx_hash_bytes32 VARCHAR(66) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP,
    mint_tx_hash VARCHAR(66),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    payment_type VARCHAR(20) NOT NULL DEFAULT 'x402', -- x402, custom, gasless
    queue_position INTEGER
);

-- Mint history table - stores completed mints for analytics
CREATE TABLE IF NOT EXISTS mint_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payer_address VARCHAR(42) NOT NULL,
    payment_tx_hash VARCHAR(66),
    tx_hash_bytes32 VARCHAR(66) NOT NULL UNIQUE,
    mint_tx_hash VARCHAR(66) NOT NULL,
    amount VARCHAR(78) NOT NULL, -- BigInt as string
    block_number BIGINT,
    payment_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Batch mint records - tracks batch mint transactions
CREATE TABLE IF NOT EXISTS batch_mints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_tx_hash VARCHAR(66) NOT NULL UNIQUE,
    mint_count INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, confirmed, failed
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    block_number BIGINT,
    gas_used BIGINT,
    error_message TEXT
);

-- System settings table for extensibility
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mint_queue_status ON mint_queue(status);
CREATE INDEX IF NOT EXISTS idx_mint_queue_created_at ON mint_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_mint_queue_payer ON mint_queue(payer_address);
CREATE INDEX IF NOT EXISTS idx_mint_history_payer ON mint_history(payer_address);
CREATE INDEX IF NOT EXISTS idx_mint_history_created_at ON mint_history(created_at);
CREATE INDEX IF NOT EXISTS idx_batch_mints_status ON batch_mints(status);

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

