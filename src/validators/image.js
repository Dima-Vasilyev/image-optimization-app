const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Rejected types get an explicit message so clients understand why.
const REJECTED_MIME_TYPES = new Set(['image/gif', 'image/svg+xml', 'image/bmp', 'image/tiff']);

function isAllowedMimeType(mimetype) {
  return ALLOWED_MIME_TYPES.has(mimetype);
}

function isAllowedExtension(ext) {
  return ALLOWED_EXTENSIONS.has(ext.toLowerCase());
}

function explainRejection(mimetype) {
  if (REJECTED_MIME_TYPES.has(mimetype)) {
    return `${mimetype} is not supported. Only JPEG, PNG, and WebP are accepted.`;
  }
  return `Unsupported file type. Only JPEG, PNG, and WebP are accepted.`;
}

module.exports = { isAllowedMimeType, isAllowedExtension, explainRejection, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS };
