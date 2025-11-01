-- Fix stuck tasks in processing status
-- Run this if tasks are stuck in 'processing' status

-- Show stuck tasks
SELECT 
    id,
    user_address,
    token_address,
    status,
    quantity,
    mints_completed,
    mints_failed,
    started_at,
    NOW() - started_at as processing_time
FROM ai_agent_tasks
WHERE status = 'processing'
  AND started_at < NOW() - INTERVAL '5 minutes';

-- Uncomment to fix: Mark as failed if processing for more than 5 minutes
-- UPDATE ai_agent_tasks
-- SET 
--     status = 'failed',
--     error_message = 'Task timeout - processing too long',
--     completed_at = NOW()
-- WHERE status = 'processing'
--   AND started_at < NOW() - INTERVAL '5 minutes';

-- Or uncomment to retry: Reset to funded
-- UPDATE ai_agent_tasks
-- SET 
--     status = 'funded',
--     error_message = NULL
-- WHERE status = 'processing'
--   AND started_at < NOW() - INTERVAL '5 minutes';

