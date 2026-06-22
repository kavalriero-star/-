"""PyQt5 GUI: 이미지 검사 탭 + 실시간 카메라 탭.

실행:
    python -m src.gui
"""
from __future__ import annotations

import sys

import cv2
import numpy as np
from PyQt5 import QtCore, QtGui, QtWidgets

from .grid import draw_results, load_grid, results_to_dict

GRID_PATH = "config/grid.yaml"


def cv_to_qpixmap(image: np.ndarray) -> QtGui.QPixmap:
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    h, w, ch = rgb.shape
    qimg = QtGui.QImage(rgb.data, w, h, ch * w, QtGui.QImage.Format_RGB888)
    return QtGui.QPixmap.fromImage(qimg.copy())


class InspectorCore:
    """검출기 + 격자 판정을 묶은 핵심 로직 (지연 로딩)."""

    def __init__(self):
        self.grid = load_grid(GRID_PATH)
        self._detector = None
        self._detector_failed = False

    @property
    def detector(self):
        if self._detector is None and not self._detector_failed:
            try:
                from .detector import Detector
                self._detector = Detector(conf=self.grid.conf_threshold)
            except Exception as e:
                print(f"[안내] YOLO 사용 불가, 폴백 판정 사용: {e}")
                self._detector_failed = True
        return self._detector

    def set_conf(self, conf: float):
        self.grid.conf_threshold = conf
        if self._detector is not None:
            self._detector.conf = conf

    def process(self, frame: np.ndarray):
        boxes = []
        det = self.detector
        if det is not None:
            try:
                boxes = det.detect(frame)
            except Exception as e:
                print(f"[검출 오류] {e}")
                boxes = []
        results = self.grid.evaluate(boxes, image=frame)
        overlay = draw_results(frame, results)
        return overlay, results_to_dict(results)


class ImageTab(QtWidgets.QWidget):
    def __init__(self, core: InspectorCore):
        super().__init__()
        self.core = core
        layout = QtWidgets.QHBoxLayout(self)

        self.view = QtWidgets.QLabel("이미지를 불러오세요")
        self.view.setAlignment(QtCore.Qt.AlignCenter)
        self.view.setMinimumSize(640, 480)
        self.view.setStyleSheet("background:#222;color:#aaa;")
        layout.addWidget(self.view, 3)

        side = QtWidgets.QVBoxLayout()
        open_btn = QtWidgets.QPushButton("이미지 열기")
        open_btn.clicked.connect(self.open_image)
        side.addWidget(open_btn)

        self.summary = QtWidgets.QLabel("-")
        self.summary.setWordWrap(True)
        side.addWidget(self.summary)

        self.cell_list = QtWidgets.QListWidget()
        side.addWidget(self.cell_list, 1)
        layout.addLayout(side, 1)

        self._overlay = None

    def open_image(self):
        path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "이미지 선택", "", "Images (*.jpg *.jpeg *.png *.bmp)")
        if not path:
            return
        image = cv2.imread(path)
        if image is None:
            QtWidgets.QMessageBox.warning(self, "오류", "이미지를 열 수 없습니다.")
            return
        overlay, summary = self.core.process(image)
        self._overlay = overlay
        self.view.setPixmap(cv_to_qpixmap(overlay).scaled(
            self.view.size(), QtCore.Qt.KeepAspectRatio,
            QtCore.Qt.SmoothTransformation))
        self.summary.setText(
            f"총 {summary['total_cells']}칸\n"
            f"제품 있음: {summary['occupied']}칸\n"
            f"비어 있음: {summary['empty']}칸")
        self.cell_list.clear()
        for c in summary["cells"]:
            mark = "있음 O" if c["occupied"] else "없음 X"
            self.cell_list.addItem(
                f"[{c['row']},{c['col']}]  {mark}  ({c['score']:.2f})")


class CameraTab(QtWidgets.QWidget):
    def __init__(self, core: InspectorCore):
        super().__init__()
        self.core = core
        self.cap = None
        self.timer = QtCore.QTimer(self)
        self.timer.timeout.connect(self.update_frame)

        layout = QtWidgets.QVBoxLayout(self)
        self.view = QtWidgets.QLabel("카메라를 시작하세요")
        self.view.setAlignment(QtCore.Qt.AlignCenter)
        self.view.setMinimumSize(640, 480)
        self.view.setStyleSheet("background:#222;color:#aaa;")
        layout.addWidget(self.view, 1)

        ctrl = QtWidgets.QHBoxLayout()
        self.cam_index = QtWidgets.QSpinBox()
        self.cam_index.setRange(0, 8)
        ctrl.addWidget(QtWidgets.QLabel("카메라 번호"))
        ctrl.addWidget(self.cam_index)

        self.start_btn = QtWidgets.QPushButton("시작")
        self.start_btn.clicked.connect(self.toggle)
        ctrl.addWidget(self.start_btn)

        self.summary = QtWidgets.QLabel("-")
        ctrl.addWidget(self.summary, 1)
        layout.addLayout(ctrl)

    def toggle(self):
        if self.cap is None:
            self.cap = cv2.VideoCapture(self.cam_index.value())
            if not self.cap.isOpened():
                QtWidgets.QMessageBox.warning(self, "오류", "카메라를 열 수 없습니다.")
                self.cap = None
                return
            self.timer.start(60)  # 약 16 fps
            self.start_btn.setText("정지")
        else:
            self.stop()

    def stop(self):
        self.timer.stop()
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        self.start_btn.setText("시작")

    def update_frame(self):
        if self.cap is None:
            return
        ok, frame = self.cap.read()
        if not ok:
            return
        overlay, summary = self.core.process(frame)
        self.view.setPixmap(cv_to_qpixmap(overlay).scaled(
            self.view.size(), QtCore.Qt.KeepAspectRatio,
            QtCore.Qt.SmoothTransformation))
        self.summary.setText(
            f"있음 {summary['occupied']} / 비어있음 {summary['empty']} "
            f"(총 {summary['total_cells']})")

    def closeEvent(self, event):
        self.stop()
        super().closeEvent(event)


class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("박스 제품 유무 검사기 (iBox Inspector)")
        self.core = InspectorCore()

        central = QtWidgets.QWidget()
        v = QtWidgets.QVBoxLayout(central)

        # conf 슬라이더
        top = QtWidgets.QHBoxLayout()
        top.addWidget(QtWidgets.QLabel("검출 임계값"))
        self.slider = QtWidgets.QSlider(QtCore.Qt.Horizontal)
        self.slider.setRange(5, 95)
        self.slider.setValue(int(self.core.grid.conf_threshold * 100))
        self.conf_label = QtWidgets.QLabel(f"{self.core.grid.conf_threshold:.2f}")
        self.slider.valueChanged.connect(self.on_conf)
        top.addWidget(self.slider)
        top.addWidget(self.conf_label)
        v.addLayout(top)

        tabs = QtWidgets.QTabWidget()
        self.camera_tab = CameraTab(self.core)
        tabs.addTab(ImageTab(self.core), "이미지 검사")
        tabs.addTab(self.camera_tab, "실시간 카메라")
        v.addWidget(tabs)

        self.setCentralWidget(central)
        self.resize(1000, 700)

    def on_conf(self, value):
        conf = value / 100.0
        self.conf_label.setText(f"{conf:.2f}")
        self.core.set_conf(conf)

    def closeEvent(self, event):
        self.camera_tab.stop()
        super().closeEvent(event)


def main():
    app = QtWidgets.QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
