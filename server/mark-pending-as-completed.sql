-- Mark all pending mints as completed (skip actual minting)
-- WARNING: This will NOT perform actual on-chain minting!
-- Only use if mints are already completed on-chain or you need to stop processing

-- 1. Preview what will be changed (run this first)
SELECT 
  id,
  payer_address,
  token_address,
  tx_hash_bytes32,
  status,
  payment_type,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM mint_queue
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 20;

-- Count by status
SELECT status, COUNT(*) as count
FROM mint_queue
GROUP BY status;

-- ============================================
-- 2. Backup (optional but recommended)
-- ============================================

-- Create backup table
CREATE TABLE IF NOT EXISTS mint_queue_backup_before_manual_complete AS
SELECT * FROM mint_queue WHERE status = 'pending';

-- Verify backup
SELECT COUNT(*) as backed_up_count FROM mint_queue_backup_before_manual_complete;

-- ============================================
-- 3. Execute the update (CAREFUL!)
-- ============================================

BEGIN;

-- Update mint_queue to completed
UPDATE mint_queue
SET 
  status = 'completed',
  mint_tx_hash = 'manual-completed',
  processed_at = NOW(),
  updated_at = NOW()
WHERE status = 'pending'
RETURNING id, payer_address, tx_hash_bytes32, token_address;

-- Move to mint_history (if not already there)
INSERT INTO mint_history 
(payer_address, payment_tx_hash, tx_hash_bytes32, token_address, mint_tx_hash, amount, payment_type, completed_at)
SELECT 
  payer_address,
  payment_tx_hash,
  tx_hash_bytes32,
  token_address,
  'manual-completed' as mint_tx_hash,
  '0' as amount,
  payment_type,
  NOW() as completed_at
FROM mint_queue
WHERE status = 'completed'
AND mint_tx_hash = 'manual-completed'
ON CONFLICT (tx_hash_bytes32) DO NOTHING;

-- Verify changes
SELECT 
  'Before' as stage,
  status,
  COUNT(*) as count
FROM mint_queue_backup_before_manual_complete
GROUP BY status
UNION ALL
SELECT 
  'After' as stage,
  status,
  COUNT(*) as count
FROM mint_queue
GROUP BY status
ORDER BY stage, status;

-- If everything looks good, commit
COMMIT;

-- If something is wrong, rollback
-- ROLLBACK;

-- ============================================
-- 4. Verification queries
-- ============================================

-- Check how many were marked as manual-completed
SELECT COUNT(*) as manual_completed_count
FROM mint_queue
WHERE mint_tx_hash = 'manual-completed';

-- Check mint_history
SELECT COUNT(*) as history_count
FROM mint_history
WHERE mint_tx_hash = 'manual-completed';

-- Current queue status
SELECT status, COUNT(*) as count
FROM mint_queue
GROUP BY status
ORDER BY status;

-- ============================================
-- 5. Cleanup backup (optional, after verification)
-- ============================================

-- DROP TABLE IF EXISTS mint_queue_backup_before_manual_complete;

