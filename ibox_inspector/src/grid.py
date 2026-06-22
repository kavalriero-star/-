"""격자(칸) 정의 로드, 검출 박스 -> 칸 매핑, 칸별 제품 유무 판정.

박스가 카메라에 기울어져 보일 수 있으므로 박스 안쪽 4개 모서리(quad)를 기준으로
rows x cols 칸을 원근 보정하여 분할한다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import yaml

# 시각화 색상 (BGR)
COLOR_OCCUPIED = (0, 200, 0)     # 녹색 = 제품 있음
COLOR_EMPTY = (0, 0, 230)        # 빨강 = 비어 있음
COLOR_LINE = (255, 200, 0)       # 격자선


@dataclass
class CellResult:
    row: int
    col: int
    occupied: bool
    conf: float
    polygon: np.ndarray  # shape (4, 2), 원본 이미지 픽셀 좌표


@dataclass
class Grid:
    rows: int
    cols: int
    corners: np.ndarray            # shape (4, 2): tl, tr, br, bl
    conf_threshold: float = 0.40
    fallback_enabled: bool = True
    # 파란 박스 색 정의 (HSV). 이 범위에 드는 픽셀을 "빈 박스 바닥/벽"으로 간주
    fallback_blue_hue: Tuple[int, int] = (95, 130)
    fallback_blue_sat_min: int = 120
    # 칸 내부 '파란색이 아닌(=제품)' 픽셀 비율이 이 값 이상이면 "있음"으로 판정
    fallback_object_ratio: float = 0.20

    # 내부: 정규화 좌표([0,1]x[0,1]) -> 이미지 픽셀 변환행렬과 그 역행렬
    _H: np.ndarray = field(default=None, repr=False)
    _H_inv: np.ndarray = field(default=None, repr=False)

    def __post_init__(self):
        import cv2
        src = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
        dst = self.corners.astype(np.float32)
        self._H = cv2.getPerspectiveTransform(src, dst)
        self._H_inv = cv2.getPerspectiveTransform(dst, src)

    # ---- 좌표 변환 ----
    def norm_to_pixel(self, u: float, v: float) -> Tuple[float, float]:
        """정규화 좌표(u,v) in [0,1] -> 이미지 픽셀."""
        p = self._H @ np.array([u, v, 1.0])
        return float(p[0] / p[2]), float(p[1] / p[2])

    def pixel_to_norm(self, x: float, y: float) -> Tuple[float, float]:
        """이미지 픽셀 -> 정규화 좌표(u,v)."""
        p = self._H_inv @ np.array([x, y, 1.0])
        return float(p[0] / p[2]), float(p[1] / p[2])

    def cell_polygon(self, row: int, col: int) -> np.ndarray:
        """(row, col) 칸의 4꼭짓점(이미지 픽셀)."""
        u0, u1 = col / self.cols, (col + 1) / self.cols
        v0, v1 = row / self.rows, (row + 1) / self.rows
        pts = [self.norm_to_pixel(u, v) for u, v in
               [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]]
        return np.array(pts, dtype=np.float32)

    def point_to_cell(self, x: float, y: float) -> Optional[Tuple[int, int]]:
        """이미지 픽셀 점이 속한 (row, col). 박스 밖이면 None."""
        u, v = self.pixel_to_norm(x, y)
        if not (0.0 <= u <= 1.0 and 0.0 <= v <= 1.0):
            return None
        col = min(self.cols - 1, max(0, int(u * self.cols)))
        row = min(self.rows - 1, max(0, int(v * self.rows)))
        return row, col

    # ---- 판정 ----
    def evaluate(self, boxes: List, image: Optional[np.ndarray] = None
                 ) -> List[CellResult]:
        """검출 박스 리스트로 칸별 유무 판정.

        boxes: detector.Box 리스트 (x1,y1,x2,y2,conf,cls). 비어 있고 fallback이
        켜져 있으면 이미지 기반 어두운 픽셀 비율로 판정한다.
        """
        # 칸별 최고 신뢰도 집계
        best_conf: Dict[Tuple[int, int], float] = {}
        for b in boxes:
            cx = (b.x1 + b.x2) / 2.0
            cy = (b.y1 + b.y2) / 2.0
            cell = self.point_to_cell(cx, cy)
            if cell is None:
                continue
            if b.conf >= best_conf.get(cell, 0.0):
                best_conf[cell] = b.conf

        use_fallback = (len(boxes) == 0 and self.fallback_enabled
                        and image is not None)

        results: List[CellResult] = []
        for row in range(self.rows):
            for col in range(self.cols):
                poly = self.cell_polygon(row, col)
                conf = best_conf.get((row, col), 0.0)
                if use_fallback:
                    ratio = self._object_ratio(image, poly)
                    occupied = ratio >= self.fallback_object_ratio
                    conf = ratio
                else:
                    occupied = conf >= self.conf_threshold
                results.append(CellResult(row, col, occupied, conf, poly))
        return results

    def _object_ratio(self, image: np.ndarray, poly: np.ndarray) -> float:
        """칸 내부에서 '파란색이 아닌(=제품)' 픽셀 비율.

        빈 칸은 채도 높은 파란 박스 색으로 거의 가득 차므로, 파란 범위(Hue/채도)에
        들지 않는 픽셀의 비율을 제품 점유 신호로 사용한다. 제품 색(검정/녹색/분홍
        라벨 등)에 무관하게 동작한다.
        """
        import cv2
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        cv2.fillPoly(mask, [poly.astype(np.int32)], 255)
        area = int((mask > 0).sum())
        if area == 0:
            return 0.0
        h = hsv[:, :, 0]
        s = hsv[:, :, 1]
        lo, hi = self.fallback_blue_hue
        is_blue = (h >= lo) & (h <= hi) & (s > self.fallback_blue_sat_min)
        non_blue = (~is_blue) & (mask > 0)
        return int(non_blue.sum()) / area


def load_grid(path: str) -> Grid:
    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    c = cfg["corners"]
    corners = np.array([c["tl"], c["tr"], c["br"], c["bl"]], dtype=np.float32)
    det = cfg.get("detection", {})
    fb = cfg.get("fallback", {})
    return Grid(
        rows=int(cfg["rows"]),
        cols=int(cfg["cols"]),
        corners=corners,
        conf_threshold=float(det.get("conf_threshold", 0.40)),
        fallback_enabled=bool(fb.get("enabled", True)),
        fallback_blue_hue=tuple(fb.get("blue_hue", [95, 130])),
        fallback_blue_sat_min=int(fb.get("blue_sat_min", 120)),
        fallback_object_ratio=float(fb.get("object_ratio_threshold", 0.20)),
    )


def draw_results(image: np.ndarray, results: List[CellResult],
                 used_fallback: bool = False) -> np.ndarray:
    """판정 결과를 이미지에 오버레이로 그려 반환."""
    import cv2
    out = image.copy()
    overlay = image.copy()
    for r in results:
        poly = r.polygon.astype(np.int32)
        color = COLOR_OCCUPIED if r.occupied else COLOR_EMPTY
        cv2.fillPoly(overlay, [poly], color)
        cv2.polylines(out, [poly], True, COLOR_LINE, 2)
    cv2.addWeighted(overlay, 0.25, out, 0.75, 0, out)

    for r in results:
        poly = r.polygon.astype(np.int32)
        cx = int(poly[:, 0].mean())
        cy = int(poly[:, 1].mean())
        label = "O" if r.occupied else "X"
        color = COLOR_OCCUPIED if r.occupied else COLOR_EMPTY
        cv2.putText(out, label, (cx - 15, cy + 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.5, color, 4)
    return out


def results_to_dict(results: List[CellResult]) -> dict:
    """JSON 직렬화용 dict 로 변환."""
    occupied = sum(1 for r in results if r.occupied)
    return {
        "total_cells": len(results),
        "occupied": occupied,
        "empty": len(results) - occupied,
        "cells": [
            {
                "row": r.row,
                "col": r.col,
                "occupied": bool(r.occupied),
                "score": round(float(r.conf), 4),
            }
            for r in results
        ],
    }
