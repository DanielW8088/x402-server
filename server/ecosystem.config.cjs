/**
 * PM2 Configuration for Token Mint Platform
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs                    # Start all services
 *   pm2 start ecosystem.config.cjs --only token-server    # Start token-server only
 *   pm2 start ecosystem.config.cjs --only lp-deployer     # Start lp-deployer only
 *   pm2 restart ecosystem.config.cjs                  # Restart all
 *   pm2 stop ecosystem.config.cjs                     # Stop all
 *   pm2 logs                                          # View all logs
 *   pm2 logs token-server                             # View token-server logs
 *   pm2 logs lp-deployer                              # View lp-deployer logs
 * 
 * Requirements:
 *   - .env file with all required variables
 *   - LaunchTool deployed on target network (for lp-deployer)
 *   - LP_DEPLOYER wallet with sufficient USDC (for lp-deployer)
 */

// Load environment variables from .env file
require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'token-server',
      script: 'dist/index-multi-token.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true,
    },
    {
      name: 'lp-deployer',
      script: 'lp-deployer-standalone.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      cwd: process.cwd(),
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

