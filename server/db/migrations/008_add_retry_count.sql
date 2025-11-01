-- Add retry_count column to ai_agent_tasks table
-- This tracks how many times a task has been attempted

ALTER TABLE ai_agent_tasks
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_agent_tasks_retry_count 
ON ai_agent_tasks(retry_count);

-- Update existing tasks to have retry_count = 0
UPDATE ai_agent_tasks
SET retry_count = 0
WHERE retry_count IS NULL;

