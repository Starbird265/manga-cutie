/* ═══════════════════════════════════════════════════════════════════════════════
   MangaCutie — Main Application Orchestrator
   State management, event wiring, pan/zoom, cache, upload flow.
   ═══════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const state = {
    strips: [],           // { id, name, filePath, img, width, height, crops }
    activeStripId: null,
    zoom: 1,
    toolMode: 'PAN',      // 'PAN' | 'CROP'
  };

  // Pan drag state (not persisted)
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let scrollStart = { left: 0, top: 0 };

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM REFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  let viewport, scrollSpacer, tileCanvas, cropSvg, emptyState;
  let btnUpload, btnPan, btnCrop, btnZoomIn, btnZoomOut, zoomLabel;
  let activeStripNameEl, btnDownloadAll, btnClearMemory;

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', async () => {
    // Grab DOM refs
    viewport       = document.getElementById('viewport');
    scrollSpacer   = document.getElementById('scroll-spacer');
    tileCanvas     = document.getElementById('tile-canvas');
    cropSvg        = document.getElementById('crop-svg');
    emptyState     = document.getElementById('empty-state');
    btnUpload      = document.getElementById('btn-upload');
    btnClearMemory = document.getElementById('btn-clear-memory');
    btnPan         = document.getElementById('btn-pan');
    btnCrop        = document.getElementById('btn-crop');
    btnZoomIn      = document.getElementById('btn-zoom-in');
    btnZoomOut     = document.getElementById('btn-zoom-out');
    zoomLabel      = document.getElementById('zoom-label');
    activeStripNameEl = document.getElementById('active-strip-name');
    btnDownloadAll = document.getElementById('btn-download-all');

    // Initialize modules
    TileEngine.init(tileCanvas, viewport);
    CropOverlay.init(cropSvg, _onCropsChange);

    // Bind UI events
    _bindEvents();

    // Load cached state
    await _loadCache();

    // Initial render
    _renderAll();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════════

  function _bindEvents() {
    // Upload & Clear
    btnUpload.addEventListener('click', _handleUpload);
    btnClearMemory.addEventListener('click', _handleClearMemory);

    // Tool toggle
    btnPan.addEventListener('click', () => _setToolMode('PAN'));
    btnCrop.addEventListener('click', () => _setToolMode('CROP'));

    // Zoom buttons
    btnZoomIn.addEventListener('click', () => _setZoom(state.zoom + 0.1));
    btnZoomOut.addEventListener('click', () => _setZoom(state.zoom - 0.1));

    // Mouse wheel on crop SVG: zoom (ctrl) or scroll (normal)
    cropSvg.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom toward cursor
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        _setZoom(state.zoom + delta);
      } else {
        // Pass scroll to viewport
        viewport.scrollLeft += e.deltaX;
        viewport.scrollTop += e.deltaY;
      }
    }, { passive: false });

    // Pan: mouse events on cropSvg (it's on top)
    cropSvg.addEventListener('mousedown', _onViewportMouseDown);
    window.addEventListener('mousemove', _onViewportMouseMove);
    window.addEventListener('mouseup', _onViewportMouseUp);

    // Viewport scroll → update canvas + SVG overlay
    viewport.addEventListener('scroll', _onScroll);

    // Resize → re-render
    window.addEventListener('resize', Utils.debounce(() => {
      _updateSizes();
      TileEngine.markDirty();
    }, 100));

    // Download all
    btnDownloadAll.addEventListener('click', _handleDownloadAll);

    // Status bar: cursor tracking
    cropSvg.addEventListener('mousemove', _updateCursorStatus);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPLOAD
  // ═══════════════════════════════════════════════════════════════════════════

  async function _handleUpload() {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.openFileDialog();
    if (!result.success || result.paths.length === 0) return;

    btnUpload.classList.add('processing');
    btnUpload.textContent = 'Processing...';

    const isFirstBatch = state.strips.length === 0;

    for (const filePath of result.paths) {
      try {
        const img = new Image();
        // Electron with webSecurity:false allows file:// loading
        img.src = filePath;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Failed to load: ' + filePath));
        });

        const strip = {
          id: Utils.generateId(),
          name: _extractFileName(filePath),
          filePath: filePath,
          img: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          crops: []
        };

        state.strips.push(strip);

        // Auto-select first strip
        if (isFirstBatch && state.strips.length === 1) {
          _setActiveStrip(strip.id);
        }

        _renderAll();
        await new Promise(r => setTimeout(r, 30)); // yield to UI
      } catch (err) {
        console.error('Upload error:', err);
      }
    }

    btnUpload.classList.remove('processing');
    btnUpload.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Upload Images`;

    _saveCache();
  }

  function _extractFileName(filePath) {
    return filePath.split('/').pop().split('\\').pop() || 'Unknown';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRIP MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function _setActiveStrip(id) {
    state.activeStripId = id;
    const strip = _getActiveStrip();

    if (strip) {
      // Load image into tile engine
      TileEngine.loadImage(strip.img);
      TileEngine.setZoom(state.zoom);

      // Configure crop overlay
      CropOverlay.setImageSize(strip.width, strip.height);
      CropOverlay.setZoomLevel(state.zoom);
      CropOverlay.setCrops(strip.crops);
      CropOverlay.setCropStartIndex(_getStartIndex());

      // Show canvas/SVG, hide empty state
      emptyState.classList.add('hidden');

      // Update scroll spacer size
      _updateSizes();

      // Fit to width if image is wider than viewport
      const vpW = viewport.clientWidth;
      if (strip.width > vpW) {
        _setZoom((vpW - 40) / strip.width);
      }

      // Update toolbar strip name
      activeStripNameEl.textContent = strip.name;
    } else {
      TileEngine.destroy();
      emptyState.classList.remove('hidden');
      activeStripNameEl.textContent = 'No strip selected';
    }

    _renderAll();
    _saveCache();
  }

  function _deleteStrip(id) {
    state.strips = state.strips.filter(s => s.id !== id);
    if (state.activeStripId === id) {
      state.activeStripId = state.strips.length > 0 ? state.strips[0].id : null;
      _setActiveStrip(state.activeStripId);
    }
    _renderAll();
    _saveCache();
  }

  function _getActiveStrip() {
    return state.strips.find(s => s.id === state.activeStripId) || null;
  }

  /** Get the global crop start index for the active strip. */
  function _getStartIndex() {
    let count = 0;
    for (const s of state.strips) {
      if (s.id === state.activeStripId) break;
      count += s.crops.length;
    }
    return count;
  }

  /** Get total panels across all strips. */
  function _getTotalPanels() {
    return state.strips.reduce((sum, s) => sum + s.crops.length, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL MODE
  // ═══════════════════════════════════════════════════════════════════════════

  function _setToolMode(mode) {
    state.toolMode = mode;

    // Update button styles
    btnPan.className = 'tool-btn' + (mode === 'PAN' ? ' active-pan' : '');
    btnCrop.className = 'tool-btn' + (mode === 'CROP' ? ' active-crop' : '');

    // Update crop overlay
    CropOverlay.setEnabled(mode === 'CROP');

    // Update cursor
    if (mode === 'PAN') {
      cropSvg.classList.remove('cursor-crosshair');
      cropSvg.classList.add('cursor-grab');
    } else {
      cropSvg.classList.remove('cursor-grab', 'cursor-grabbing');
      cropSvg.classList.add('cursor-crosshair');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZOOM
  // ═══════════════════════════════════════════════════════════════════════════

  function _setZoom(z) {
    state.zoom = Utils.clamp(z, 0.05, 5);
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';

    TileEngine.setZoom(state.zoom);
    CropOverlay.setZoomLevel(state.zoom);

    _updateSizes();
    _onScroll();

    // Update status bar
    document.getElementById('stat-zoom').textContent = Math.round(state.zoom * 100) + '%';

    _debouncedSaveCache();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAN (drag to scroll)
  // ═══════════════════════════════════════════════════════════════════════════

  function _onViewportMouseDown(e) {
    // Only pan in PAN mode and if the click is on the SVG background
    // (not on a crop rect or handle — those are handled by CropOverlay)
    if (state.toolMode !== 'PAN') return;
    if (e.target !== cropSvg) return;
    if (e.button !== 0) return;

    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    scrollStart = { left: viewport.scrollLeft, top: viewport.scrollTop };

    cropSvg.classList.remove('cursor-grab');
    cropSvg.classList.add('cursor-grabbing');
  }

  function _onViewportMouseMove(e) {
    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    viewport.scrollLeft = scrollStart.left - dx;
    viewport.scrollTop = scrollStart.top - dy;
  }

  function _onViewportMouseUp() {
    if (!isDragging) return;
    isDragging = false;

    if (state.toolMode === 'PAN') {
      cropSvg.classList.remove('cursor-grabbing');
      cropSvg.classList.add('cursor-grab');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCROLL → update canvas + SVG overlay
  // ═══════════════════════════════════════════════════════════════════════════

  function _onScroll() {
    TileEngine.markDirty();

    // Update SVG viewBox to match visible area
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    CropOverlay.updateViewBox(viewport.scrollLeft, viewport.scrollTop, vpW, vpH);

    // Status bar
    _updateStatusBar();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CROPS CHANGE CALLBACK (from CropOverlay)
  // ═══════════════════════════════════════════════════════════════════════════

  function _onCropsChange(newCrops) {
    const strip = _getActiveStrip();
    if (!strip) return;

    strip.crops = newCrops;
    _renderPanelSidebar();
    _renderStripSidebar();
    _debouncedSaveCache();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════

  async function _handleDownloadSingle(crop) {
    const strip = _getActiveStrip();
    if (!strip) return;

    const blob = await Utils.generateCropBlob(strip.img, crop);
    if (!blob) return;

    const buffer = await Utils.blobToUint8Array(blob);
    const idx = strip.crops.indexOf(crop);
    const globalIdx = _getStartIndex() + idx + 1;
    const fileName = `crop_${String(globalIdx).padStart(3, '0')}.png`;

    await window.electronAPI.saveCrop({
      buffer, stripName: strip.name, fileName
    });
  }

  async function _handleDownloadAll() {
    const total = _getTotalPanels();
    if (total === 0) return;

    SidebarUI.showDownloadProgress(0, total);
    let counter = 0;

    try {
      for (const strip of state.strips) {
        if (strip.crops.length === 0) continue;

        for (const crop of strip.crops) {
          counter++;
          SidebarUI.showDownloadProgress(counter, total);

          const blob = await Utils.generateCropBlob(strip.img, crop);
          if (blob) {
            const buffer = await Utils.blobToUint8Array(blob);
            const fileName = `crop_${String(counter).padStart(3, '0')}.png`;
            await window.electronAPI.saveCrop({
              buffer, stripName: strip.name, fileName
            });
          }
          await new Promise(r => setTimeout(r, 50)); // prevent freeze
        }
      }
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      SidebarUI.showDownloadProgress(-1, 0);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIZING
  // ═══════════════════════════════════════════════════════════════════════════

  function _updateSizes() {
    const strip = _getActiveStrip();
    if (!strip) return;

    const contentW = strip.width * state.zoom;
    const contentH = strip.height * state.zoom;

    // Scroll spacer creates the scrollable area
    scrollSpacer.style.width = contentW + 'px';
    scrollSpacer.style.height = contentH + 'px';

    // Canvas and SVG match viewport
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    tileCanvas.style.width = vpW + 'px';
    tileCanvas.style.height = vpH + 'px';
    cropSvg.setAttribute('width', vpW);
    cropSvg.setAttribute('height', vpH);

    // Initialize viewBox
    CropOverlay.updateViewBox(viewport.scrollLeft, viewport.scrollTop, vpW, vpH);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  function _renderAll() {
    _renderStripSidebar();
    _renderPanelSidebar();
    _updateStatusBar();

    const strip = _getActiveStrip();
    if (strip) {
      emptyState.classList.add('hidden');
    } else {
      emptyState.classList.remove('hidden');
    }
  }

  function _renderStripSidebar() {
    SidebarUI.renderStripList(
      state.strips.map(s => ({
        id: s.id,
        name: s.name,
        width: s.width,
        height: s.height,
        crops: s.crops
      })),
      state.activeStripId,
      {
        onSelect: (id) => _setActiveStrip(id),
        onDelete: (id) => _deleteStrip(id)
      }
    );
  }

  function _renderPanelSidebar() {
    const strip = _getActiveStrip();
    const crops = strip ? strip.crops : [];
    const startIdx = _getStartIndex();

    SidebarUI.renderPanelList(
      crops,
      startIdx,
      strip ? strip.name : null,
      {
        onRemove: (id) => {
          CropOverlay.removeCrop(id);
          // Crops are updated via _onCropsChange callback
        },
        onDownloadSingle: (crop) => _handleDownloadSingle(crop)
      }
    );

    SidebarUI.updateDownloadButton(_getTotalPanels());
  }

  function _updateStatusBar() {
    const stats = TileEngine.getStats();
    const strip = _getActiveStrip();

    document.getElementById('stat-tiles').textContent =
      `Tiles: ${stats.loaded} / ${stats.total}`;
    document.getElementById('stat-memory').textContent =
      `Loading: ${stats.loading}`;
    document.getElementById('stat-image').textContent =
      strip ? `${strip.width} × ${strip.height} px` : '—';
    document.getElementById('stat-zoom').textContent =
      Math.round(state.zoom * 100) + '%';
  }

  function _updateCursorStatus(e) {
    // Optional: show cursor position in image coords on status bar
    // Not a critical feature, just nice to have
  }

  async function _handleClearMemory() {
    if (confirm('Are you sure you want to clear memory? This will remove all saved strips, crops, and start a fresh session.')) {
      if (window.electronAPI && window.electronAPI.clearCache) {
        await window.electronAPI.clearCache();
      }
      window.location.reload();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE (auto-save / auto-restore)
  // ═══════════════════════════════════════════════════════════════════════════

  const _debouncedSaveCache = Utils.debounce(_saveCache, 500);

  async function _saveCache() {
    if (!window.electronAPI) return;
    if (state.strips.length === 0) return;

    const cacheData = {
      zoom: state.zoom,
      activeStripId: state.activeStripId,
      scrollLeft: viewport ? viewport.scrollLeft : 0,
      scrollTop: viewport ? viewport.scrollTop : 0,
      strips: state.strips.map(s => ({
        id: s.id,
        name: s.name,
        filePath: s.filePath,
        width: s.width,
        height: s.height,
        crops: s.crops
      }))
    };

    await window.electronAPI.saveCache(JSON.stringify(cacheData));
  }

  async function _loadCache() {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.loadCache();
    if (!result.success || !result.data) return;

    try {
      const cache = JSON.parse(result.data);

      if (cache.zoom) state.zoom = cache.zoom;
      _setZoom(state.zoom);

      // Restore strips
      for (const s of (cache.strips || [])) {
        if (!s.filePath) continue;

        // Check if file still exists
        const exists = await window.electronAPI.fileExists(s.filePath);
        if (!exists) {
          console.warn('Cached file missing:', s.filePath);
          continue;
        }

        try {
          const img = new Image();
          img.src = s.filePath;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Load failed'));
          });

          state.strips.push({
            id: s.id,
            name: s.name,
            filePath: s.filePath,
            img: img,
            width: s.width || img.naturalWidth,
            height: s.height || img.naturalHeight,
            crops: s.crops || []
          });
        } catch (err) {
          console.warn('Failed to restore strip:', s.name, err);
        }
      }

      // Restore active strip
      if (cache.activeStripId && state.strips.find(s => s.id === cache.activeStripId)) {
        _setActiveStrip(cache.activeStripId);

        // Restore scroll position after a small delay (DOM needs to settle)
        if (cache.scrollLeft || cache.scrollTop) {
          setTimeout(() => {
            viewport.scrollLeft = cache.scrollLeft || 0;
            viewport.scrollTop = cache.scrollTop || 0;
            _onScroll();
          }, 100);
        }
      }
    } catch (err) {
      console.error('Failed to parse cache:', err);
    }
  }

})();
