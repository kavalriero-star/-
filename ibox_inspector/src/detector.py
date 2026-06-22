"""YOLOv8 검출기 래퍼.

학습된 가중치(models/best.pt)가 있으면 사용하고, 없으면 사전학습 yolov8n.pt 로
폴백한다(데모/파이프라인 점검용). 커스텀 미학습 상태에서는 검출 정확도가 낮을 수
있으므로, 이 경우 grid.py 의 fallback(어두운 픽셀 비율) 판정을 사용하는 것을 권장.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

DEFAULT_CUSTOM_MODEL = os.path.join("models", "best.pt")
FALLBACK_PRETRAINED = "yolov8n.pt"


@dataclass
class Box:
    x1: float
    y1: float
    x2: float
    y2: float
    conf: float
    cls: int


class Detector:
    def __init__(self, model_path: Optional[str] = None, conf: float = 0.4):
        from ultralytics import YOLO

        self.conf = conf
        if model_path is None:
            model_path = (DEFAULT_CUSTOM_MODEL
                          if os.path.exists(DEFAULT_CUSTOM_MODEL)
                          else FALLBACK_PRETRAINED)
        self.model_path = model_path
        self.is_custom = os.path.basename(model_path) != FALLBACK_PRETRAINED
        self.model = YOLO(model_path)

    def detect(self, frame: np.ndarray) -> List[Box]:
        """BGR 이미지(numpy)에서 객체 검출. Box 리스트 반환."""
        results = self.model.predict(frame, conf=self.conf, verbose=False)
        boxes: List[Box] = []
        for res in results:
            if res.boxes is None:
                continue
            for b in res.boxes:
                xyxy = b.xyxy[0].tolist()
                boxes.append(Box(
                    x1=xyxy[0], y1=xyxy[1], x2=xyxy[2], y2=xyxy[3],
                    conf=float(b.conf[0]),
                    cls=int(b.cls[0]),
                ))
        return boxes
