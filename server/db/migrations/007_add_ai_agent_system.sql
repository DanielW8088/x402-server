-- Migration 006: AI Agent System
-- Adds tables for AI agent wallets, chat history, and mint tasks

-- AI Agent Wallets - Each user has one agent wallet
CREATE TABLE IF NOT EXISTS ai_agent_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL UNIQUE, -- User's main wallet (lowercase)
    agent_address VARCHAR(42) NOT NULL UNIQUE, -- Agent's wallet address (lowercase)
    encrypted_private_key TEXT NOT NULL, -- Encrypted with AES-256-GCM
    usdc_balance BIGINT DEFAULT 0, -- Cached balance in USDC wei (6 decimals)
    last_balance_check TIMESTAMP, -- Last time we checked on-chain balance
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_agent_user ON ai_agent_wallets(user_address);
CREATE INDEX IF NOT EXISTS idx_ai_agent_address ON ai_agent_wallets(agent_address);

-- AI Agent Chat History
CREATE TABLE IF NOT EXISTS ai_agent_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL, -- User's main wallet
    message TEXT NOT NULL, -- Chat message content
    role VARCHAR(20) NOT NULL, -- 'user' or 'assistant'
    metadata JSONB, -- Additional data (e.g., token address, quantity)
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for retrieving user's chat history
CREATE INDEX IF NOT EXISTS idx_chat_user_time ON ai_agent_chats(user_address, created_at DESC);

-- AI Agent Mint Tasks
CREATE TABLE IF NOT EXISTS ai_agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL, -- User's main wallet
    agent_wallet_id UUID REFERENCES ai_agent_wallets(id) ON DELETE CASCADE,
    token_address VARCHAR(42) NOT NULL, -- Token to mint
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000), -- Number of mints
    price_per_mint BIGINT NOT NULL, -- Price in USDC wei (6 decimals)
    total_cost BIGINT NOT NULL, -- Total cost = price_per_mint * quantity
    
    -- Task status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending_payment', 
    -- 'pending_payment' -> waiting for user to send USDC
    -- 'funded' -> USDC received, ready to execute
    -- 'processing' -> currently minting
    -- 'completed' -> all mints done
    -- 'failed' -> error occurred
    -- 'cancelled' -> user cancelled
    
    mints_completed INTEGER DEFAULT 0, -- How many mints finished
    mints_failed INTEGER DEFAULT 0, -- How many mints failed
    
    -- Payment tracking
    funding_tx_hash VARCHAR(66), -- Transaction hash of user's USDC transfer
    funding_received_at TIMESTAMP, -- When we detected the payment
    
    -- Execution details
    started_at TIMESTAMP, -- When mint execution started
    completed_at TIMESTAMP, -- When all mints finished
    error_message TEXT, -- Error details if failed
    
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for task queries
CREATE INDEX IF NOT EXISTS idx_task_user ON ai_agent_tasks(user_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_status ON ai_agent_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_task_agent ON ai_agent_tasks(agent_wallet_id, status);

-- AI Agent Mint Records (detailed log of each mint in a task)
CREATE TABLE IF NOT EXISTS ai_agent_mint_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES ai_agent_tasks(id) ON DELETE CASCADE,
    mint_number INTEGER NOT NULL, -- Which mint in the batch (1 to quantity)
    status VARCHAR(20) NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
    tx_hash VARCHAR(66), -- On-chain transaction hash
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mint_record_task ON ai_agent_mint_records(task_id, mint_number);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_agent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating timestamps
CREATE TRIGGER update_ai_agent_wallets_timestamp
    BEFORE UPDATE ON ai_agent_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_agent_updated_at();

CREATE TRIGGER update_ai_agent_tasks_timestamp
    BEFORE UPDATE ON ai_agent_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_agent_updated_at();

-- Insert initial comment
COMMENT ON TABLE ai_agent_wallets IS 'Stores encrypted agent wallet credentials for each user';
COMMENT ON TABLE ai_agent_chats IS 'Chat history between users and AI agent';
COMMENT ON TABLE ai_agent_tasks IS 'Mint tasks created through AI agent conversations';
COMMENT ON TABLE ai_agent_mint_records IS 'Detailed log of each individual mint within a task';

-- Display success message
DO $$
BEGIN
    RAISE NOTICE '✅ AI Agent system tables created successfully';
    RAISE NOTICE '   - ai_agent_wallets: User agent wallets with encrypted keys';
    RAISE NOTICE '   - ai_agent_chats: Chat conversation history';
    RAISE NOTICE '   - ai_agent_tasks: Mint task management';
    RAISE NOTICE '   - ai_agent_mint_records: Individual mint tracking';
END $$;

