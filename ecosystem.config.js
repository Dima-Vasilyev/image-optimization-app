module.exports = {
  apps: [
    {
      name: 'image-opt',
      script: './src/server.js',
      instances: 'max',      // one worker per CPU core
      exec_mode: 'cluster',  // shared-nothing; temp files use UUIDs so workers don't collide
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
    },
  ],
};
