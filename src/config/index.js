const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  tempDir: path.join(__dirname, '../../temp'),
  maxFileSize: 25 * 1024 * 1024, // 25 MB
  rateLimit: {
    windowMs:     60 * 1000, // 1 minute
    maxStrict:    30,         // upload / file / download
    maxPermissive: 120,       // reprocess (called on every slider debounce)
  },
  cleanup: {
    maxAge:   30 * 60 * 1000, // delete files older than 30 min
    interval:  5 * 60 * 1000, // run every 5 min
  },
  // Presets define encoder behaviour; quality is always a separate parameter.
  // Behaviour doc: selecting a preset resets the quality slider to the preset's
  // defaultQuality. Moving the slider afterwards keeps the preset's encoder
  // settings (mozjpeg, effort, chroma subsampling) but uses the custom quality.
  presets: {
    speed: {
      defaultQuality: 75,
      jpeg: { mozjpeg: false, progressive: false, chromaSubsampling: '4:2:0' },
      png:  { compressionLevel: 3, adaptiveFiltering: false },
      webp: { effort: 1 },
    },
    balanced: {
      defaultQuality: 85,
      jpeg: { mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' },
      png:  { compressionLevel: 6, adaptiveFiltering: true },
      webp: { effort: 4 },
    },
    max_quality: {
      defaultQuality: 95,
      jpeg: { mozjpeg: true, progressive: true, chromaSubsampling: '4:4:4' },
      png:  { compressionLevel: 9, adaptiveFiltering: true },
      webp: { effort: 6 },
    },
  },
};
