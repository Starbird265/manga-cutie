import sys
import os
import io
import json
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QFileDialog, QListWidget, QGraphicsView, QGraphicsScene,
    QGraphicsPixmapItem, QMessageBox, QLabel, QSplitter
)
from PyQt6.QtGui import QPixmap, QImage, QPainter, QPen, QColor
from PyQt6.QtCore import Qt, QRectF, QPointF, QTimer
from PIL import Image

# Completely remove Pillow's limit for massive image files (Manga can be very long)
Image.MAX_IMAGE_PIXELS = None

class MangaViewer(QGraphicsView):
    def __init__(self):
        super().__init__()
        self.scene = QGraphicsScene(self)
        self.setScene(self.scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        # Pan the view when dragging outside of rubber band
        self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
        
        self.setStyleSheet("background-color: #1e1e1e;")
        
        self.zoom_factor = 1.0
        self.total_height = 0

    def wheelEvent(self, event):
        # Zoom support via Ctrl + MouseWheel
        if event.modifiers() == Qt.KeyboardModifier.ControlModifier:
            if event.angleDelta().y() > 0:
                self.scale(1.1, 1.1)
                self.zoom_factor *= 1.1
            else:
                self.scale(0.9, 0.9)
                self.zoom_factor *= 0.9
        else:
            super().wheelEvent(event)

    def load_long_strip(self, file_path):
        self.scene.clear()
        self.total_height = 0
        self.zoom_factor = 1.0
        self.resetTransform()
        
        try:
            # We use Pillow to safely load unlimited size images
            # and slice them to avoid internal OS texture limits (often ~32000 px)
            CHUNK_HEIGHT = 8192
            
            img = Image.open(file_path)
            width, height = img.size
            
            self.scene.setSceneRect(0, 0, width, height)
            
            y_offset = 0
            while y_offset < height:
                box = (0, y_offset, width, min(y_offset + CHUNK_HEIGHT, height))
                cropped = img.crop(box)
                
                # Convert PIL Image to QPixmap
                if cropped.mode != "RGBA":
                    cropped = cropped.convert("RGBA")
                
                data = cropped.tobytes("raw", "RGBA")
                qimg = QImage(data, cropped.width, cropped.height, QImage.Format.Format_RGBA8888)
                pixmap = QPixmap.fromImage(qimg)
                
                item = QGraphicsPixmapItem(pixmap)
                item.setPos(0, y_offset)
                self.scene.addItem(item)
                
                y_offset += cropped.height
                
            self.total_height = height
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load massive strip:\n{str(e)}")

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
        
        # Toolbar
        toolbar = QHBoxLayout()
        self.btn_upload = QPushButton("Upload Unlimited Strips")
        self.btn_upload.setStyleSheet("padding: 8px; font-weight: bold; background-color: #2e8b57; color: white;")
        self.btn_upload.clicked.connect(self.upload_strips)
        
        self.lbl_info = QLabel("Max File Size: Infinity. No OS Limits on Length.")
        self.lbl_info.setStyleSheet("color: #666;")
        
        toolbar.addWidget(self.btn_upload)
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
        self.viewer = MangaViewer()
        
        self.splitter.addWidget(sidebar_widget)
        self.splitter.addWidget(self.viewer)
        self.splitter.setSizes([300, 900])
        
        layout.addLayout(toolbar)
        layout.addWidget(self.splitter)
        
        self.load_state()

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
                    
                    QTimer.singleShot(100, lambda: self.restore_view_state(state))
                
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
        files, _ = QFileDialog.getOpenFileNames(self, "Select Manga Strips", "", "Images (*.png *.jpg *.jpeg *.webp);;All Files (*)")
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
    app.setPalette(palette)
    
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
