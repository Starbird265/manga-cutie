/* ═══════════════════════════════════════════════════════════════════════════════
   MangaCutie — SVG Crop Overlay
   Multi-selection crop tool: draw, move, resize, delete.
   All coordinates are in image-space; the SVG viewBox handles zoom/scroll.
   ═══════════════════════════════════════════════════════════════════════════════ */

const CropOverlay = (function () {

  const NS = 'http://www.w3.org/2000/svg';
  const MIN_SIZE = 10;

  // ─── Private State ────────────────────────────────────────────────────────
  let svg = null;
  let zoom = 1;
  let imgW = 0, imgH = 0;

  let crops = [];               // Array of { id, x, y, width, height, label }
  let selectedCropId = null;
  let enabled = false;          // true when tool mode is CROP

  // Interaction state
  let mode = 'IDLE';            // IDLE | DRAWING | MOVING | RESIZING
  let activeHandle = null;      // 'nw','n','ne','e','se','s','sw','w'
  let startPt = null;           // { x, y } in image coords (for drawing)
  let currentPt = null;
  let dragStartPt = null;       // for move/resize
  let initialCrop = null;       // snapshot for move/resize

  // Callbacks
  let _onCropsChange = null;    // called whenever crops array changes

  // ─── Public API ───────────────────────────────────────────────────────────

  function init(svgEl, onCropsChange) {
    svg = svgEl;
    _onCropsChange = onCropsChange;

    svg.addEventListener('mousedown', _onMouseDown);
    window.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('mouseup', _onMouseUp);
  }

  function setImageSize(w, h) { imgW = w; imgH = h; }
  function setZoomLevel(z) { zoom = z; }

  /** Replace entire crops array (e.g., from cache restore). */
  function setCrops(arr) {
    crops = arr.map(c => ({ ...c }));
    selectedCropId = null;
    _render();
  }

  function getCrops() { return crops.map(c => ({ ...c })); }

  /** Enable/disable crop interactions (PAN vs CROP mode). */
  function setEnabled(flag) {
    enabled = flag;
    if (!enabled) {
      mode = 'IDLE';
      selectedCropId = null;
    }
    _render();
  }

  /**
   * Update the SVG viewBox to match the current scroll/zoom.
   * Called by app.js on every scroll and zoom change.
   */
  function updateViewBox(scrollX, scrollY, vpW, vpH) {
    const vbX = scrollX / zoom;
    const vbY = scrollY / zoom;
    const vbW = vpW / zoom;
    const vbH = vpH / zoom;
    svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    svg.setAttribute('width', vpW);
    svg.setAttribute('height', vpH);
  }

  function getSelectedCropId() { return selectedCropId; }

  // ─── Coordinate Helpers ───────────────────────────────────────────────────

  /** Convert a mouse event to image-space coordinates via the SVG viewBox. */
  function _toImageCoords(e) {
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const vb = svg.viewBox.baseVal;
    return {
      x: vb.x + (mx / rect.width) * vb.width,
      y: vb.y + (my / rect.height) * vb.height
    };
  }

  function _clampToImage(pt) {
    return {
      x: Utils.clamp(pt.x, 0, imgW),
      y: Utils.clamp(pt.y, 0, imgH)
    };
  }

  // ─── Mouse Handlers ──────────────────────────────────────────────────────

  function _onMouseDown(e) {
    if (!enabled) return;
    if (e.button !== 0) return;   // left click only

    const pt = _toImageCoords(e);

    // Check if we clicked on a handle first (handled by SVG element events)
    // Check if we clicked on a crop body (handled by SVG element events)
    // If neither, start drawing a new crop

    // The click target tells us what was hit
    const target = e.target;

    // Resize handle
    if (target.dataset && target.dataset.handle) {
      e.stopPropagation();
      const cropId = target.dataset.cropId;
      const crop = crops.find(c => c.id === cropId);
      if (!crop) return;

      selectedCropId = cropId;
      mode = 'RESIZING';
      activeHandle = target.dataset.handle;
      dragStartPt = pt;
      initialCrop = { ...crop };
      _render();
      return;
    }

    // Crop body
    if (target.dataset && target.dataset.cropBody) {
      e.stopPropagation();
      const cropId = target.dataset.cropId;
      const crop = crops.find(c => c.id === cropId);
      if (!crop) return;

      selectedCropId = cropId;
      mode = 'MOVING';
      dragStartPt = pt;
      initialCrop = { ...crop };
      _render();
      return;
    }

    // Background: start drawing new crop
    selectedCropId = null;
    const clamped = _clampToImage(pt);
    startPt = clamped;
    currentPt = clamped;
    mode = 'DRAWING';
    _render();
  }

  function _onMouseMove(e) {
    if (mode === 'IDLE') return;

    const pt = _toImageCoords(e);

    if (mode === 'DRAWING' && startPt) {
      currentPt = _clampToImage(pt);
      _render();
    }

    if (mode === 'MOVING' && dragStartPt && initialCrop && selectedCropId) {
      const dx = pt.x - dragStartPt.x;
      const dy = pt.y - dragStartPt.y;
      let nx = initialCrop.x + dx;
      let ny = initialCrop.y + dy;
      nx = Utils.clamp(nx, 0, imgW - initialCrop.width);
      ny = Utils.clamp(ny, 0, imgH - initialCrop.height);

      const crop = crops.find(c => c.id === selectedCropId);
      if (crop) { crop.x = nx; crop.y = ny; }
      _render();
    }

    if (mode === 'RESIZING' && dragStartPt && initialCrop && selectedCropId && activeHandle) {
      const dx = pt.x - dragStartPt.x;
      const dy = pt.y - dragStartPt.y;
      let { x, y, width, height } = initialCrop;

      if (activeHandle.includes('e')) width = Math.max(MIN_SIZE, width + dx);
      if (activeHandle.includes('w')) {
        const ed = Math.min(dx, width - MIN_SIZE);
        x += ed;
        width -= ed;
      }
      if (activeHandle.includes('s')) height = Math.max(MIN_SIZE, height + dy);
      if (activeHandle.includes('n')) {
        const ed = Math.min(dy, height - MIN_SIZE);
        y += ed;
        height -= ed;
      }

      const crop = crops.find(c => c.id === selectedCropId);
      if (crop) {
        crop.x = x; crop.y = y;
        crop.width = width; crop.height = height;
      }
      _render();
    }
  }

  function _onMouseUp() {
    if (mode === 'DRAWING' && startPt && currentPt) {
      const x = Math.min(startPt.x, currentPt.x);
      const y = Math.min(startPt.y, currentPt.y);
      const w = Math.abs(currentPt.x - startPt.x);
      const h = Math.abs(currentPt.y - startPt.y);

      if (w > MIN_SIZE && h > MIN_SIZE) {
        const newCrop = {
          id: Utils.generateId(),
          x, y, width: w, height: h,
          label: 'Panel'
        };
        crops.push(newCrop);
        selectedCropId = newCrop.id;
        _notifyChange();
      }
    }

    if (mode === 'MOVING' || mode === 'RESIZING') {
      _notifyChange();
    }

    mode = 'IDLE';
    startPt = null;
    currentPt = null;
    dragStartPt = null;
    initialCrop = null;
    activeHandle = null;
    _render();
  }

  /** Remove a crop by ID. */
  function removeCrop(id) {
    crops = crops.filter(c => c.id !== id);
    if (selectedCropId === id) selectedCropId = null;
    _notifyChange();
    _render();
  }

  function _notifyChange() {
    if (_onCropsChange) _onCropsChange(getCrops());
  }

  // ─── SVG Rendering ────────────────────────────────────────────────────────

  function _render() {
    // Clear SVG
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!imgW || !imgH) return;

    // Compute start index for global panel numbering
    // (this is set externally via setCropStartIndex)
    const startIdx = _cropStartIndex || 0;

    crops.forEach((crop, index) => {
      const isSelected = crop.id === selectedCropId;
      const panelNum = startIdx + index + 1;
      _renderCrop(crop, isSelected, panelNum);
    });

    // Draw preview if currently drawing
    if (mode === 'DRAWING' && startPt && currentPt) {
      _renderPreview();
    }
  }

  function _renderCrop(crop, isSelected, panelNum) {
    const g = document.createElementNS(NS, 'g');

    // ── Main rect (crop body) ──
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', crop.x);
    rect.setAttribute('y', crop.y);
    rect.setAttribute('width', crop.width);
    rect.setAttribute('height', crop.height);
    rect.setAttribute('fill', isSelected ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.25)');
    rect.setAttribute('stroke', isSelected ? '#047857' : '#059669');
    rect.setAttribute('stroke-width', (isSelected ? 3 : 2) / zoom);
    rect.style.cursor = enabled ? 'move' : 'default';
    rect.dataset.cropBody = 'true';
    rect.dataset.cropId = crop.id;
    g.appendChild(rect);

    // ── Panel number badge ──
    const badgeSize = 24 / zoom;
    const fontSize = 12 / zoom;
    const fo = document.createElementNS(NS, 'foreignObject');
    fo.setAttribute('x', crop.x);
    fo.setAttribute('y', crop.y);
    fo.setAttribute('width', badgeSize * 3);
    fo.setAttribute('height', badgeSize * 1.6);
    fo.style.overflow = 'visible';
    fo.style.pointerEvents = 'none';

    const badge = document.createElement('div');
    badge.style.cssText = `
      background: #059669; color: #fff; font-weight: 700;
      border-radius: 0 0 ${4/zoom}px 0;
      padding: ${2/zoom}px ${6/zoom}px;
      font-size: ${fontSize}px;
      display: inline-flex; align-items: center; justify-content: center;
      min-width: ${badgeSize}px;
      border: ${1/zoom}px solid #34d399;
      line-height: 1.2;
    `;
    badge.textContent = panelNum;
    fo.appendChild(badge);
    g.appendChild(fo);

    // ── Delete button (top-right) ──
    if (isSelected || enabled) {
      const delFo = document.createElementNS(NS, 'foreignObject');
      const delSize = 22 / zoom;
      delFo.setAttribute('x', crop.x + crop.width - delSize - 4/zoom);
      delFo.setAttribute('y', crop.y + 4/zoom);
      delFo.setAttribute('width', delSize);
      delFo.setAttribute('height', delSize);
      delFo.style.overflow = 'visible';

      const delBtn = document.createElement('div');
      delBtn.style.cssText = `
        width: ${delSize}px; height: ${delSize}px;
        background: #ef4444; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: #fff; font-weight: 700;
        font-size: ${13/zoom}px; line-height: 1;
        opacity: ${isSelected ? 1 : 0};
        transition: opacity 0.15s;
      `;
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCrop(crop.id);
      });
      // Show on hover
      g.addEventListener('mouseenter', () => { delBtn.style.opacity = '1'; });
      g.addEventListener('mouseleave', () => {
        if (crop.id !== selectedCropId) delBtn.style.opacity = '0';
      });
      delFo.appendChild(delBtn);
      g.appendChild(delFo);
    }

    // ── Resize handles (only when selected) ──
    if (isSelected && enabled) {
      _renderHandles(g, crop);
    }

    // ── Dimension label (when selected) ──
    if (isSelected) {
      _renderDimLabel(g, crop);
    }

    svg.appendChild(g);
  }

  function _renderHandles(g, crop) {
    const hs = 10 / zoom;  // handle size in image coords → constant screen size
    const off = hs / 2;
    const { x, y, width: w, height: h } = crop;

    const handles = [
      { cx: x,       cy: y,       type: 'nw', cursor: 'nw-resize' },
      { cx: x + w/2, cy: y,       type: 'n',  cursor: 'n-resize'  },
      { cx: x + w,   cy: y,       type: 'ne', cursor: 'ne-resize' },
      { cx: x + w,   cy: y + h/2, type: 'e',  cursor: 'e-resize'  },
      { cx: x + w,   cy: y + h,   type: 'se', cursor: 'se-resize' },
      { cx: x + w/2, cy: y + h,   type: 's',  cursor: 's-resize'  },
      { cx: x,       cy: y + h,   type: 'sw', cursor: 'sw-resize' },
      { cx: x,       cy: y + h/2, type: 'w',  cursor: 'w-resize'  },
    ];

    handles.forEach(({ cx, cy, type, cursor }) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', cx - off);
      r.setAttribute('y', cy - off);
      r.setAttribute('width', hs);
      r.setAttribute('height', hs);
      r.setAttribute('fill', '#ffffff');
      r.setAttribute('stroke', '#059669');
      r.setAttribute('stroke-width', 1.5 / zoom);
      r.style.cursor = cursor;
      r.dataset.handle = type;
      r.dataset.cropId = crop.id;
      g.appendChild(r);
    });
  }

  function _renderDimLabel(g, crop) {
    const fontSize = 11 / zoom;
    const fo = document.createElementNS(NS, 'foreignObject');
    fo.setAttribute('x', crop.x);
    fo.setAttribute('y', crop.y - 26 / zoom);
    fo.setAttribute('width', 200 / zoom);
    fo.setAttribute('height', 24 / zoom);
    fo.style.overflow = 'visible';
    fo.style.pointerEvents = 'none';

    const label = document.createElement('div');
    label.style.cssText = `
      background: #db2777; color: #fff; font-weight: 700;
      font-family: ui-monospace, monospace;
      border-radius: ${3/zoom}px;
      padding: ${2/zoom}px ${6/zoom}px;
      font-size: ${fontSize}px;
      display: inline-flex;
      border: ${1/zoom}px solid #f472b6;
      white-space: nowrap;
      line-height: 1.4;
    `;
    label.textContent = `${Math.round(crop.width)} × ${Math.round(crop.height)}`;
    fo.appendChild(label);
    g.appendChild(fo);
  }

  function _renderPreview() {
    const x = Math.min(startPt.x, currentPt.x);
    const y = Math.min(startPt.y, currentPt.y);
    const w = Math.abs(currentPt.x - startPt.x);
    const h = Math.abs(currentPt.y - startPt.y);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'rgba(236,72,153,0.15)');
    rect.setAttribute('stroke', '#db2777');
    rect.setAttribute('stroke-width', 2 / zoom);
    rect.setAttribute('stroke-dasharray', `${8/zoom},${4/zoom}`);
    rect.classList.add('crop-preview-rect');
    rect.style.pointerEvents = 'none';
    svg.appendChild(rect);

    // Live dimension label
    const fontSize = 11 / zoom;
    const fo = document.createElementNS(NS, 'foreignObject');
    fo.setAttribute('x', x);
    fo.setAttribute('y', y - 26 / zoom);
    fo.setAttribute('width', 200 / zoom);
    fo.setAttribute('height', 24 / zoom);
    fo.style.overflow = 'visible';
    fo.style.pointerEvents = 'none';

    const label = document.createElement('div');
    label.style.cssText = `
      background: #db2777; color: #fff; font-weight: 700;
      font-family: ui-monospace, monospace;
      border-radius: ${3/zoom}px;
      padding: ${2/zoom}px ${6/zoom}px;
      font-size: ${fontSize}px;
      display: inline-flex; white-space: nowrap;
      border: ${1/zoom}px solid #f472b6;
      line-height: 1.4;
    `;
    label.textContent = `${Math.round(w)} × ${Math.round(h)}`;
    fo.appendChild(label);
    svg.appendChild(fo);
  }

  // ─── Global Panel Index ───────────────────────────────────────────────────
  let _cropStartIndex = 0;
  function setCropStartIndex(n) { _cropStartIndex = n; _render(); }

  // ─── Expose ───────────────────────────────────────────────────────────────

  return {
    init,
    setImageSize,
    setZoomLevel,
    setCrops,
    getCrops,
    setEnabled,
    updateViewBox,
    removeCrop,
    setCropStartIndex,
    getSelectedCropId
  };

})();
