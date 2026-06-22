"""격자/판정 로직 회귀 테스트.

실행: (ibox_inspector 폴더에서)
    python -m tests.test_grid        # 직접 실행
    pytest                           # pytest 가 있으면
"""
from __future__ import annotations

import numpy as np

from src.grid import load_grid, results_to_dict
from src.imaging import load_image
from src.paths import default_grid_path, sample_image_path


def test_normalized_grid_scales_with_resolution():
    """정규화 격자가 해상도에 맞춰 절대 좌표로 변환되는지."""
    grid = load_grid(default_grid_path())
    assert grid.normalized is True
    grid.set_image_size(1000, 2000)
    # tl 비율 (0.147, 0.218) -> 픽셀 (147, 436)
    x, y = grid.norm_to_pixel(0.0, 0.0)
    assert abs(x - 0.147 * 1000) < 1.0
    assert abs(y - 0.218 * 2000) < 1.0


def test_point_to_cell_inside_and_outside():
    grid = load_grid(default_grid_path())
    grid.set_image_size(3000, 4000)
    # (0,0) 칸 중심
    cx, cy = grid.norm_to_pixel(0.125, 0.125)
    assert grid.point_to_cell(cx, cy) == (0, 0)
    # (3,3) 칸 중심
    cx, cy = grid.norm_to_pixel(0.875, 0.875)
    assert grid.point_to_cell(cx, cy) == (3, 3)
    # 박스 밖
    assert grid.point_to_cell(-50, -50) is None


def test_sample_fallback_detection():
    """샘플 이미지 폴백 판정: 제품이 있는 하단 칸들이 검출되는지."""
    grid = load_grid(default_grid_path())
    image = load_image(sample_image_path())
    assert image is not None
    results = grid.evaluate([], image=image)   # boxes 없음 -> 폴백
    summary = results_to_dict(results)
    assert summary["total_cells"] == 16
    # 제품이 일부 칸에서 검출되고, 전부/전무가 아니어야 한다
    assert 4 <= summary["occupied"] <= 12
    # 빈 상단 행(0행)은 모두 비어 있어야 한다
    top_row = [c for c in summary["cells"] if c["row"] == 0]
    assert all(not c["occupied"] for c in top_row)


def _run_all():
    fns = [v for k, v in globals().items() if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"  PASS  {fn.__name__}")
    print(f"\n{len(fns)}개 테스트 모두 통과")


if __name__ == "__main__":
    _run_all()
