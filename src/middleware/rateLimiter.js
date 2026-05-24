const rateLimit = require('express-rate-limit');
const config = require('../config');

function makeLimiter(max) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — please wait before trying again.', retryAfter: 60 },
    handler(req, res, _next, options) {
      res.status(429).json(options.message);
    },
  });
}

// 30 req/min — upload, file-serve, download (heavy or once-per-session)
const strictLimiter = makeLimiter(config.rateLimit.maxStrict);

// 120 req/min — reprocess (fired on every debounced slider change)
const permissiveLimiter = makeLimiter(config.rateLimit.maxPermissive);

module.exports = { strictLimiter, permissiveLimiter };
