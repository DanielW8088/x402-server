/**
 * PM2 Configuration for LP Deployer v2.0
 * 
 * Usage:
 *   pm2 start ecosystem.lp-deployer.cjs
 *   pm2 logs lp-deployer
 *   pm2 restart lp-deployer
 *   pm2 stop lp-deployer
 * 
 * Requirements:
 *   - .env file with all required variables
 *   - LaunchTool deployed on target network
 *   - LP_DEPLOYER wallet with sufficient USDC
 */
module.exports = {
    apps: [
        {
            name: 'lp-deployer',
            script: 'lp-deployer-standalone.ts',
            interpreter: 'npx',
            interpreter_args: 'tsx',
            cwd: process.cwd(), // Explicitly set working directory
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            env: {
                NODE_ENV: 'production'
            },
            error_file: './logs/lp-deployer-error.log',
            out_file: './logs/lp-deployer-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,
            time: true,
        }
    ]
};

