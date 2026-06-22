"""이미지 로딩 유틸 (EXIF 회전 보정 포함).

cv2.imread 는 EXIF 방향 정보를 무시하므로, 휴대폰 사진이 옆으로 눕거나 뒤집혀
읽힐 수 있다. Pillow 가 있으면 EXIF 방향을 적용해서 올바른 방향으로 읽는다.
없으면 cv2.imread 로 폴백한다.
"""
from __future__ import annotations

from typing import Optional

import numpy as np


def load_image(path: str) -> Optional[np.ndarray]:
    """경로의 이미지를 BGR numpy 배열로 읽는다. EXIF 회전을 보정한다."""
    try:
        from PIL import Image, ImageOps
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im)   # EXIF 방향 적용
            im = im.convert("RGB")
            rgb = np.array(im)
        bgr = rgb[:, :, ::-1]                   # RGB -> BGR
        return np.ascontiguousarray(bgr)
    except Exception:
        import cv2
        return cv2.imread(path)
