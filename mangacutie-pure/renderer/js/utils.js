/* ═══════════════════════════════════════════════════════════════════════════════
   MangaCutie — Utility Functions
   ID generation, crop export, blob helpers, debounce.
   ═══════════════════════════════════════════════════════════════════════════════ */

const Utils = (function () {

  /**
   * Generate a random 7-character alphanumeric ID.
   */
  function generateId() {
    return Math.random().toString(36).substring(2, 9);
  }

  /**
   * Standard debounce — delays `fn` until `ms` milliseconds after the last call.
   */
  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /**
   * Generate a cropped PNG Blob from the source image and crop coordinates.
   * Adds an inner black border (default 5px) for clean panel separation.
   *
   * @param {HTMLImageElement} img  — Fully loaded source image
   * @param {{ x: number, y: number, width: number, height: number }} crop
   * @param {number} borderThickness — Inner border width in px (default 5)
   * @returns {Promise<Blob|null>}
   */
  function generateCropBlob(img, crop, borderThickness = 5) {
    return new Promise((resolve) => {
      const x = Math.round(crop.x);
      const y = Math.round(crop.y);
      const w = Math.round(crop.width);
      const h = Math.round(crop.height);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      // Draw the cropped region
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

      // Draw inner black border (line centered on edge → double width, outer half clipped)
      if (borderThickness > 0) {
        ctx.strokeStyle = '#000000';
        ctx.lineJoin = 'miter';
        ctx.lineWidth = borderThickness * 2;
        ctx.strokeRect(0, 0, w, h);
      }

      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  /**
   * Convert a Blob to a Uint8Array for IPC transfer to the main process.
   */
  async function blobToUint8Array(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Clamp a number between min and max.
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return { generateId, debounce, generateCropBlob, blobToUint8Array, clamp };
})();
