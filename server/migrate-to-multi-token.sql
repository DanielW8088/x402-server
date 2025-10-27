-- Quick migration for existing database to support multi-token
-- Run this: psql $DATABASE_URL < migrate-to-multi-token.sql

BEGIN;

-- Add token_address to mint_queue if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mint_queue' AND column_name = 'token_address'
    ) THEN
        ALTER TABLE mint_queue ADD COLUMN token_address VARCHAR(42);
        CREATE INDEX idx_mint_queue_token ON mint_queue(token_address);
        RAISE NOTICE 'Added token_address to mint_queue';
    ELSE
        RAISE NOTICE 'token_address already exists in mint_queue';
    END IF;
END $$;

-- Add token_address to mint_history if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'mint_history' AND column_name = 'token_address'
    ) THEN
        ALTER TABLE mint_history ADD COLUMN token_address VARCHAR(42);
        CREATE INDEX idx_mint_history_token ON mint_history(token_address);
        RAISE NOTICE 'Added token_address to mint_history';
    ELSE
        RAISE NOTICE 'token_address already exists in mint_history';
    END IF;
END $$;

-- Create deployed_tokens table if it doesn't exist
CREATE TABLE IF NOT EXISTS deployed_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(42) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    deployer_address VARCHAR(42) NOT NULL,
    mint_amount VARCHAR(78) NOT NULL,
    max_mint_count INTEGER NOT NULL,
    price VARCHAR(78) NOT NULL,
    payment_token_address VARCHAR(42) NOT NULL,
    payment_token_symbol VARCHAR(10) NOT NULL,
    pool_manager VARCHAR(42),
    position_manager VARCHAR(42),
    permit2 VARCHAR(42),
    payment_seed VARCHAR(78),
    pool_seed_amount VARCHAR(78),
    sqrt_price_payment_first VARCHAR(78),
    sqrt_price_token_first VARCHAR(78),
    network VARCHAR(20) NOT NULL,
    total_supply VARCHAR(78) DEFAULT '0',
    max_supply VARCHAR(78),
    mint_count INTEGER DEFAULT 0,
    liquidity_deployed BOOLEAN DEFAULT false,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deploy_tx_hash VARCHAR(66),
    deploy_block_number BIGINT,
    description TEXT,
    website_url TEXT,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Create indexes for deployed_tokens if they don't exist
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_deployer ON deployed_tokens(deployer_address);
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_network ON deployed_tokens(network);
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_created_at ON deployed_tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_deployed_tokens_active ON deployed_tokens(is_active);

-- Create or replace trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for deployed_tokens if it doesn't exist
DROP TRIGGER IF EXISTS update_deployed_tokens_updated_at ON deployed_tokens;
CREATE TRIGGER update_deployed_tokens_updated_at
    BEFORE UPDATE ON deployed_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- Display summary
SELECT 'Migration complete!' as status;
SELECT 
    'mint_queue' as table_name,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'mint_queue' AND column_name = 'token_address') as has_token_address
UNION ALL
SELECT 
    'mint_history',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'mint_history' AND column_name = 'token_address')
UNION ALL
SELECT 
    'deployed_tokens',
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'deployed_tokens');

