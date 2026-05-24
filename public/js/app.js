(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const dropzone        = document.getElementById('dropzone');
  const fileInput       = document.getElementById('fileInput');
  const uploadSection   = document.getElementById('uploadSection');
  const resultsSection  = document.getElementById('resultsSection');
  const errorBanner     = document.getElementById('errorBanner');
  const errorText       = document.getElementById('errorText');
  const errorClose      = document.getElementById('errorClose');

  const imgBefore       = document.getElementById('imgBefore');
  const imgAfter        = document.getElementById('imgAfter');
  const filterCanvas    = document.getElementById('filterCanvas');
  const afterPlaceholder= document.getElementById('afterPlaceholder');
  const placeholderText = document.getElementById('placeholderText');
  const spinner         = document.getElementById('spinner');

  const statOriginal    = document.getElementById('statOriginal');
  const statOptimized   = document.getElementById('statOptimized');
  const savingsBadge    = document.getElementById('savingsBadge');
  const metaBefore      = document.getElementById('metaBefore');
  const metaAfter       = document.getElementById('metaAfter');

  const downloadBtn     = document.getElementById('downloadBtn');
  const resetBtn        = document.getElementById('resetBtn');

  // Filter panel
  const filterPanel     = document.getElementById('filterPanel');
  const filterGrid      = document.getElementById('filterGrid');
  const cvDot           = document.getElementById('cvDot');
  const cvStatus        = document.getElementById('cvStatus');
  const blurOption      = document.getElementById('blurOption');
  const blurRange       = document.getElementById('blurRange');
  const blurValue       = document.getElementById('blurValue');

  // ── Constants ─────────────────────────────────────────────────────────────
  const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const MAX_SIZE_BYTES = 25 * 1024 * 1024;

  // ── Upload state ──────────────────────────────────────────────────────────
  let activeFilter      = 'none';
  let serverDownloadUrl = '';
  let currentFilename   = '';
  let blurDebounce      = null;

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone--active');
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('dropzone--active');
    }
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dropzone--active');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
      fileInput.click();
    }
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  resetBtn.addEventListener('click', reset);
  errorClose.addEventListener('click', () => errorBanner.classList.add('hidden'));

  // ── Filter panel wiring ───────────────────────────────────────────────────
  filterGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn || btn.disabled) return;
    setActiveFilter(btn.dataset.filter);
  });

  blurRange.addEventListener('input', () => {
    blurValue.textContent = blurRange.value;
    clearTimeout(blurDebounce);
    blurDebounce = setTimeout(() => setActiveFilter('blur'), 160);
  });

  // Download: use canvas blob when a filter is active, server URL otherwise.
  downloadBtn.addEventListener('click', (e) => {
    if (activeFilter === 'none') return; // default <a> href behaviour handles it
    e.preventDefault();
    exportFilteredImage();
  });

  // ── Core upload flow ──────────────────────────────────────────────────────
  function handleFile(file) {
    hideError();

    if (!ALLOWED_TYPES.has(file.type)) {
      showError(`"${file.type || file.name}" is not supported. Please use JPEG, PNG, or WebP.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      showError(`File is ${formatBytes(file.size)} — maximum allowed size is 25 MB.`);
      return;
    }

    // Show "Before" preview immediately from the local file — no round-trip needed
    const reader = new FileReader();
    reader.onload = (e) => { imgBefore.src = e.target.result; };
    reader.readAsDataURL(file);
    metaBefore.textContent = `${file.name} · ${formatBytes(file.size)}`;

    uploadSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    filterPanel.classList.add('hidden');
    setAfterLoading(true);
    statOriginal.textContent  = '—';
    statOptimized.textContent = '—';
    savingsBadge.textContent  = '—';
    savingsBadge.classList.remove('savings-badge--negative');
    metaAfter.textContent     = '—';
    downloadBtn.classList.add('hidden');

    const formData = new FormData();
    formData.append('image', file);

    fetch('/api/upload', { method: 'POST', body: formData })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
        return body;
      })
      .then(onUploadSuccess)
      .catch((err) => {
        showError(err.message);
        setAfterLoading(false);
        placeholderText.textContent = 'Processing failed.';
        spinner.classList.add('hidden');
      });
  }

  function onUploadSuccess(data) {
    const { original, optimized } = data;

    statOriginal.textContent  = original.sizeFormatted;
    statOptimized.textContent = optimized.sizeFormatted;
    savingsBadge.textContent  = optimized.savedPctFormatted;
    if (optimized.savedPct < 0) savingsBadge.classList.add('savings-badge--negative');

    metaBefore.textContent = `${original.filename} · ${original.sizeFormatted} · ${original.width}×${original.height}`;
    metaAfter.textContent  = `${optimized.sizeFormatted} · ${optimized.savedPctFormatted} smaller`;

    serverDownloadUrl = optimized.downloadUrl;
    currentFilename   = original.filename;

    imgAfter.onload = () => {
      setAfterLoading(false);
      imgAfter.classList.remove('hidden');
      // Show filter panel and kick off lazy OpenCV.js load
      initFilterPanel();
    };
    imgAfter.onerror = () => {
      setAfterLoading(false);
      placeholderText.textContent = 'Preview unavailable.';
      spinner.classList.add('hidden');
    };
    imgAfter.src = optimized.url;

    downloadBtn.href = optimized.downloadUrl;
    downloadBtn.setAttribute('download', `optimized-${original.filename}`);
    downloadBtn.classList.remove('hidden');
  }

  // ── Filter panel ──────────────────────────────────────────────────────────
  function initFilterPanel() {
    activeFilter = 'none';

    // Reset all buttons to default state
    filterGrid.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === 'none');
    });
    blurOption.classList.add('hidden');
    filterCanvas.classList.add('hidden');

    // Show panel
    filterPanel.classList.remove('hidden');

    // Start loading OpenCV.js in the background; CV buttons stay disabled until ready
    setCvState('loading');
    CVFilters.load(
      () => {
        setCvState('ready');
        filterGrid.querySelectorAll('.filter-btn--cv').forEach(btn => { btn.disabled = false; });
      },
      () => setCvState('error'),
    );
  }

  function setCvState(state) {
    cvDot.className = 'cv-dot';
    if (state === 'loading') {
      cvDot.classList.add('cv-dot--loading');
      cvStatus.textContent = 'Loading OpenCV.js…';
    } else if (state === 'ready') {
      cvDot.classList.add('cv-dot--ready');
      cvStatus.textContent = 'OpenCV.js ready';
    } else {
      cvDot.classList.add('cv-dot--error');
      cvStatus.textContent = 'OpenCV.js unavailable';
    }
  }

  function setActiveFilter(filterName) {
    activeFilter = filterName;

    // Button highlight
    filterGrid.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === filterName);
    });

    // Show/hide blur slider
    blurOption.classList.toggle('hidden', filterName !== 'blur');

    if (filterName === 'none') {
      // Restore the original Sharp-optimised image
      filterCanvas.classList.add('hidden');
      imgAfter.classList.remove('hidden');
      downloadBtn.href = serverDownloadUrl;
      downloadBtn.setAttribute('download', `optimized-${currentFilename}`);
      return;
    }

    // Apply filter onto the canvas using the (hidden) imgAfter as source
    const opts = filterName === 'blur' ? { radius: parseInt(blurRange.value, 10) } : {};
    const ok   = CVFilters.applyFilter(filterName, imgAfter, filterCanvas, opts);

    if (ok) {
      imgAfter.classList.add('hidden');
      filterCanvas.classList.remove('hidden');
      // Point download at a dynamically generated blob (created at click time)
      downloadBtn.removeAttribute('href');
    } else {
      // OpenCV not ready yet — revert to original view
      activeFilter = 'none';
      filterGrid.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.classList.toggle('filter-btn--active', btn.dataset.filter === 'none');
      });
    }
  }

  function exportFilteredImage() {
    const ext      = currentFilename.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const quality  = mimeType === 'image/png' ? undefined : 0.92;

    filterCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `filtered-${currentFilename}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, mimeType, quality);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function setAfterLoading(loading) {
    if (loading) {
      afterPlaceholder.classList.remove('hidden');
      imgAfter.classList.add('hidden');
      filterCanvas.classList.add('hidden');
      placeholderText.textContent = 'Processing…';
      spinner.classList.remove('hidden');
    } else {
      afterPlaceholder.classList.add('hidden');
    }
  }

  function reset() {
    uploadSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    filterPanel.classList.add('hidden');
    imgBefore.src  = '';
    imgAfter.src   = '';
    fileInput.value = '';
    activeFilter   = 'none';
    filterCanvas.classList.add('hidden');
    blurOption.classList.add('hidden');
    hideError();
  }

  function showError(msg) {
    errorText.textContent = msg;
    errorBanner.classList.remove('hidden');
  }

  function hideError() {
    errorBanner.classList.add('hidden');
    errorText.textContent = '';
  }

  function formatBytes(bytes) {
    if (bytes < 1024)    return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  }
})();
