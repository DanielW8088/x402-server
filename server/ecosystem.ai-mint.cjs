/**
 * PM2 Ecosystem Configuration for AI Mint Executor
 * 
 * Usage:
 *   pm2 start ecosystem.ai-mint.cjs
 *   pm2 stop ai-mint-executor
 *   pm2 restart ai-mint-executor
 *   pm2 logs ai-mint-executor
 *   pm2 delete ai-mint-executor
 */

module.exports = {
    apps: [
        {
            name: "ai-mint-executor",
            script: "./dist/ai-mint-executor.js",
            cwd: __dirname,
            instances: 1, // Only 1 instance to avoid race conditions
            exec_mode: "fork",
            watch: false,
            autorestart: true,
            max_restarts: 10,
            min_uptime: "10s",
            max_memory_restart: "500M",
            env: {
                NODE_ENV: "production",
            },
            error_file: "./logs/ai-mint-error.log",
            out_file: "./logs/ai-mint-out.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
            merge_logs: true,
            time: true,
        },
    ],
};

