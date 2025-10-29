-- Payment queue table for serial processing to avoid nonce conflicts
CREATE TABLE IF NOT EXISTS payment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_type VARCHAR(10) NOT NULL CHECK (payment_type IN ('deploy', 'mint')),
  token_address VARCHAR(42), -- Token contract address (for mint payments)
  "authorization" JSONB NOT NULL, -- EIP-3009 authorization data
  payer VARCHAR(42) NOT NULL,
  amount VARCHAR(100) NOT NULL, -- Payment amount in wei
  payment_token_address VARCHAR(42) NOT NULL, -- USDC/USDT address
  metadata JSONB, -- Additional data (deployment config, mint params, etc.)
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  tx_hash VARCHAR(66), -- Transaction hash after processing
  result JSONB, -- Processing result (deployed token info, etc.)
  error TEXT, -- Error message if failed
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  CONSTRAINT valid_token_address_for_mint CHECK (
    payment_type != 'mint' OR token_address IS NOT NULL
  )
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_payment_queue_status_created
  ON payment_queue(status, created_at)
  WHERE status = 'pending';

-- Index for payment status lookup
CREATE INDEX IF NOT EXISTS idx_payment_queue_id ON payment_queue(id);

-- Index for payer lookup
CREATE INDEX IF NOT EXISTS idx_payment_queue_payer ON payment_queue(payer);

-- Add payment batch interval setting (default 2000ms = 2 seconds)
INSERT INTO system_settings (key, value, description)
VALUES (
  'payment_batch_interval_ms',
  '2000',
  'Interval in milliseconds for processing payment queue batches (prevents nonce conflicts)'
)
ON CONFLICT (key) DO NOTHING;

-- Add comment
COMMENT ON TABLE payment_queue IS 'Queue for serial processing of USDC payment transactions to prevent nonce conflicts';

