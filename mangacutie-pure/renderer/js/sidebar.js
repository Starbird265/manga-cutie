/* ═══════════════════════════════════════════════════════════════════════════════
   MangaCutie — Sidebar Panels
   Left: uploaded strip list.  Right: crop/panel manager + download.
   ═══════════════════════════════════════════════════════════════════════════════ */

const SidebarUI = (function () {

  // ─── Left Sidebar: Strip List ─────────────────────────────────────────────

  /**
   * Render the strip list in the left sidebar.
   * @param {Array} strips
   * @param {string|null} activeStripId
   * @param {{ onSelect: Function, onDelete: Function }} callbacks
   */
  function renderStripList(strips, activeStripId, callbacks) {
    const container = document.getElementById('strip-list');
    container.innerHTML = '';

    if (strips.length === 0) {
      container.innerHTML = `
        <div class="strip-empty">
          No strips uploaded.<br>Click <strong>"Upload Images"</strong> to add manga strips.
        </div>`;
      return;
    }

    strips.forEach((strip, idx) => {
      const el = document.createElement('div');
      el.className = 'strip-item' + (strip.id === activeStripId ? ' active' : '');
      el.style.animationDelay = (idx * 30) + 'ms';

      el.innerHTML = `
        <div class="active-bar"></div>
        <div class="strip-info">
          <p class="strip-name">${_escHtml(strip.name)}</p>
          <p class="strip-dims">${strip.width} × ${strip.height} px</p>
        </div>
        ${strip.crops.length > 0
          ? `<span class="crop-badge">${strip.crops.length}</span>`
          : ''}
        <button class="strip-delete" title="Remove strip">×</button>
      `;

      el.addEventListener('click', () => callbacks.onSelect(strip.id));

      el.querySelector('.strip-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onDelete(strip.id);
      });

      container.appendChild(el);
    });
  }

  // ─── Right Sidebar: Panel List ────────────────────────────────────────────

  /**
   * Render the crop/panel list in the right sidebar.
   * @param {Array} crops
   * @param {number} startIndex — global panel start index for this strip
   * @param {string} stripName
   * @param {{ onRemove: Function, onDownloadSingle: Function }} callbacks
   */
  function renderPanelList(crops, startIndex, stripName, callbacks) {
    const container = document.getElementById('panel-list');
    const nameEl = document.getElementById('panel-strip-name');

    nameEl.textContent = stripName ? `For: ${stripName}` : '—';
    container.innerHTML = '';

    if (!stripName) {
      container.innerHTML = `
        <div class="panel-empty">
          Select a strip to manage crops.
        </div>`;
      return;
    }

    if (crops.length === 0) {
      container.innerHTML = `
        <div class="panel-empty">
          No panels selected.<br>
          <span style="font-size:11px;margin-top:4px;display:inline-block;">
            Draw boxes on the strip to crop panels.
          </span>
        </div>`;
      return;
    }

    crops.forEach((crop, index) => {
      const panelNum = startIndex + index + 1;
      const el = document.createElement('div');
      el.className = 'panel-item';
      el.style.animationDelay = (index * 25) + 'ms';

      el.innerHTML = `
        <div class="panel-item-header">
          <span class="panel-number">#${panelNum} Panel</span>
          <button class="panel-remove">Remove</button>
        </div>
        <div class="panel-dims">
          Size: ${Math.round(crop.width)} × ${Math.round(crop.height)} px
        </div>
        <button class="panel-download">Download Crop</button>
      `;

      el.querySelector('.panel-remove').addEventListener('click', () => {
        callbacks.onRemove(crop.id);
      });

      el.querySelector('.panel-download').addEventListener('click', () => {
        callbacks.onDownloadSingle(crop);
      });

      container.appendChild(el);
    });
  }

  // ─── Download Button ──────────────────────────────────────────────────────

  /**
   * Update the "Download All" button text and state.
   */
  function updateDownloadButton(totalPanels) {
    const btn = document.getElementById('btn-download-all');
    const label = document.getElementById('download-label');
    const hint = document.getElementById('download-hint');

    label.textContent = `Download All Panels (${totalPanels})`;
    btn.disabled = totalPanels === 0;

    if (totalPanels > 0) {
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }

  /**
   * Show/hide the download progress indicator.
   */
  function showDownloadProgress(current, total) {
    const label = document.getElementById('download-label');
    const progress = document.getElementById('download-progress');
    const text = document.getElementById('progress-text');
    const btn = document.getElementById('btn-download-all');

    if (current < 0) {
      // Hide progress, restore label
      label.classList.remove('hidden');
      progress.classList.add('hidden');
      btn.disabled = false;
      return;
    }

    label.classList.add('hidden');
    progress.classList.remove('hidden');
    text.textContent = `${current} / ${total}`;
    btn.disabled = true;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { renderStripList, renderPanelList, updateDownloadButton, showDownloadProgress };

})();
