# 🌸 MangaCutie

**MangaCutie** is a lightweight, modern, and blazingly fast image viewer built with Python and PyQt6. It is purpose-built to solve a specific problem: viewing **extremely long image strips** (such as Webtoons, Manhwa, and vertically scrolling Manga) natively on your desktop without stuttering, crashing, or hitting operating system texture limits.

Powered by a **tile-based lazy loading engine** (like Google Maps), MangaCutie only loads the pixels you can actually see. This means truly infinite image sizes with minimal RAM usage.

---

## ✨ Key Features

- 🚀 **Tile-Based Lazy Loading:** Instead of loading the entire image at once, the engine divides images into a grid of 512×512 tiles and only loads the ones visible in your viewport. Tiles far off-screen are automatically evicted from memory (LRU). RAM stays bounded no matter how large the image is.
- ✂️ **Multi-Selection Crop Tool:** Toggle crop mode, draw multiple selection rectangles across the strip, and download them all in one click. Great for batch-saving panels. All crops are organized into a folder on your Desktop named after the strip (e.g., `MangaCutie - chapter_01/`).
- 💾 **Smart Auto-Caching:** Never lose your place! MangaCutie automatically saves your **uploaded strips**, your **selected panels**, your **zoom level**, your **panel layout sizes**, and your **exact scroll position**. If you accidentally close the app, everything resumes exactly where you left off.
- 🖱️ **Smooth Navigation:** Read naturally with click-and-drag panning. Use `Ctrl + MouseWheel` for precise zooming in and out.
- 🎨 **Modern Dark UI:** A sleek, minimal, and eye-friendly dark mode interface with a status bar that shows real-time tile info and selection dimensions.

---

## 🛠️ Technology Stack

- **Python 3.7+**
- **PyQt6:** For the robust, hardware-accelerated GUI.
- **Pillow (PIL):** For safe, unlimited-size image processing and on-demand tile decoding.

---

## 📚 Getting Started

Ready to start reading your long manga strips? Please head over to the **[HOW_TO_USE.md](HOW_TO_USE.md)** file for detailed, step-by-step instructions on how to install and run MangaCutie.

---

## 🧠 How the Tile Engine Works

```
┌──────────────────────────────────────────────┐
│              Image File (Disk)               │
│        (can be 100,000+ px tall)             │
├──────────────────────────────────────────────┤
│  Tile Grid (metadata only, no pixel data)    │
│  ┌─────┬─────┬─────┬─────┐                  │
│  │ 0,0 │ 1,0 │ 2,0 │ 3,0 │  ← row 0        │
│  ├─────┼─────┼─────┼─────┤                  │
│  │ 0,1 │ 1,1 │ 2,1 │ 3,1 │  ← row 1        │
│  ├─────┼─────┼─────┼─────┤                  │
│  │ ... │ ... │ ... │ ... │  ← ...            │
│  └─────┴─────┴─────┴─────┘                  │
├──────────────────────────────────────────────┤
│          Viewport (what you see)             │
│  ┌─────────────┐                             │
│  │  Only these  │  ← 6-12 tiles loaded       │
│  │  tiles are   │     in RAM at any time      │
│  │  in memory   │                             │
│  └─────────────┘                             │
└──────────────────────────────────────────────┘
```

---

## 📝 License
This project is open-source and free to use. Modify and distribute it as you see fit!
