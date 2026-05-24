const express = require('express');
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');
const { handleSingleUpload }          = require('../middleware/upload');
const { strictLimiter, permissiveLimiter } = require('../middleware/rateLimiter');
const { processImage, formatBytes }   = require('../utils/processImage');
const { deleteFile }                  = require('../utils/cleanup');
const config                          = require('../config');

const router = express.Router();

const VALID_PRESETS   = new Set(['speed', 'balanced', 'max_quality']);
const VALID_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ── POST /api/upload ──────────────────────────────────────────────────────────
router.post('/upload', strictLimiter, handleSingleUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

  const inputPath = req.file.path;

  try {
    const result = await processImage(inputPath, {
      mimetype:  req.file.mimetype,
      quality:   85,
      resize:    100,
      stripMeta: true,
      preset:    'balanced',
    });

    const origSize  = req.file.size;
    const savedPct  = ((origSize - result.size) / origSize * 100).toFixed(1);

    const srcMeta = await sharp(inputPath).metadata();

    return res.json({
      success: true,
      original: {
        filename:     req.file.originalname,
        fileId:       path.basename(inputPath),
        mimetype:     req.file.mimetype,
        size:         origSize,
        sizeFormatted: formatBytes(origSize),
        width:        srcMeta.width,
        height:       srcMeta.height,
        format:       srcMeta.format,
        url:          `/api/file/${path.basename(inputPath)}`,
      },
      optimized: {
        fileId:           result.outputFilename,
        size:             result.size,
        sizeFormatted:    formatBytes(result.size),
        savedPct:         parseFloat(savedPct),
        savedPctFormatted:`${savedPct}%`,
        width:            result.width,
        height:           result.height,
        url:              `/api/file/${result.outputFilename}`,
        downloadUrl:      `/api/download/${result.outputFilename}`,
      },
    });
  } catch (err) {
    deleteFile(inputPath);
    console.error('[upload]', err.message);
    return res.status(422).json({ error: 'Could not process image. The file may be corrupt or unsupported.' });
  }
});

// ── POST /api/reprocess ───────────────────────────────────────────────────────
// Called on every debounced settings change. Body: JSON.
router.post('/reprocess', permissiveLimiter, async (req, res) => {
  const { originalFileId, prevOptFileId, mimetype, quality, resize, stripMeta, preset } = req.body ?? {};

  // ── Validate ──────────────────────────────────────────────────────────────
  const origName = path.basename(originalFileId ?? '');
  if (!origName) return res.status(400).json({ error: 'originalFileId required.' });
  if (!VALID_MIMETYPES.has(mimetype)) return res.status(400).json({ error: 'Invalid mimetype.' });
  if (quality != null && (quality < 1 || quality > 95 || !Number.isInteger(+quality))) {
    return res.status(400).json({ error: 'quality must be an integer 1–95.' });
  }
  if (resize != null && (resize < 10 || resize > 200 || !Number.isInteger(+resize))) {
    return res.status(400).json({ error: 'resize must be an integer 10–200.' });
  }
  if (preset != null && !VALID_PRESETS.has(preset)) {
    return res.status(400).json({ error: 'Invalid preset.' });
  }

  const inputPath = path.join(config.tempDir, origName);
  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'Original file not found or has expired. Please re-upload.' });
  }

  try {
    const result = await processImage(inputPath, {
      mimetype,
      quality:  quality  != null ? +quality  : 85,
      resize:   resize   != null ? +resize   : 100,
      stripMeta: stripMeta !== false,
      preset:   VALID_PRESETS.has(preset) ? preset : 'balanced',
    });

    // Delete the file it replaced now that the new one is written.
    if (prevOptFileId) {
      const prevName = path.basename(prevOptFileId);
      deleteFile(path.join(config.tempDir, prevName));
    }

    const origSize = fs.statSync(inputPath).size;
    const savedPct = ((origSize - result.size) / origSize * 100).toFixed(1);

    return res.json({
      success: true,
      optimized: {
        fileId:            result.outputFilename,
        size:              result.size,
        sizeFormatted:     formatBytes(result.size),
        savedPct:          parseFloat(savedPct),
        savedPctFormatted: `${savedPct}%`,
        width:             result.width,
        height:            result.height,
        url:               `/api/file/${result.outputFilename}`,
        downloadUrl:       `/api/download/${result.outputFilename}`,
      },
    });
  } catch (err) {
    console.error('[reprocess]', err.message);
    return res.status(422).json({ error: 'Processing failed. The file may have expired — please re-upload.' });
  }
});

// ── GET /api/file/:filename ───────────────────────────────────────────────────
router.get('/file/:filename', strictLimiter, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(config.tempDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or has expired.' });
  }

  res.sendFile(filePath);
});

// ── GET /api/download/:filename ───────────────────────────────────────────────
// No-retention: file is deleted from temp after the download stream closes.
router.get('/download/:filename', strictLimiter, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(config.tempDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or has expired.' });
  }

  res.download(filePath, `optimized-${filename}`, (err) => {
    if (!err) deleteFile(filePath);
  });
});

module.exports = router;
