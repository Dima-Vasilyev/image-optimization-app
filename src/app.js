const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const pageRoutes = require('./routes/pages');
const apiRoutes  = require('./routes/api');
const { startCleanupScheduler } = require('./utils/cleanup');

const app = express();

// Helmet sets secure HTTP headers. CSP is relaxed just enough for inline blob/data
// images used by the drag-and-drop preview.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      // 'unsafe-eval' is required for opencv.js: the asm.js bundle uses
      // new Function() twice during module initialisation. All scripts are
      // still origin-restricted to 'self'; we accept no user-supplied code.
      scriptSrc:   ["'self'", "'unsafe-eval'"],
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

// Serve the pre-built OpenCV.js asm.js bundle from node_modules.
// Long cache is safe: the path is version-pinned via package-lock.json.
app.use('/vendor/opencv', express.static(
  path.join(__dirname, '../node_modules/@techstark/opencv-js/dist'),
  { maxAge: '7d' },
));

// Rate limits are applied per-route inside apiRoutes (strict for upload/download,
// permissive for reprocess which fires on every debounced slider change).
app.use('/api', apiRoutes);
app.use('/', pageRoutes);

// Global error handler (catches anything that reaches here via next(err))
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

startCleanupScheduler();

module.exports = app;
