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
      env: { NODE_ENV: 'production' },
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
      env: { NODE_ENV: 'production' },
      error_file: './logs/lp-deployer-error.log',
      out_file: './logs/lp-deployer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true,
    },
    {
      name: 'ai-mint-executor',
      script: 'dist/ai-mint-executor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
      error_file: './logs/ai-mint-error.log',
      out_file: './logs/ai-mint-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      time: true,
    }
  ]
};

