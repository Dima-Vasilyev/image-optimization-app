const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { isAllowedMimeType, isAllowedExtension, explainRejection } = require('../validators/image');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.tempDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!isAllowedMimeType(file.mimetype)) {
    const err = new Error(explainRejection(file.mimetype));
    err.code = 'INVALID_FILE_TYPE';
    return cb(err);
  }
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext && !isAllowedExtension(ext)) {
    const err = new Error(`File extension "${ext}" is not allowed.`);
    err.code = 'INVALID_FILE_TYPE';
    return cb(err);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxFileSize, files: 1 },
});

// Wrap multer so route handlers receive clean error responses instead of raw multer errors.
function handleSingleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum allowed size is 25 MB.' });
    }
    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(415).json({ error: err.message });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected field name. Use "image".' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  });
}

module.exports = { handleSingleUpload };
