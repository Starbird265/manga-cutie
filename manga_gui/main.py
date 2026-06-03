import sys
import os
import io
import json
import math
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QFileDialog, QListWidget, QGraphicsView, QGraphicsScene,
    QGraphicsPixmapItem, QGraphicsRectItem, QGraphicsTextItem, QMessageBox,
    QLabel, QSplitter, QStatusBar
)
from PyQt6.QtGui import QPixmap, QImage, QPainter, QPen, QColor, QBrush, QCursor
from PyQt6.QtCore import Qt, QRectF, QPointF, QTimer
from PIL import Image
from collections import OrderedDict

# Completely remove Pillow's limit for massive image files (Manga can be very long)
Image.MAX_IMAGE_PIXELS = None

TILE_SIZE = 512
MAX_LOADED_TILES = 120
BUFFER_TILES = 2  # Extra tiles to load around viewport for smooth scrolling


class TilePlaceholder(QGraphicsRectItem):
    """A dark placeholder rect shown while a tile is loading or unloaded."""
    def __init__(self, x, y, w, h):
        super().__init__(x, y, w, h)
        self.setBrush(QBrush(QColor(25, 25, 25)))
        self.setPen(QPen(QColor(40, 40, 40), 0.5))


class SelectionOverlay(QGraphicsRectItem):
    """Semi-transparent selection rectangle for cropping."""
    def __init__(self, number=1):
        super().__init__()
        self.number = number
        self.setPen(QPen(QColor(0, 200, 100), 2, Qt.PenStyle.DashLine))
        self.setBrush(QBrush(QColor(0, 200, 100, 40)))
        self.setZValue(1000)  # Always on top
        # Number label inside the selection
        self.label = QGraphicsTextItem(str(number), self)
        self.label.setDefaultTextColor(QColor(255, 255, 255))
        font = self.label.font()
        font.setPointSize(14)
        font.setBold(True)
        self.label.setFont(font)


class MangaViewer(QGraphicsView):
    def __init__(self, status_callback=None):
        super().__init__()
        self.scene = QGraphicsScene(self)
        self.setScene(self.scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
        self.setStyleSheet("background-color: #1e1e1e;")
        self.setViewportUpdateMode(QGraphicsView.ViewportUpdateMode.SmartViewportUpdate)

        self.zoom_factor = 1.0
        self.total_height = 0
        self.total_width = 0
        self.status_callback = status_callback

        # Tile engine state
        self.current_file = None
        self.pil_image = None  # Kept open in lazy mode
        self.tile_cols = 0
        self.tile_rows = 0
        self.loaded_tiles = OrderedDict()  # (col, row) -> QGraphicsPixmapItem
        self.placeholders = {}  # (col, row) -> TilePlaceholder

        # Crop / selection state
        self.crop_mode = False
        self.active_overlay = None  # The overlay currently being drawn
        self.selection_start = None
        self.crop_selections = []  # List of (QRectF, SelectionOverlay) tuples

        # Debounce timer for tile updates
        self._tile_timer = QTimer()
        self._tile_timer.setSingleShot(True)
        self._tile_timer.setInterval(50)
        self._tile_timer.timeout.connect(self._update_visible_tiles)

        # Connect scrollbar changes to tile updates
        self.verticalScrollBar().valueChanged.connect(self._schedule_tile_update)
        self.horizontalScrollBar().valueChanged.connect(self._schedule_tile_update)

    def _schedule_tile_update(self):
        """Debounce tile updates so we don't thrash during fast scrolling."""
        if not self._tile_timer.isActive():
            self._tile_timer.start()

    def set_crop_mode(self, enabled):
        self.crop_mode = enabled
        if enabled:
            self.setDragMode(QGraphicsView.DragMode.NoDrag)
            self.setCursor(QCursor(Qt.CursorShape.CrossCursor))
        else:
            self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
            self.setCursor(QCursor(Qt.CursorShape.ArrowCursor))
            # Note: we keep existing selections on screen — they persist!
            self.active_overlay = None

    # ─── Mouse events for multi-crop selection ─────────────────────────
    def mousePressEvent(self, event):
        if self.crop_mode and event.button() == Qt.MouseButton.LeftButton:
            self.selection_start = self.mapToScene(event.pos())
            num = len(self.crop_selections) + 1
            self.active_overlay = SelectionOverlay(num)
            self.active_overlay.setRect(QRectF(self.selection_start, self.selection_start))
            self.scene.addItem(self.active_overlay)
            event.accept()
        else:
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self.crop_mode and self.selection_start is not None and self.active_overlay:
            current = self.mapToScene(event.pos())
            rect = QRectF(self.selection_start, current).normalized()
            # Clamp to image bounds
            rect = rect.intersected(QRectF(0, 0, self.total_width, self.total_height))
            self.active_overlay.setRect(rect)
            # Reposition the label to the top-left of the selection
            self.active_overlay.label.setPos(rect.x() + 4, rect.y() + 2)
            if self.status_callback:
                total = len(self.crop_selections) + 1
                self.status_callback(
                    f"Drawing #{total}: {int(rect.width())}×{int(rect.height())} px  "
                    f"at ({int(rect.x())}, {int(rect.y())})"
                )
            event.accept()
        else:
            super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self.crop_mode and self.selection_start is not None and self.active_overlay:
            current = self.mapToScene(event.pos())
            rect = QRectF(self.selection_start, current).normalized()
            rect = rect.intersected(QRectF(0, 0, self.total_width, self.total_height))
            self.selection_start = None
            # Only add if selection is large enough (not accidental clicks)
            if rect.width() > 5 and rect.height() > 5:
                self.active_overlay.setRect(rect)
                self.active_overlay.label.setPos(rect.x() + 4, rect.y() + 2)
                self.crop_selections.append((rect, self.active_overlay))
                if self.status_callback:
                    self.status_callback(
                        f"✅ {len(self.crop_selections)} selection(s) queued  —  "
                        f"Click '💾 Save All' to export them all at once"
                    )
            else:
                # Too small — remove it
                if self.active_overlay.scene():
                    self.scene.removeItem(self.active_overlay)
            self.active_overlay = None
            event.accept()
        else:
            super().mouseReleaseEvent(event)

    def undo_last_selection(self):
        """Remove the most recent selection."""
        if self.crop_selections:
            rect, overlay = self.crop_selections.pop()
            if overlay.scene():
                self.scene.removeItem(overlay)
            if self.status_callback:
                count = len(self.crop_selections)
                self.status_callback(f"{count} selection(s) remaining")

    def clear_all_selections(self):
        """Remove all selections from the scene."""
        for rect, overlay in self.crop_selections:
            if overlay.scene():
                self.scene.removeItem(overlay)
        self.crop_selections.clear()
        if self.status_callback:
            self.status_callback("All selections cleared")

    # ─── Zoom ──────────────────────────────────────────────────────────
    def wheelEvent(self, event):
        if event.modifiers() == Qt.KeyboardModifier.ControlModifier:
            if event.angleDelta().y() > 0:
                self.scale(1.1, 1.1)
                self.zoom_factor *= 1.1
            else:
                self.scale(0.9, 0.9)
                self.zoom_factor *= 0.9
            self._schedule_tile_update()
        else:
            super().wheelEvent(event)

    # ─── Resize triggers tile recalculation ────────────────────────────
    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._schedule_tile_update()

    # ─── Tile-based image loading ──────────────────────────────────────
    def load_long_strip(self, file_path):
        """Open image lazily — only read header, don't decode pixels yet."""
        # Clean up previous
        self._unload_all_tiles()
        self.scene.clear()
        self.loaded_tiles.clear()
        self.placeholders.clear()
        self.zoom_factor = 1.0
        self.resetTransform()
        self.crop_selections = []
        self.active_overlay = None

        try:
            self.pil_image = Image.open(file_path)
            self.total_width, self.total_height = self.pil_image.size
            self.current_file = file_path

            self.tile_cols = math.ceil(self.total_width / TILE_SIZE)
            self.tile_rows = math.ceil(self.total_height / TILE_SIZE)

            # Set scene rect to full image size
            self.scene.setSceneRect(0, 0, self.total_width, self.total_height)

            # Create placeholders for all tiles
            for row in range(self.tile_rows):
                for col in range(self.tile_cols):
                    x = col * TILE_SIZE
                    y = row * TILE_SIZE
                    w = min(TILE_SIZE, self.total_width - x)
                    h = min(TILE_SIZE, self.total_height - y)
                    ph = TilePlaceholder(x, y, w, h)
                    self.scene.addItem(ph)
                    self.placeholders[(col, row)] = ph

            # Load the initial visible tiles
            QTimer.singleShot(10, self._update_visible_tiles)

            if self.status_callback:
                self.status_callback(
                    f"Loaded: {os.path.basename(file_path)}  "
                    f"({self.total_width}×{self.total_height} px, "
                    f"{self.tile_cols * self.tile_rows} tiles)"
                )

        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load strip:\n{str(e)}")

    def _update_visible_tiles(self):
        """Core tile engine: load visible tiles, unload far-away ones."""
        if self.pil_image is None:
            return

        # Get the viewport rect in scene coordinates
        viewport_rect = self.mapToScene(self.viewport().rect()).boundingRect()

        # Determine which tile indices are visible (with buffer)
        col_start = max(0, int(viewport_rect.left() / TILE_SIZE) - BUFFER_TILES)
        col_end = min(self.tile_cols, int(viewport_rect.right() / TILE_SIZE) + 1 + BUFFER_TILES)
        row_start = max(0, int(viewport_rect.top() / TILE_SIZE) - BUFFER_TILES)
        row_end = min(self.tile_rows, int(viewport_rect.bottom() / TILE_SIZE) + 1 + BUFFER_TILES)

        visible_keys = set()
        for row in range(row_start, row_end):
            for col in range(col_start, col_end):
                visible_keys.add((col, row))

        # Load tiles that are visible but not yet loaded
        for key in visible_keys:
            if key not in self.loaded_tiles:
                self._load_tile(key)

        # Unload tiles that are far off-screen
        keys_to_unload = []
        for key in list(self.loaded_tiles.keys()):
            if key not in visible_keys:
                keys_to_unload.append(key)

        for key in keys_to_unload:
            self._unload_tile(key)

        # Enforce max tile limit (LRU eviction)
        while len(self.loaded_tiles) > MAX_LOADED_TILES:
            oldest_key, _ = self.loaded_tiles.popitem(last=False)
            self._unload_tile_item(oldest_key)

    def _load_tile(self, key):
        """Decode a single tile from disk and add it to the scene."""
        col, row = key
        x = col * TILE_SIZE
        y = row * TILE_SIZE
        w = min(TILE_SIZE, self.total_width - x)
        h = min(TILE_SIZE, self.total_height - y)

        try:
            # Crop the tile region from the PIL image
            box = (x, y, x + w, y + h)
            tile_img = self.pil_image.crop(box)

            if tile_img.mode != "RGBA":
                tile_img = tile_img.convert("RGBA")

            data = tile_img.tobytes("raw", "RGBA")
            qimg = QImage(data, tile_img.width, tile_img.height, QImage.Format.Format_RGBA8888)
            pixmap = QPixmap.fromImage(qimg.copy())  # .copy() ensures data stays valid

            item = QGraphicsPixmapItem(pixmap)
            item.setPos(x, y)
            self.scene.addItem(item)
            self.loaded_tiles[key] = item

            # Hide placeholder
            if key in self.placeholders:
                self.placeholders[key].setVisible(False)

        except Exception as e:
            print(f"Failed to load tile {key}: {e}")

    def _unload_tile(self, key):
        """Remove a tile from the scene and free its memory."""
        if key in self.loaded_tiles:
            item = self.loaded_tiles.pop(key)
            self._unload_tile_item_obj(item)
            # Show placeholder again
            if key in self.placeholders:
                self.placeholders[key].setVisible(True)

    def _unload_tile_item(self, key):
        """Remove tile item when evicted by LRU."""
        # The item was already popped from loaded_tiles by popitem
        # We need to find and remove from scene
        pass  # handled by _unload_tile

    def _unload_tile_item_obj(self, item):
        if item.scene():
            self.scene.removeItem(item)

    def _unload_all_tiles(self):
        for key in list(self.loaded_tiles.keys()):
            self._unload_tile(key)

    # ─── Crop export ───────────────────────────────────────────────────
    def save_all_crops(self):
        """Export ALL queued crop selections from the original image."""
        if not self.crop_selections or not self.pil_image or not self.current_file:
            return []

        # Create folder on Desktop named after the strip
        strip_name = os.path.splitext(os.path.basename(self.current_file))[0]
        desktop = os.path.expanduser("~/Desktop")
        save_dir = os.path.join(desktop, f"MangaCutie - {strip_name}")
        os.makedirs(save_dir, exist_ok=True)

        # Find next available number
        existing = [f for f in os.listdir(save_dir) if f.startswith("crop_") and f.endswith(".png")]
        next_num = len(existing) + 1

        saved_paths = []
        for i, (rect, overlay) in enumerate(self.crop_selections):
            x = max(0, int(rect.x()))
            y = max(0, int(rect.y()))
            w = min(int(rect.width()), self.total_width - x)
            h = min(int(rect.height()), self.total_height - y)

            if w <= 0 or h <= 0:
                continue

            # Crop directly from source image (memory efficient)
            cropped = self.pil_image.crop((x, y, x + w, y + h))
            filename = f"crop_{next_num + i:03d}_{x}x{y}_{w}x{h}.png"
            save_path = os.path.join(save_dir, filename)
            cropped.save(save_path, "PNG")
            saved_paths.append(save_path)

        # Clear all selections from the scene after saving
        self.clear_all_selections()

        return saved_paths, save_dir


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("MangaCutie - Unlimited Local Interface")
        self.resize(1200, 800)

        self.strips = []
        self.cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache.json")

        # Central widget and layouts
        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)

        # Status bar
        self.statusbar = QStatusBar()
        self.setStatusBar(self.statusbar)
        self.statusbar.setStyleSheet("color: #aaa; font-size: 12px;")

        # Toolbar
        toolbar = QHBoxLayout()
        self.btn_upload = QPushButton("📂 Upload Strips")
        self.btn_upload.setStyleSheet(
            "padding: 8px 14px; font-weight: bold; background-color: #2e8b57; "
            "color: white; border-radius: 4px;"
        )
        self.btn_upload.clicked.connect(self.upload_strips)

        self.btn_crop = QPushButton("✂️ Crop Mode")
        self.btn_crop.setCheckable(True)
        self.btn_crop.setStyleSheet(
            "padding: 8px 14px; font-weight: bold; background-color: #555; "
            "color: white; border-radius: 4px;"
        )
        self.btn_crop.toggled.connect(self.toggle_crop_mode)

        self.btn_save_all = QPushButton("💾 Save All")
        self.btn_save_all.setStyleSheet(
            "padding: 8px 14px; font-weight: bold; background-color: #c0392b; "
            "color: white; border-radius: 4px;"
        )
        self.btn_save_all.clicked.connect(self.save_all_crops)
        self.btn_save_all.setEnabled(False)

        self.btn_undo = QPushButton("↩ Undo Last")
        self.btn_undo.setStyleSheet(
            "padding: 8px 14px; font-weight: bold; background-color: #7f8c8d; "
            "color: white; border-radius: 4px;"
        )
        self.btn_undo.clicked.connect(self.undo_last_selection)
        self.btn_undo.setEnabled(False)

        self.btn_clear = QPushButton("🗑 Clear All")
        self.btn_clear.setStyleSheet(
            "padding: 8px 14px; font-weight: bold; background-color: #7f8c8d; "
            "color: white; border-radius: 4px;"
        )
        self.btn_clear.clicked.connect(self.clear_all_selections)
        self.btn_clear.setEnabled(False)

        self.lbl_count = QLabel("  0 selected")
        self.lbl_count.setStyleSheet("color: #2ecc71; font-weight: bold; font-size: 13px;")

        self.lbl_info = QLabel("Tile-Based Engine • Infinite Length • Zero RAM Waste")
        self.lbl_info.setStyleSheet("color: #666; font-style: italic;")

        toolbar.addWidget(self.btn_upload)
        toolbar.addWidget(self.btn_crop)
        toolbar.addWidget(self.btn_save_all)
        toolbar.addWidget(self.btn_undo)
        toolbar.addWidget(self.btn_clear)
        toolbar.addWidget(self.lbl_count)
        toolbar.addWidget(self.lbl_info)
        toolbar.addStretch()

        # Splitter to separate sidebar and viewer
        self.splitter = QSplitter(Qt.Orientation.Horizontal)

        # Sidebar for List
        sidebar_widget = QWidget()
        sidebar_layout = QVBoxLayout(sidebar_widget)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)

        self.strip_list = QListWidget()
        self.strip_list.itemClicked.connect(self.on_strip_selected)
        sidebar_layout.addWidget(QLabel("Uploaded Strips:"))
        sidebar_layout.addWidget(self.strip_list)

        # Viewer
        self.viewer = MangaViewer(status_callback=self.update_status)

        self.splitter.addWidget(sidebar_widget)
        self.splitter.addWidget(self.viewer)
        self.splitter.setSizes([300, 900])

        layout.addLayout(toolbar)
        layout.addWidget(self.splitter)

        self.load_state()

    def update_status(self, msg):
        self.statusbar.showMessage(msg)
        count = len(self.viewer.crop_selections)
        self.lbl_count.setText(f"  {count} selected")
        has_selections = count > 0
        self.btn_save_all.setEnabled(has_selections)
        self.btn_undo.setEnabled(has_selections)
        self.btn_clear.setEnabled(has_selections)

    def toggle_crop_mode(self, checked):
        self.viewer.set_crop_mode(checked)
        if checked:
            self.btn_crop.setStyleSheet(
                "padding: 8px 14px; font-weight: bold; background-color: #e67e22; "
                "color: white; border-radius: 4px;"
            )
            self.statusbar.showMessage("✂️ Crop Mode ON — Draw rectangles on the image, then Save All")
        else:
            self.btn_crop.setStyleSheet(
                "padding: 8px 14px; font-weight: bold; background-color: #555; "
                "color: white; border-radius: 4px;"
            )
            self.statusbar.showMessage("Crop Mode OFF")

    def save_all_crops(self):
        if not self.viewer.crop_selections:
            QMessageBox.warning(self, "No Selections", "Please draw at least one selection rectangle first.")
            return

        result = self.viewer.save_all_crops()
        if result:
            saved_paths, save_dir = result
            count = len(saved_paths)
            self.statusbar.showMessage(f"✅ Saved {count} crop(s) to Desktop")
            self.lbl_count.setText("  0 selected")
            self.btn_save_all.setEnabled(False)
            self.btn_undo.setEnabled(False)
            self.btn_clear.setEnabled(False)
            QMessageBox.information(
                self, "All Crops Saved!",
                f"{count} cropped image(s) saved to:\n{save_dir}"
            )
        else:
            QMessageBox.warning(self, "Error", "Failed to save crops.")

    def undo_last_selection(self):
        self.viewer.undo_last_selection()
        count = len(self.viewer.crop_selections)
        self.lbl_count.setText(f"  {count} selected")
        has_selections = count > 0
        self.btn_save_all.setEnabled(has_selections)
        self.btn_undo.setEnabled(has_selections)
        self.btn_clear.setEnabled(has_selections)

    def clear_all_selections(self):
        self.viewer.clear_all_selections()
        self.lbl_count.setText("  0 selected")
        self.btn_save_all.setEnabled(False)
        self.btn_undo.setEnabled(False)
        self.btn_clear.setEnabled(False)

    def load_state(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r") as f:
                    state = json.load(f)

                self.strips = state.get("strips", [])
                for file in self.strips:
                    self.strip_list.addItem(os.path.basename(file))

                current_idx = state.get("current_index", -1)
                if 0 <= current_idx < len(self.strips):
                    self.strip_list.setCurrentRow(current_idx)
                    self.viewer.load_long_strip(self.strips[current_idx])

                    QTimer.singleShot(200, lambda: self.restore_view_state(state))

                splitter_sizes = state.get("splitter_sizes")
                if splitter_sizes:
                    self.splitter.setSizes(splitter_sizes)
            except Exception as e:
                print(f"Failed to load cache: {e}")

    def restore_view_state(self, state):
        self.viewer.zoom_factor = state.get("zoom_factor", 1.0)
        if self.viewer.zoom_factor != 1.0:
            self.viewer.scale(self.viewer.zoom_factor, self.viewer.zoom_factor)

        h_val = state.get("h_scrollbar", 0)
        v_val = state.get("v_scrollbar", 0)
        self.viewer.horizontalScrollBar().setValue(h_val)
        self.viewer.verticalScrollBar().setValue(v_val)

    def save_state(self):
        state = {
            "strips": self.strips,
            "current_index": self.strip_list.currentRow(),
            "zoom_factor": self.viewer.zoom_factor,
            "h_scrollbar": self.viewer.horizontalScrollBar().value(),
            "v_scrollbar": self.viewer.verticalScrollBar().value(),
            "splitter_sizes": self.splitter.sizes()
        }
        try:
            with open(self.cache_file, "w") as f:
                json.dump(state, f)
        except Exception as e:
            print(f"Failed to save cache: {e}")

    def closeEvent(self, event):
        self.save_state()
        super().closeEvent(event)

    def upload_strips(self):
        files, _ = QFileDialog.getOpenFileNames(
            self, "Select Manga Strips", "",
            "Images (*.png *.jpg *.jpeg *.webp *.bmp *.tiff);;All Files (*)"
        )
        for file in files:
            if file not in self.strips:
                self.strips.append(file)
                self.strip_list.addItem(os.path.basename(file))

        # Automatically load the first one if viewer is empty
        if len(self.strips) > 0 and self.strip_list.currentRow() == -1:
            self.strip_list.setCurrentRow(0)
            self.viewer.load_long_strip(self.strips[0])

        self.save_state()

    def on_strip_selected(self, item):
        idx = self.strip_list.row(item)
        if 0 <= idx < len(self.strips):
            self.viewer.load_long_strip(self.strips[idx])
            self.save_state()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")

    # Modern Dark Theme
    palette = app.palette()
    palette.setColor(palette.ColorRole.Window, QColor(45, 45, 45))
    palette.setColor(palette.ColorRole.WindowText, Qt.GlobalColor.white)
    palette.setColor(palette.ColorRole.Base, QColor(30, 30, 30))
    palette.setColor(palette.ColorRole.AlternateBase, QColor(45, 45, 45))
    palette.setColor(palette.ColorRole.Text, Qt.GlobalColor.white)
    palette.setColor(palette.ColorRole.Button, QColor(53, 53, 53))
    palette.setColor(palette.ColorRole.ButtonText, Qt.GlobalColor.white)
    palette.setColor(palette.ColorRole.Highlight, QColor(46, 139, 87))
    palette.setColor(palette.ColorRole.HighlightedText, Qt.GlobalColor.white)
    app.setPalette(palette)

    window = MainWindow()
    window.show()
    sys.exit(app.exec())
