-- Add 'sent' and 'confirmation_failed' status to payment_queue
-- Supports async payment processing: send tx first, confirm in background

-- Drop existing constraint
ALTER TABLE payment_queue DROP CONSTRAINT IF EXISTS payment_queue_status_check;

-- Add new constraint with additional statuses
ALTER TABLE payment_queue 
  ADD CONSTRAINT payment_queue_status_check 
  CHECK (status IN ('pending', 'processing', 'sent', 'completed', 'failed', 'confirmation_failed'));

-- Create index for 'sent' status to optimize confirmation processing
CREATE INDEX IF NOT EXISTS idx_payment_queue_sent_processed
  ON payment_queue(status, processed_at)
  WHERE status = 'sent';

-- Add comment
COMMENT ON COLUMN payment_queue.status IS 'Status: pending (queued), processing (sending tx), sent (tx sent, awaiting confirmation), completed (confirmed), failed (send failed), confirmation_failed (tx sent but confirmation failed/timeout)';

