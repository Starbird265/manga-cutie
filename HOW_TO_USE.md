# 📖 How to Use MangaCutie

Welcome to MangaCutie! This guide will walk you through the process of installing, running, and using the application to read your long manga strips.

---

## 1️⃣ Prerequisites

Before you begin, ensure that you have **Python 3.7 or higher** installed on your system.
You can verify your Python version by opening your terminal or command prompt and running:
```bash
python --version
```

---

## 2️⃣ Installation

You will need to install the required dependencies (`PyQt6` and `Pillow`) to run the application.

1. Open your terminal or command prompt.
2. Navigate to the directory where `main.py` is located.
3. Run the following command to install the required packages via `pip`:

```bash
pip install PyQt6 Pillow
```

*(Optional but recommended)*: If you prefer using virtual environments to keep your dependencies clean, you can do so:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install PyQt6 Pillow
```

---

## 3️⃣ Running the Application

Once the dependencies are installed, you can launch the app by running:

```bash
python main.py
```

The MangaCutie window will open, displaying a dark-themed interface with a sidebar on the left, a toolbar at the top, and a large viewing area on the right.

---

## 4️⃣ Detailed Usage Guide

### 📂 Uploading Manga Strips
- Click the **"📂 Upload Strips"** button located at the top left of the window.
- A file dialog will appear. Select the manga images (PNG, JPG, JPEG, WEBP, BMP, TIFF) you want to read. You can select multiple files at once.
- The files will be added to the **"Uploaded Strips"** list in the left sidebar.

### 🖼️ Reading & Navigating
- Click on any image name in the sidebar to load it into the main viewer.
- **Panning:** Simply **click, hold, and drag** your mouse anywhere on the image. It will glide smoothly.
- **Zooming:** Hold down the **`Ctrl`** key on your keyboard and scroll your **Mouse Wheel**. Only the visible tiles will be loaded — zooming in uses less memory!

### ✂️ Cropping & Saving Panels
This is MangaCutie's most powerful feature for manga collectors and editors:

1. Click the **"✂️ Crop Mode"** button in the toolbar — it will turn orange to indicate crop mode is active.
2. Your cursor will change to a crosshair.
3. **Draw a rectangle** on the image by clicking and dragging. A green dashed rectangle will show your selection.
4. The status bar at the bottom will display the exact dimensions and position of your selection (e.g., `Selection: 800×600 px at (120, 340)`).
5. Click the **"💾 Save Crop"** button to export the selected area.

**Where do crops get saved?**
- A folder is automatically created on your **Desktop** named `MangaCutie - [strip name]`.
- For example, if you're reading `chapter_01.png`, your crops go to `~/Desktop/MangaCutie - chapter_01/`.
- Each crop is saved as a lossless PNG file with a descriptive name like `crop_001_120x340_800x600.png`.
- You can crop as many areas as you want — they are numbered sequentially!

6. To exit crop mode, click the **"✂️ Crop Mode"** button again to toggle it off. You'll return to normal scroll/pan mode.

### 💾 Auto-Resume (Crash & Exit Protection)
You don't need to manually save anything! MangaCutie constantly records your session. If you accidentally close the app, or if you just want to take a break, simply exit.

When you run `python main.py` again, MangaCutie will automatically:
1. Reload your uploaded strips.
2. Re-open the **exact selected panel/strip** you were reading.
3. Restore your **zoom level** and **scroll position** down to the exact pixel.
4. Restore the width of your sidebar/viewer panels.

---

## 5️⃣ How the Tile Engine Works (For the Curious)

Unlike traditional image viewers that load the entire image into RAM, MangaCutie uses a **tile-based lazy loading** approach:

- The image is conceptually divided into a grid of 512×512 pixel tiles.
- Only the tiles currently visible in your viewport (plus a small buffer) are decoded and loaded.
- Tiles that scroll far off-screen are automatically **evicted** from memory.
- A maximum of ~120 tiles are kept in memory at any time (LRU eviction).
- This means a 100,000-pixel-tall image uses the same amount of RAM as a 1,000-pixel-tall one!

---

## 6️⃣ Troubleshooting

- **"ModuleNotFoundError: No module named 'PyQt6'"**
  This means the dependencies aren't installed. Make sure you run `pip install PyQt6 Pillow`.
- **Tiles appear as dark squares briefly before loading.**
  This is normal! Those are placeholders. As you scroll, tiles are decoded from disk in real-time. On fast machines this is nearly instantaneous.
- **My position didn't save!**
  Make sure the application has permission to write files in its own directory. MangaCutie creates a tiny file called `cache.json` in the same folder as `main.py` to save your state.
- **Where are my cropped images?**
  Check your Desktop! There should be a folder called `MangaCutie - [strip name]` containing your exported PNG crops.
