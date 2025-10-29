module.exports = {
    apps: [
        {
            name: 'lp-deployer',
            script: 'lp-deployer-standalone.ts',
            interpreter: 'tsx',
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
        }
    ]
};

