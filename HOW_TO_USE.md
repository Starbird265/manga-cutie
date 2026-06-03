# 📖 How to Use MangaCutie (Pure Electron)

Welcome to MangaCutie! This guide will walk you through the process of installing, running, and using the pure local Electron application to read and crop extremely long manga strips.

---

## 1️⃣ Prerequisites

Before you begin, ensure that you have **Node.js** installed on your system.
You can verify your Node version by opening your terminal or command prompt and running:
```bash
node -v
npm -v
```

---

## 2️⃣ Installation

You will need to install the required Node.js dependencies (which is just Electron in this pure, zero-framework version).

1. Open your terminal or command prompt.
2. Navigate to the `mangacutie-pure` directory.
3. Run the following command to install packages:

```bash
cd "mangacutie-pure"
npm install
```

---

## 3️⃣ Running the Application

Once the dependencies are installed, launch the desktop app by running:

```bash
npm start
```

The MangaCutie window will open, displaying a dark-themed, premium interface with a strip sidebar on the left, a toolbar at the top, a large viewing area in the center, and a panel manager on the right.

---

## 4️⃣ Detailed Usage Guide

### 📂 Uploading Manga Strips
- Click the **"Upload Images"** button located at the top left of the window in the sidebar.
- A native file dialog will appear. Select the manga images (PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF) you want to read. You can select multiple files at once.
- The files will be added to the **"Uploaded Strips"** list in the left sidebar.

### 🖼️ Reading & Navigating
- Click on any image name in the left sidebar to load it into the main viewer.
- **Panning:** Select the **"✋ Pan"** tool in the top right toolbar. Simply **click, hold, and drag** your mouse anywhere on the image. It will glide smoothly.
- **Zooming:** You can use the **`+` / `-`** buttons in the toolbar, or hold down the **`Ctrl` / `Cmd`** key on your keyboard and scroll your **Mouse Wheel** to zoom in and out. Only the visible tiles will be loaded.

### ✂️ Cropping & Saving Panels
This is MangaCutie's most powerful feature for manga collectors and editors:

1. Click the **"✂️ Crop"** button in the toolbar — it will turn orange to indicate crop mode is active.
2. Your cursor will change to a crosshair.
3. **Draw a rectangle** on the image by clicking and dragging. A green rectangle will show your selection with a badge indicating its panel number.
4. **Move and Resize:** In crop mode, you can drag existing boxes to move them, or drag the white handles on the edges and corners to resize them.
5. **Select multiple panels:** Keep drawing rectangles on other parts of the image! They will be numbered sequentially.
6. Look at the **right sidebar** ("Export Panels"). You will see a list of all your selected crops with their dimensions. You can remove individual panels from this list or directly from the canvas by clicking the red '×'.
7. Click the **"Download All Panels"** button at the bottom of the right sidebar to export all your selected areas at once! A progress bar will show the export status.
8. (Note: A sleek 5px inner black border is automatically applied to all exported crops).

**Where do crops get saved?**
- A folder is automatically created on your **Desktop** named `MangaCutie - [strip name]`.
- For example, if you're reading `chapter_01.png`, your crops go to `~/Desktop/MangaCutie - chapter_01/`.
- Each crop is saved as a PNG file named sequentially (e.g. `crop_001.png`, `crop_002.png`).

### 💾 Auto-Resume (Crash & Exit Protection)
You don't need to manually save anything! MangaCutie constantly records your session. If you accidentally close the app, or if you just want to take a break, simply exit.

When you run `npm start` again, MangaCutie will automatically:
1. Reload your uploaded strips.
2. Restore all of your drawn crop boxes.
3. Re-open the exact strip you were reading.
4. Restore your **zoom level** and **scroll position** down to the exact pixel.

---

## 5️⃣ How the Tile Engine Works (For the Curious)

Unlike traditional image viewers that load the entire image into RAM (which can crash your OS or browser when viewing 50,000+ pixel tall images), MangaCutie uses a **custom tile-based lazy loading** approach built in pure Javascript:

- The image is conceptually divided into a grid of 512×512 pixel tiles.
- Only the tiles currently visible in your viewport (plus a small buffer) are decoded and loaded using `createImageBitmap`.
- Tiles that scroll far off-screen are automatically **evicted** from memory.
- A maximum of 64 tiles are kept in memory at any time (LRU eviction).
- This means a 100,000-pixel-tall image uses the exact same amount of RAM as a 1,000-pixel-tall one!
- The bottom status bar shows you exactly how many tiles are currently loaded in memory.
