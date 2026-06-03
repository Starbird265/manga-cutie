/* ═══════════════════════════════════════════════════════════════════════════════
   MangaCutie — Tile-Based Canvas Renderer
   Google-Maps-style 512×512 tile engine with LRU eviction.
   Only the pixels you can see are ever in memory.
   ═══════════════════════════════════════════════════════════════════════════════ */

const TileEngine = (function () {

  const TILE_SIZE = 512;
  const MAX_CACHED = 64;        // max tiles in bitmap cache (~64 MB worst case)
  const BUFFER_TILES = 1;       // extra tiles around viewport for pre-loading

  // ─── Private State ────────────────────────────────────────────────────────
  let canvas = null;
  let ctx = null;
  let viewportEl = null;

  let sourceImage = null;       // HTMLImageElement
  let imgW = 0, imgH = 0;      // natural image dimensions
  let cols = 0, rows = 0;      // tile grid size

  let zoom = 1;
  let dirty = true;
  let rafId = null;

  // Tile cache: key "col_row" → { bitmap: ImageBitmap, lastUsed: number }
  const tileCache = new Map();
  const loadingTiles = new Set();

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Initialize the tile engine.
   * @param {HTMLCanvasElement} canvasEl
   * @param {HTMLElement} vpEl — the scrollable viewport div
   */
  function init(canvasEl, vpEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    viewportEl = vpEl;

    viewportEl.addEventListener('scroll', () => { dirty = true; });
    window.addEventListener('resize', () => { dirty = true; });

    _startLoop();
  }

  /**
   * Load a new image into the engine. Clears previous tiles.
   * @param {HTMLImageElement} img — must be fully loaded
   */
  function loadImage(img) {
    destroy();
    sourceImage = img;
    imgW = img.naturalWidth;
    imgH = img.naturalHeight;
    cols = Math.ceil(imgW / TILE_SIZE);
    rows = Math.ceil(imgH / TILE_SIZE);
    dirty = true;
  }

  /** Update zoom level. Tiles are zoom-independent (bitmaps are full-res). */
  function setZoom(z) {
    zoom = z;
    dirty = true;
  }

  /** Get current stats for the status bar. */
  function getStats() {
    return {
      loaded: tileCache.size,
      total: cols * rows,
      loading: loadingTiles.size
    };
  }

  /** Mark the canvas as needing a redraw. */
  function markDirty() { dirty = true; }

  /** Clean up all bitmaps and stop the render loop. */
  function destroy() {
    for (const entry of tileCache.values()) {
      entry.bitmap.close();
    }
    tileCache.clear();
    loadingTiles.clear();
    sourceImage = null;
    imgW = imgH = cols = rows = 0;
  }

  /** Get source image dimensions. */
  function getImageSize() {
    return { width: imgW, height: imgH };
  }

  // ─── Render Loop ──────────────────────────────────────────────────────────

  function _startLoop() {
    function loop() {
      if (dirty) {
        _render();
        dirty = false;
      }
      rafId = requestAnimationFrame(loop);
    }
    loop();
  }

  function _render() {
    if (!sourceImage || !ctx) return;

    const vpW = viewportEl.clientWidth;
    const vpH = viewportEl.clientHeight;

    // Resize canvas to match viewport (only when size actually changes)
    if (canvas.width !== vpW || canvas.height !== vpH) {
      canvas.width = vpW;
      canvas.height = vpH;
    }

    const scrollX = viewportEl.scrollLeft;
    const scrollY = viewportEl.scrollTop;

    const contentW = imgW * zoom;
    const contentH = imgH * zoom;
    const offsetX = Math.max(0, (vpW - contentW) / 2);
    const offsetY = Math.max(0, (vpH - contentH) / 2);

    // Visible area in image coordinates
    const imgViewX = (scrollX - offsetX) / zoom;
    const imgViewY = (scrollY - offsetY) / zoom;
    const imgViewW = vpW / zoom;
    const imgViewH = vpH / zoom;

    // Tile range that intersects the viewport (with buffer)
    const startCol = Math.max(0, Math.floor(imgViewX / TILE_SIZE) - BUFFER_TILES);
    const endCol   = Math.min(cols - 1, Math.floor((imgViewX + imgViewW) / TILE_SIZE) + BUFFER_TILES);
    const startRow = Math.max(0, Math.floor(imgViewY / TILE_SIZE) - BUFFER_TILES);
    const endRow   = Math.min(rows - 1, Math.floor((imgViewY + imgViewH) / TILE_SIZE) + BUFFER_TILES);

    // Clear canvas
    ctx.clearRect(0, 0, vpW, vpH);

    const now = Date.now();

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const key = c + '_' + r;

        // Tile position and size in image pixels
        const tileX = c * TILE_SIZE;
        const tileY = r * TILE_SIZE;
        const tileW = Math.min(TILE_SIZE, imgW - tileX);
        const tileH = Math.min(TILE_SIZE, imgH - tileY);

        // Screen position (relative to canvas / viewport)
        const screenX = tileX * zoom - scrollX + offsetX;
        const screenY = tileY * zoom - scrollY + offsetY;
        const screenW = tileW * zoom;
        const screenH = tileH * zoom;

        const cached = tileCache.get(key);

        if (cached) {
          cached.lastUsed = now;
          ctx.drawImage(cached.bitmap, screenX, screenY, screenW, screenH);
        } else {
          // Placeholder: subtle gray tile with thin border
          ctx.fillStyle = '#1a2234';
          ctx.fillRect(screenX, screenY, screenW, screenH);
          ctx.strokeStyle = '#283548';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, screenW - 1, screenH - 1);

          // Queue load
          if (!loadingTiles.has(key)) {
            _loadTile(c, r, key);
          }
        }
      }
    }

    // Evict least-recently-used tiles when cache is too large
    _evict();
  }

  // ─── Tile Loading ─────────────────────────────────────────────────────────

  async function _loadTile(col, row, key) {
    loadingTiles.add(key);

    try {
      const tileX = col * TILE_SIZE;
      const tileY = row * TILE_SIZE;
      const tileW = Math.min(TILE_SIZE, imgW - tileX);
      const tileH = Math.min(TILE_SIZE, imgH - tileY);

      const bitmap = await createImageBitmap(
        sourceImage, tileX, tileY, tileW, tileH
      );

      tileCache.set(key, { bitmap, lastUsed: Date.now() });
      dirty = true;   // trigger re-render to show the new tile
    } catch (err) {
      console.warn('Tile load failed:', key, err);
    } finally {
      loadingTiles.delete(key);
    }
  }

  // ─── LRU Eviction ────────────────────────────────────────────────────────

  function _evict() {
    if (tileCache.size <= MAX_CACHED) return;

    // Sort by lastUsed ascending (oldest first)
    const sorted = Array.from(tileCache.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    while (tileCache.size > MAX_CACHED && sorted.length > 0) {
      const [key, { bitmap }] = sorted.shift();
      bitmap.close();     // free GPU memory
      tileCache.delete(key);
    }
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  return {
    init,
    loadImage,
    setZoom,
    getStats,
    getImageSize,
    markDirty,
    destroy
  };

})();
