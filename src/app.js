const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const rateLimiter = require('./middleware/rateLimiter');
const pageRoutes = require('./routes/pages');
const apiRoutes = require('./routes/api');
const { startCleanupScheduler } = require('./utils/cleanup');

const app = express();

// Helmet sets secure HTTP headers. CSP is relaxed just enough for inline blob/data
// images used by the drag-and-drop preview.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
    },
  },
}));

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(express.static(path.join(__dirname, '../public')));

// Rate limiter scoped only to the API — the HTML page is excluded.
app.use('/api', rateLimiter, apiRoutes);
app.use('/', pageRoutes);

// Global error handler (catches anything that reaches here via next(err))
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

startCleanupScheduler();

module.exports = app;
