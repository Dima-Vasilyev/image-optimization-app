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

  // ── Constants ─────────────────────────────────────────────────────────────
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const MAX_SIZE_BYTES = 25 * 1024 * 1024;

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

  // Click on the dropzone (but not on the label/input) also opens the picker
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

  errorClose.addEventListener('click', () => {
    errorBanner.classList.add('hidden');
  });

  // ── Core flow ─────────────────────────────────────────────────────────────
  function handleFile(file) {
    hideError();

    // Client-side pre-validation — avoids a needless round-trip for obvious rejects
    if (!ALLOWED_TYPES.has(file.type)) {
      showError(`"${file.type || file.name}" is not supported. Please use JPEG, PNG, or WebP.`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      showError(`File is ${formatBytes(file.size)} — maximum allowed size is 25 MB.`);
      return;
    }

    // Show "Before" preview immediately using the local file (no round-trip needed)
    const reader = new FileReader();
    reader.onload = (e) => {
      imgBefore.src = e.target.result;
    };
    reader.readAsDataURL(file);

    metaBefore.textContent = `${file.name} · ${formatBytes(file.size)}`;

    // Switch to results view and set After pane to loading state
    uploadSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    setAfterLoading(true);
    statOriginal.textContent  = '—';
    statOptimized.textContent = '—';
    savingsBadge.textContent  = '—';
    savingsBadge.classList.remove('savings-badge--negative');
    metaAfter.textContent     = '—';
    downloadBtn.classList.add('hidden');

    // Upload and process on the server
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

    // Stats bar
    statOriginal.textContent  = original.sizeFormatted;
    statOptimized.textContent = optimized.sizeFormatted;
    savingsBadge.textContent  = optimized.savedPctFormatted;
    if (optimized.savedPct < 0) {
      savingsBadge.classList.add('savings-badge--negative');
    }

    metaBefore.textContent = `${original.filename} · ${original.sizeFormatted} · ${original.width}×${original.height}`;
    metaAfter.textContent  = `${optimized.sizeFormatted} · ${optimized.savedPctFormatted} smaller`;

    // Load optimized image into After pane
    imgAfter.onload = () => {
      setAfterLoading(false);
      imgAfter.classList.remove('hidden');
    };
    imgAfter.onerror = () => {
      setAfterLoading(false);
      placeholderText.textContent = 'Preview unavailable.';
      spinner.classList.add('hidden');
    };
    imgAfter.src = optimized.url;

    // Download button
    downloadBtn.href = optimized.downloadUrl;
    downloadBtn.setAttribute('download', `optimized-${original.filename}`);
    downloadBtn.classList.remove('hidden');
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function setAfterLoading(loading) {
    if (loading) {
      afterPlaceholder.classList.remove('hidden');
      imgAfter.classList.add('hidden');
      placeholderText.textContent = 'Processing…';
      spinner.classList.remove('hidden');
    } else {
      afterPlaceholder.classList.add('hidden');
    }
  }

  function reset() {
    uploadSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    imgBefore.src = '';
    imgAfter.src  = '';
    fileInput.value = '';
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
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  }
})();
