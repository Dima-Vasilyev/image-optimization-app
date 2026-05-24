const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { handleSingleUpload } = require('../middleware/upload');
const { deleteFile } = require('../utils/cleanup');
const config = require('../config');

const router = express.Router();

// ── POST /api/upload ────────────────────────────────────────────────────────
router.post('/upload', handleSingleUpload, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' });
  }

  const inputPath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const outputFilename = `opt-${uuidv4()}${ext}`;
  const outputPath = path.join(config.tempDir, outputFilename);

  try {
    const originalSize = req.file.size;

    // Read metadata before applying format-specific pipeline
    const metadata = await sharp(inputPath).metadata();

    let pipeline = sharp(inputPath);

    if (req.file.mimetype === 'image/jpeg') {
      pipeline = pipeline.jpeg(config.sharp.jpeg);
    } else if (req.file.mimetype === 'image/png') {
      pipeline = pipeline.png(config.sharp.png);
    } else if (req.file.mimetype === 'image/webp') {
      pipeline = pipeline.webp(config.sharp.webp);
    }

    await pipeline.toFile(outputPath);

    const optimizedSize = fs.statSync(outputPath).size;
    const savedPct = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);

    return res.json({
      success: true,
      original: {
        filename: req.file.originalname,
        size: originalSize,
        sizeFormatted: formatBytes(originalSize),
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        url: `/api/file/${path.basename(inputPath)}`,
      },
      optimized: {
        filename: outputFilename,
        size: optimizedSize,
        sizeFormatted: formatBytes(optimizedSize),
        savedPct: parseFloat(savedPct),
        savedPctFormatted: `${savedPct}%`,
        url: `/api/file/${outputFilename}`,
        downloadUrl: `/api/download/${outputFilename}`,
      },
    });
  } catch (err) {
    deleteFile(inputPath);
    deleteFile(outputPath);
    console.error('[upload] processing error:', err.message);
    return res.status(422).json({ error: 'Could not process image. The file may be corrupt or unsupported.' });
  }
});

// ── GET /api/file/:filename ─────────────────────────────────────────────────
router.get('/file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // strip any path traversal
  const filePath = path.join(config.tempDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or has expired.' });
  }

  res.sendFile(filePath);
});

// ── GET /api/download/:filename ─────────────────────────────────────────────
router.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(config.tempDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or has expired.' });
  }

  res.download(filePath, `optimized-${filename}`);
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

module.exports = router;
