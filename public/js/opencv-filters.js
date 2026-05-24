/**
 * CVFilters — thin wrapper around OpenCV.js for browser image filtering.
 *
 * Loading strategy: opencv.js is ~10 MB, so it is fetched lazily the first
 * time a CV-dependent filter is requested, not at page load.
 *
 * Usage:
 *   CVFilters.load(onReady, onError)   — start loading; safe to call multiple times
 *   CVFilters.isReady()                — synchronous status check
 *   CVFilters.applyFilter(name, imgEl, canvas, opts)  — draw filtered result onto canvas
 *
 * Invert and Sepia use the Canvas 2D API only and work without OpenCV.
 * All other filters require CVFilters.isReady() === true.
 */
(function () {
  'use strict';

  var OPENCV_URL = '/vendor/opencv/opencv.js';
  var _ready     = false;
  var _loading   = false;
  var _queue     = [];

  // ── Public API ─────────────────────────────────────────────────────────────

  function load(onReady, onError) {
    if (_ready)   { onReady && onReady(); return; }
    if (onReady)  { _queue.push(onReady); }
    if (_loading) { return; }
    _loading = true;

    var script   = document.createElement('script');
    script.src   = OPENCV_URL;
    script.async = true;

    script.onload = function () {
      if (typeof cv === 'undefined') {
        _fail(onError, 'cv global missing after script load');
        return;
      }
      // asm.js builds finish synchronously; WASM builds fire onRuntimeInitialized.
      if (cv.Mat) {
        _markReady();
      } else {
        cv['onRuntimeInitialized'] = _markReady;
      }
    };

    script.onerror = function () {
      _loading = false;
      onError && onError(new Error('Failed to fetch ' + OPENCV_URL));
    };

    document.head.appendChild(script);
  }

  function isReady() { return _ready; }

  /**
   * Apply a filter to `canvas` using `imgEl` as the unmodified pixel source.
   * Always redraws from the original so filters don't compound on re-apply.
   *
   * @param  {string}      filterName  'none' | 'grayscale' | 'blur' | 'sharpen' | 'edges' | 'invert' | 'sepia'
   * @param  {HTMLImageElement} imgEl  Source image (must be same-origin)
   * @param  {HTMLCanvasElement} canvas  Target canvas
   * @param  {object}      [opts]      { radius: number } for blur
   * @returns {boolean}  false if OpenCV not loaded yet for a CV-dependent filter
   */
  function applyFilter(filterName, imgEl, canvas, opts) {
    opts = opts || {};

    var ctx = canvas.getContext('2d');
    canvas.width  = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    ctx.drawImage(imgEl, 0, 0);

    if (filterName === 'none') return true;

    // ── Canvas-only filters (no OpenCV dependency) ────────────────────────
    if (filterName === 'invert' || filterName === 'sepia') {
      _canvasFilter(filterName, ctx, canvas.width, canvas.height);
      return true;
    }

    // ── OpenCV-dependent filters ──────────────────────────────────────────
    if (!_ready) return false;

    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var src = cv.matFromImageData(imageData);
    var dst;

    try {
      switch (filterName) {
        case 'grayscale': dst = _grayscale(src);              break;
        case 'blur':      dst = _blur(src, opts.radius || 5); break;
        case 'sharpen':   dst = _sharpen(src);                break;
        case 'edges':     dst = _edges(src);                  break;
        default:          dst = src.clone();                  break;
      }
      cv.imshow(canvas, dst);
      return true;
    } catch (e) {
      console.error('[CVFilters] filter="' + filterName + '"', e);
      return false;
    } finally {
      src.delete();
      if (dst) dst.delete();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  function _markReady() {
    _ready   = true;
    _loading = false;
    _queue.forEach(function (fn) { fn(); });
    _queue.length = 0;
  }

  function _fail(onError, msg) {
    _loading = false;
    onError && onError(new Error(msg));
  }

  // ── Canvas-only implementations ────────────────────────────────────────────

  function _canvasFilter(name, ctx, w, h) {
    var id = ctx.getImageData(0, 0, w, h);
    var d  = id.data;

    if (name === 'invert') {
      for (var i = 0; i < d.length; i += 4) {
        d[i]     = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
        // alpha unchanged
      }
    } else if (name === 'sepia') {
      // Standard sepia luminance-weighted color matrix
      for (var j = 0; j < d.length; j += 4) {
        var r = d[j], g = d[j + 1], b = d[j + 2];
        d[j]     = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        d[j + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        d[j + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
    }

    ctx.putImageData(id, 0, 0);
  }

  // ── OpenCV implementations ─────────────────────────────────────────────────

  function _grayscale(src) {
    var gray = new cv.Mat();
    var dst  = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(gray, dst,  cv.COLOR_GRAY2RGBA);
    gray.delete();
    return dst;
  }

  function _blur(src, radius) {
    var dst = new cv.Mat();
    // Kernel size must be a positive odd integer
    var k = Math.max(1, radius % 2 === 0 ? radius + 1 : radius);
    cv.GaussianBlur(src, dst, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT);
    return dst;
  }

  function _sharpen(src) {
    var dst    = new cv.Mat();
    // Unsharp-mask-style 3×3 sharpening kernel
    var kernel = cv.matFromArray(3, 3, cv.CV_32F, [
       0, -1,  0,
      -1,  5, -1,
       0, -1,  0
    ]);
    cv.filter2D(src, dst, cv.CV_8U, kernel);
    kernel.delete();
    return dst;
  }

  function _edges(src) {
    var gray  = new cv.Mat();
    var edges = new cv.Mat();
    var dst   = new cv.Mat();
    cv.cvtColor(src, gray,  cv.COLOR_RGBA2GRAY);
    cv.Canny(gray, edges, 50, 150);
    cv.cvtColor(edges, dst, cv.COLOR_GRAY2RGBA);
    gray.delete();
    edges.delete();
    return dst;
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  window.CVFilters = { load: load, isReady: isReady, applyFilter: applyFilter };
})();
