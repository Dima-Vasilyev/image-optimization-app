const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  tempDir: path.join(__dirname, '../../temp'),
  maxFileSize: 25 * 1024 * 1024, // 25 MB
  rateLimit: {
    windowMs: 60 * 1000,  // 1 minute
    max: 30,
  },
  cleanup: {
    maxAge: 30 * 60 * 1000,    // remove files older than 30 min
    interval: 5 * 60 * 1000,   // run every 5 min
  },
  sharp: {
    jpeg: { quality: 80, mozjpeg: true, progressive: true },
    png:  { compressionLevel: 9, adaptiveFiltering: true },
    webp: { quality: 80, effort: 4 },
  },
};
