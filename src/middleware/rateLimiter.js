const rateLimit = require('express-rate-limit');
const config = require('../config');

module.exports = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,   // Return RateLimit-* headers (RFC draft 6)
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait before trying again.', retryAfter: 60 },
  handler(req, res, _next, options) {
    res.status(429).json(options.message);
  },
});
