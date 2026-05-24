(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const dropzone         = document.getElementById('dropzone');
  const fileInput        = document.getElementById('fileInput');
  const uploadSection    = document.getElementById('uploadSection');
  const resultsSection   = document.getElementById('resultsSection');
  const errorBanner      = document.getElementById('errorBanner');
  const errorText        = document.getElementById('errorText');
  const errorClose       = document.getElementById('errorClose');

  const imgBefore        = document.getElementById('imgBefore');
  const imgAfter         = document.getElementById('imgAfter');
  const filterCanvas     = document.getElementById('filterCanvas');
  const afterPlaceholder = document.getElementById('afterPlaceholder');
  const placeholderText  = document.getElementById('placeholderText');
  const spinner          = document.getElementById('spinner');

  const statOriginal     = document.getElementById('statOriginal');
  const statOptimized    = document.getElementById('statOptimized');
  const savingsBadge     = document.getElementById('savingsBadge');
  const metaBefore       = document.getElementById('metaBefore');
  const metaAfter        = document.getElementById('metaAfter');

  const downloadBtn      = document.getElementById('downloadBtn');
  const resetBtn         = document.getElementById('resetBtn');

  // Settings panel
  const settingsPanel    = document.getElementById('settingsPanel');
  const presetGroup      = document.getElementById('presetGroup');
  const presetDesc       = document.getElementById('presetDesc');
  const qualityRow       = document.getElementById('qualityRow');
  const qualityRange     = document.getElementById('qualityRange');
  const qualityVal       = document.getElementById('qualityVal');
  const resizeRange      = document.getElementById('resizeRange');
  const resizeVal        = document.getElementById('resizeVal');
  const resizeDims       = document.getElementById('resizeDims');
  const stripMetaCheck   = document.getElementById('stripMetaCheck');
  const reprocessIndicator = document.getElementById('reprocessIndicator');

  // Filter panel
  const filterPanel      = document.getElementById('filterPanel');
  const filterGrid       = document.getElementById('filterGrid');
  const cvDot            = document.getElementById('cvDot');
  const cvStatus         = document.getElementById('cvStatus');
  const blurOption       = document.getElementById('blurOption');
  const blurRange        = document.getElementById('blurRange');
  const blurValue        = document.getElementById('blurValue');

  // ── Constants ─────────────────────────────────────────────────────────────
  const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const MAX_SIZE_BYTES = 25 * 1024 * 1024;

  // Preset metadata (mirrors src/config/index.js; kept in sync manually)
  const PRESET_META = {
    speed:       { defaultQuality: 75, desc: 'Fastest encode · 4:2:0 chroma · effort 1' },
    balanced:    { defaultQuality: 85, desc: 'mozjpeg · progressive · effort 4' },
    max_quality: { defaultQuality: 95, desc: 'mozjpeg · 4:4:4 chroma · effort 6' },
  };
  const PNG_PRESET_DESC = {
    speed:       'zlib level 3 · no adaptive filtering',
    balanced:    'zlib level 6 · adaptive filtering',
    max_quality: 'zlib level 9 · adaptive filtering',
  };

  // ── Session state ──────────────────────────────────────────────────────────
  let originalFileId    = null;   // basename of the uploaded original
  let currentOptFileId  = null;   // basename of the current optimised output
  let currentMimetype   = null;   // 'image/jpeg' | 'image/png' | 'image/webp'
  let origWidth         = 0;
  let origHeight        = 0;

  // Settings state
  let settings = { preset: 'balanced', quality: 85, resize: 100, stripMeta: true };

  // Filter state
  let activeFilter = 'none';

  // Reprocess debounce handle
  let reprocessTimer  = null;
  let reprocessSeqId  = 0;        // incremented on every call; stale responses are ignored

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dropzone--active');
  });
  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('dropzone--active');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dropzone--active');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  dropzone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') fileInput.click();
  });
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  resetBtn.addEventListener('click', reset);
  errorClose.addEventListener('click', () => errorBanner.classList.add('hidden'));

  // ── Settings wiring ────────────────────────────────────────────────────────
  presetGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const preset = btn.dataset.preset;
    applyPreset(preset);
    scheduleReprocess();
  });

  qualityRange.addEventListener('input', () => {
    settings.quality = +qualityRange.value;
    qualityVal.textContent = settings.quality;
    scheduleReprocess();
  });

  resizeRange.addEventListener('input', () => {
    settings.resize = +resizeRange.value;
    updateResizeDisplay();
    scheduleReprocess();
  });

  stripMetaCheck.addEventListener('change', () => {
    settings.stripMeta = stripMetaCheck.checked;
    scheduleReprocess();
  });

  // ── Filter panel wiring ────────────────────────────────────────────────────
  filterGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn || btn.disabled) return;
    setActiveFilter(btn.dataset.filter);
  });

  let blurDebounce = null;
  blurRange.addEventListener('input', () => {
    blurValue.textContent = blurRange.value;
    clearTimeout(blurDebounce);
    blurDebounce = setTimeout(() => setActiveFilter('blur'), 160);
  });

  // Download: canvas blob when filter active, server URL otherwise
  downloadBtn.addEventListener('click', (e) => {
    if (activeFilter !== 'none') { e.preventDefault(); exportFilteredImage(); }
  });

  // ── Core upload flow ───────────────────────────────────────────────────────
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

    // Instant "Before" preview via FileReader — no server round-trip needed
    const reader = new FileReader();
    reader.onload = (ev) => { imgBefore.src = ev.target.result; };
    reader.readAsDataURL(file);
    metaBefore.textContent = `${file.name} · ${formatBytes(file.size)}`;

    uploadSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    settingsPanel.classList.add('hidden');
    filterPanel.classList.add('hidden');
    setAfterLoading(true);
    clearStats();

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

    // Persist session state
    originalFileId   = original.fileId;
    currentOptFileId = optimized.fileId;
    currentMimetype  = original.mimetype;
    origWidth        = original.width;
    origHeight       = original.height;

    // Reset settings to defaults for each new upload
    settings = { preset: 'balanced', quality: 85, resize: 100, stripMeta: true };

    updateStats(original, optimized);

    imgAfter.onload = () => {
      setAfterLoading(false);
      imgAfter.classList.remove('hidden');
      initSettingsPanel();
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

  // ── Reprocess ─────────────────────────────────────────────────────────────
  function scheduleReprocess() {
    clearTimeout(reprocessTimer);
    reprocessTimer = setTimeout(runReprocess, 600);
  }

  async function runReprocess() {
    if (!originalFileId) return;

    const seqId = ++reprocessSeqId;
    reprocessIndicator.classList.remove('hidden');

    // Reset filters when settings change — the base image changes
    if (activeFilter !== 'none') {
      setActiveFilter('none');
    }

    try {
      const res = await fetch('/api/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalFileId,
          prevOptFileId: currentOptFileId,
          mimetype:      currentMimetype,
          quality:       settings.quality,
          resize:        settings.resize,
          stripMeta:     settings.stripMeta,
          preset:        settings.preset,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);

      if (seqId !== reprocessSeqId) return; // stale — a newer request is in flight

      currentOptFileId = body.optimized.fileId;

      // Update After pane
      setAfterLoading(true);
      imgAfter.onload = () => {
        setAfterLoading(false);
        imgAfter.classList.remove('hidden');
        filterCanvas.classList.add('hidden');
      };
      imgAfter.src = body.optimized.url + `?t=${Date.now()}`; // bust cache

      // Update stats
      const origProxy = { sizeFormatted: statOriginal.textContent };
      updateStats(origProxy, body.optimized);

      downloadBtn.href = body.optimized.downloadUrl;
    } catch (err) {
      if (seqId !== reprocessSeqId) return;
      showError(err.message);
    } finally {
      if (seqId === reprocessSeqId) reprocessIndicator.classList.add('hidden');
    }
  }

  // ── Settings panel ─────────────────────────────────────────────────────────
  function initSettingsPanel() {
    applyPreset('balanced', /* silent */ true);
    qualityRange.value    = 85;
    qualityVal.textContent = '85';
    resizeRange.value     = 100;
    resizeVal.textContent  = '100%';
    stripMetaCheck.checked = true;
    updateResizeDisplay();
    settingsPanel.classList.remove('hidden');
  }

  function applyPreset(preset, silent = false) {
    settings.preset = preset;

    // Highlight the active button
    presetGroup.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.classList.toggle('preset-btn--active', btn.dataset.preset === preset);
    });

    // Reset quality to preset default
    const meta = PRESET_META[preset];
    if (meta) {
      settings.quality      = meta.defaultQuality;
      qualityRange.value    = meta.defaultQuality;
      qualityVal.textContent = meta.defaultQuality;

      // Description is format-aware
      const isPng = currentMimetype === 'image/png';
      presetDesc.textContent = isPng ? (PNG_PRESET_DESC[preset] || '') : (meta.desc || '');
    }

    // Quality slider is irrelevant for PNG (lossless)
    qualityRow.classList.toggle('hidden', currentMimetype === 'image/png');
  }

  function updateResizeDisplay() {
    const pct = settings.resize;
    resizeVal.textContent = `${pct}%`;
    if (origWidth && origHeight) {
      const w = Math.round(origWidth  * pct / 100);
      const h = Math.round(origHeight * pct / 100);
      resizeDims.textContent = `→ ${w} × ${h} px`;
    }
  }

  // ── Filter panel ───────────────────────────────────────────────────────────
  function initFilterPanel() {
    activeFilter = 'none';
    filterGrid.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === 'none');
    });
    blurOption.classList.add('hidden');
    filterCanvas.classList.add('hidden');
    filterPanel.classList.remove('hidden');

    setCvState('loading');
    CVFilters.load(
      () => {
        setCvState('ready');
        filterGrid.querySelectorAll('.filter-btn--cv').forEach((btn) => { btn.disabled = false; });
      },
      () => setCvState('error'),
    );
  }

  function setCvState(state) {
    cvDot.className = 'cv-dot';
    if (state === 'loading') { cvDot.classList.add('cv-dot--loading'); cvStatus.textContent = 'Loading OpenCV.js…'; }
    else if (state === 'ready')  { cvDot.classList.add('cv-dot--ready');   cvStatus.textContent = 'OpenCV.js ready'; }
    else                         { cvDot.classList.add('cv-dot--error');   cvStatus.textContent = 'OpenCV.js unavailable'; }
  }

  function setActiveFilter(filterName) {
    activeFilter = filterName;
    filterGrid.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === filterName);
    });
    blurOption.classList.toggle('hidden', filterName !== 'blur');

    if (filterName === 'none') {
      filterCanvas.classList.add('hidden');
      imgAfter.classList.remove('hidden');
      downloadBtn.href = `${imgAfter.src.replace('/file/', '/download/')}`;
      return;
    }

    const opts = filterName === 'blur' ? { radius: +blurRange.value } : {};
    const ok   = CVFilters.applyFilter(filterName, imgAfter, filterCanvas, opts);
    if (ok) {
      imgAfter.classList.add('hidden');
      filterCanvas.classList.remove('hidden');
      downloadBtn.removeAttribute('href');
    } else {
      // CV not ready — silently revert
      activeFilter = 'none';
      filterGrid.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.classList.toggle('filter-btn--active', btn.dataset.filter === 'none');
      });
    }
  }

  function exportFilteredImage() {
    const ext  = (originalFileId || '').split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const q    = mime === 'image/png' ? undefined : 0.92;
    filterCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `filtered-${originalFileId || 'image'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, mime, q);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function updateStats(original, optimized) {
    statOriginal.textContent  = original.sizeFormatted;
    statOptimized.textContent = optimized.sizeFormatted;
    savingsBadge.textContent  = optimized.savedPctFormatted;
    savingsBadge.classList.toggle('savings-badge--negative', optimized.savedPct < 0);

    if (original.filename) {
      metaBefore.textContent = `${original.filename} · ${original.sizeFormatted} · ${original.width}×${original.height}`;
    }
    metaAfter.textContent = `${optimized.sizeFormatted} · ${optimized.savedPctFormatted} smaller · ${optimized.width}×${optimized.height}`;
  }

  function clearStats() {
    statOriginal.textContent  = '—';
    statOptimized.textContent = '—';
    savingsBadge.textContent  = '—';
    savingsBadge.classList.remove('savings-badge--negative');
    metaAfter.textContent = '—';
    downloadBtn.classList.add('hidden');
  }

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
    clearTimeout(reprocessTimer);
    uploadSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    settingsPanel.classList.add('hidden');
    filterPanel.classList.add('hidden');
    imgBefore.src = '';
    imgAfter.src  = '';
    fileInput.value = '';
    originalFileId  = null;
    currentOptFileId = null;
    activeFilter    = 'none';
    filterCanvas.classList.add('hidden');
    blurOption.classList.add('hidden');
    hideError();
  }

  function showError(msg)  { errorText.textContent = msg; errorBanner.classList.remove('hidden'); }
  function hideError()     { errorBanner.classList.add('hidden'); errorText.textContent = ''; }

  function formatBytes(bytes) {
    if (bytes < 1024)    return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  }
})();
