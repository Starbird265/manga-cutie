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

The MangaCutie window will open, displaying a dark-themed interface with a sidebar on the left and a large viewing area on the right.

---

## 4️⃣ Detailed Usage Guide

### 📥 Uploading Manga Strips
- Click the **"Upload Unlimited Strips"** button located at the top left of the window.
- A file dialog will appear. Select the manga images (PNG, JPG, JPEG, WEBP) you want to read. You can select multiple files at once.
- The files will be added to the **"Uploaded Strips"** list in the left sidebar.

### 🖼️ Selecting Panels & Reading
- Click on any image name in the **Uploaded Strips** sidebar to load it into the main viewer.
- **Panning:** To scroll through the manga, simply **click, hold, and drag** your mouse anywhere on the image. It will glide smoothly.
- **Zooming:** To zoom in or out, hold down the **`Ctrl`** key on your keyboard and scroll your **Mouse Wheel**.

### 💾 Auto-Resume (Crash & Exit Protection)
You don't need to manually save anything! MangaCutie constantly records your session. If you accidentally close the app, or if you just want to take a break, simply exit. 

When you run `python main.py` again, MangaCutie will automatically:
1. Reload your uploaded strips.
2. Re-open the **exact selected panel/strip** you were reading.
3. Restore your **zoom level** and **scroll position** down to the exact pixel.
4. Restore the width of your sidebar/viewer panels.

---

## 5️⃣ Troubleshooting

- **"ModuleNotFoundError: No module named 'PyQt6'"**
  This means the dependencies aren't installed. Make sure you run `pip install PyQt6 Pillow`.
- **The images take a few seconds to load.**
  Because MangaCutie bypasses OS limits to load infinitely long images, massive files (e.g., 100,000 pixels long) are being chunked in the background. A slight loading time for massive images is perfectly normal.
- **My position didn't save!**
  Make sure the application has permission to write files in its own directory. MangaCutie creates a tiny file called `cache.json` in the same folder as `main.py` to save your state.
