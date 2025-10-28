-- 更新队列批处理间隔时间

-- 查看当前配置
SELECT key, value, description 
FROM system_settings 
WHERE key IN ('batch_interval_seconds', 'max_batch_size');

-- 更新间隔时间为 2 秒
UPDATE system_settings 
SET value = '2', updated_at = NOW() 
WHERE key = 'batch_interval_seconds';

-- 验证更新
SELECT key, value, description, updated_at 
FROM system_settings 
WHERE key = 'batch_interval_seconds';

-- 提示
SELECT '⚠️ 需要重启服务才能生效：pm2 restart all' as notice;

