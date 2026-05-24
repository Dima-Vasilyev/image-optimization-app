const fs = require('fs');
const path = require('path');
const config = require('../config');

function cleanupOldFiles() {
  const { tempDir, cleanup } = config;
  const cutoff = Date.now() - cleanup.maxAge;
  let removed = 0;

  let entries;
  try {
    entries = fs.readdirSync(tempDir);
  } catch {
    return; // temp dir may not exist yet during first startup tick
  }

  for (const entry of entries) {
    const filePath = path.join(tempDir, entry);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch {
      // individual file may already be deleted by another worker — ignore
    }
  }

  if (removed > 0) {
    console.log(`[cleanup] removed ${removed} stale temp file(s)`);
  }
}

function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // already gone
  }
}

function startCleanupScheduler() {
  cleanupOldFiles();
  const timer = setInterval(cleanupOldFiles, config.cleanup.interval);
  // Don't block process exit on the interval
  if (timer.unref) timer.unref();
  console.log(`[cleanup] scheduler started — interval ${config.cleanup.interval / 1000}s, max-age ${config.cleanup.maxAge / 60000}min`);
}

module.exports = { cleanupOldFiles, deleteFile, startCleanupScheduler };
