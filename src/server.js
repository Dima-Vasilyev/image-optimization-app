const fs = require('fs');
const app = require('./app');
const config = require('./config');

// Ensure temp directory exists before the first request lands
fs.mkdirSync(config.tempDir, { recursive: true });

const server = app.listen(config.port, () => {
  console.log(`[server] Image Optimization App listening on port ${config.port}`);
  console.log(`[server] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} — shutting down gracefully`);
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
  // Force-quit after 10 s if connections won't drain
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
