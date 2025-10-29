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
    },
    // LP Deployer - disabled by default, start manually with: pm2 start lp-deployer
    // {
    //   name: 'lp-deployer',
    //   script: 'lp-deployer-standalone.ts',
    //   interpreter: 'tsx',
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '300M',
    //   env: {
    //     NODE_ENV: 'production'
    //   },
    //   error_file: './logs/lp-deployer-error.log',
    //   out_file: './logs/lp-deployer-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // }
  ]
};

