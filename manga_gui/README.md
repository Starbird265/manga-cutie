# 🌸 MangaCutie 

**MangaCutie** is a lightweight, modern, and blazingly fast image viewer built with Python and PyQt6. It is purpose-built to solve a specific problem: viewing **extremely long image strips** (such as Webtoons, Manhwa, and vertically scrolling Manga) natively on your desktop without stuttering, crashing, or hitting operating system texture limits.

By intelligently chunking massive images under the hood, MangaCutie provides a seamless reading experience with an infinite canvas size. 

---

## ✨ Key Features

- 🚀 **Unlimited Length Support:** Standard OS image viewers often fail or crash when opening images longer than 32,000 pixels. MangaCutie dynamically slices the image in memory, allowing for infinite scrolling length.
- 💾 **Smart Auto-Caching:** Never lose your place! MangaCutie automatically saves your state. It remembers your **uploaded strips**, your **selected panels**, your **zoom level**, and your **exact scroll position**. If you accidentally close the app, everything resumes exactly where you left off.
- 🖱️ **Smooth Navigation:** Read naturally with click-and-drag panning. Use `Ctrl + MouseWheel` for precise zooming in and out.
- 🎨 **Modern Dark UI:** A sleek, minimal, and eye-friendly dark mode interface that keeps the focus entirely on the artwork.
- 🗂️ **UI Panel Memory:** The app remembers the exact sizes of your sidebar and viewing window (your selected panels layout). 

---

## 🛠️ Technology Stack

- **Python 3.7+**
- **PyQt6:** For the robust, hardware-accelerated GUI.
- **Pillow (PIL):** For safe, unlimited-size image processing and chunking.

---

## 📚 Getting Started

Ready to start reading your long manga strips? Please head over to the **[HOW_TO_USE.md](HOW_TO_USE.md)** file for detailed, step-by-step instructions on how to install and run MangaCutie.

---

## 📝 License
This project is open-source and free to use. Modify and distribute it as you see fit!
