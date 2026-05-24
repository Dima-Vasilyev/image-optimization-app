const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * Run the Sharp optimisation pipeline and write the result to tempDir.
 *
 * @param {string} inputPath  Absolute path to the source file
 * @param {object} params
 * @param {string} params.mimetype      'image/jpeg' | 'image/png' | 'image/webp'
 * @param {number} [params.quality=85]  1–95 (JPEG / WebP only; ignored for PNG)
 * @param {number} [params.resize=100]  Output size as % of input, 10–200
 * @param {boolean}[params.stripMeta=true]  Strip EXIF / XMP / ICC metadata
 * @param {string} [params.preset='balanced']  'speed' | 'balanced' | 'max_quality'
 * @returns {{ outputPath, outputFilename, size, width, height }}
 */
async function processImage(inputPath, params) {
  const {
    mimetype,
    quality    = 85,
    resize     = 100,
    stripMeta  = true,
    preset     = 'balanced',
  } = params;

  const presetCfg = config.presets[preset] ?? config.presets.balanced;
  const ext       = path.extname(inputPath).toLowerCase() || '.jpg';
  const outName   = `opt-${uuidv4()}${ext}`;
  const outPath   = path.join(config.tempDir, outName);

  // ── Metadata (needed for resize dimension calc) ──────────────────────────
  const meta = await sharp(inputPath).metadata();

  // EXIF orientations 5–8 indicate 90°/270° physical rotation — after
  // .rotate() the logical width and height are swapped.
  const postRotW = [5, 6, 7, 8].includes(meta.orientation) ? meta.height : meta.width;

  // ── Pipeline ─────────────────────────────────────────────────────────────
  let p = sharp(inputPath);

  // Auto-orient: reads EXIF Orientation tag and rotates pixels accordingly.
  // Must come first so subsequent ops work in display coordinates.
  p = p.rotate();

  if (resize !== 100) {
    const newWidth = Math.max(1, Math.round(postRotW * resize / 100));
    // Omitting height lets Sharp derive it to preserve aspect ratio.
    p = p.resize(newWidth);
  }

  // withMetadata() preserves EXIF/ICC. Omitting it (the default) strips all.
  if (!stripMeta) p = p.withMetadata();

  const q = Math.min(95, Math.max(1, quality));

  if (mimetype === 'image/jpeg') {
    p = p.jpeg({ quality: q, ...presetCfg.jpeg });
  } else if (mimetype === 'image/png') {
    p = p.png(presetCfg.png);
  } else if (mimetype === 'image/webp') {
    p = p.webp({ quality: q, ...presetCfg.webp });
  }

  await p.toFile(outPath);

  const outMeta = await sharp(outPath).metadata();

  return {
    outputPath:     outPath,
    outputFilename: outName,
    size:           fs.statSync(outPath).size,
    width:          outMeta.width,
    height:         outMeta.height,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

module.exports = { processImage, formatBytes };
