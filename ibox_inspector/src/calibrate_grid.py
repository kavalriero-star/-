"""격자 보정 도구.

참조 이미지(또는 카메라 캡처)에서 박스 안쪽 4개 모서리를 마우스로 클릭하여
config/grid.yaml 을 생성한다. 좌표는 0~1 비율(정규화)로 저장하므로 해상도가 달라도
적용된다. 클릭 순서: 좌상 -> 우상 -> 우하 -> 좌하.

사용 예:
    python -m src.calibrate_grid --image data/samples/box.jpg --rows 4 --cols 4
    python -m src.calibrate_grid --camera 0          # 웹캠 한 프레임으로 보정
"""
from __future__ import annotations

import argparse

import cv2
import numpy as np
import yaml

from .imaging import load_image
from .paths import default_grid_path, sample_image_path

CLICK_LABELS = ["좌상(TL)", "우상(TR)", "우하(BR)", "좌하(BL)"]


def _grab_camera_frame(index: int):
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        return None
    frame = None
    for _ in range(10):          # 노출 안정화를 위해 몇 프레임 버림
        ok, f = cap.read()
        if ok:
            frame = f
    cap.release()
    return frame


def calibrate(image, rows=4, cols=4, out_path=None):
    """이미지에서 4모서리를 클릭받아 grid.yaml 저장. 저장하면 True 반환."""
    out_path = out_path or default_grid_path()
    h, w = image.shape[:2]
    scale = min(1.0, 1280.0 / max(h, w))
    disp = cv2.resize(image, (int(w * scale), int(h * scale)))

    points = []

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 4:
            points.append((x / scale, y / scale))

    win = "Calibrate: click TL, TR, BR, BL  (R=reset, S=save, Q=quit)"
    cv2.namedWindow(win)
    cv2.setMouseCallback(win, on_mouse)

    saved = False
    while True:
        view = disp.copy()
        for i, (px, py) in enumerate(points):
            cv2.circle(view, (int(px * scale), int(py * scale)), 6, (0, 0, 255), -1)
            cv2.putText(view, CLICK_LABELS[i], (int(px * scale) + 8, int(py * scale)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        if len(points) >= 2:
            pts = np.array([(int(px * scale), int(py * scale)) for px, py in points])
            cv2.polylines(view, [pts], len(points) == 4, (255, 200, 0), 2)
        hint = (f"clicked {len(points)}/4  next: "
                f"{CLICK_LABELS[len(points)] if len(points) < 4 else 'DONE (press S)'}")
        cv2.putText(view, hint, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (0, 255, 0), 2)
        cv2.imshow(win, view)

        key = cv2.waitKey(20) & 0xFF
        if key in (ord("q"), 27):
            break
        if key == ord("r"):
            points.clear()
        if key == ord("s") and len(points) == 4:
            saved = True
            break

    cv2.destroyAllWindows()
    if not saved:
        return False

    def norm(p):
        return [round(p[0] / w, 4), round(p[1] / h, 4)]

    cfg = {
        "mode": "perspective",
        "normalized": True,
        "rows": rows,
        "cols": cols,
        "corners": {
            "tl": norm(points[0]),
            "tr": norm(points[1]),
            "br": norm(points[2]),
            "bl": norm(points[3]),
        },
        "detection": {"conf_threshold": 0.40},
        "fallback": {"enabled": True, "blue_hue": [95, 130],
                     "blue_sat_min": 120, "object_ratio_threshold": 0.20},
    }
    with open(out_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)
    print(f"저장 완료: {out_path}")
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description="격자 보정 (4모서리 클릭)")
    parser.add_argument("--image", default=None, help="보정에 사용할 이미지")
    parser.add_argument("--camera", type=int, default=None,
                        help="이미지 대신 사용할 카메라 번호")
    parser.add_argument("--rows", type=int, default=4)
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    if args.camera is not None:
        image = _grab_camera_frame(args.camera)
        if image is None:
            print(f"[오류] 카메라를 열 수 없습니다: {args.camera}")
            return 1
    else:
        path = args.image or sample_image_path()
        image = load_image(path)
        if image is None:
            print(f"[오류] 이미지를 열 수 없습니다: {path}")
            return 1

    ok = calibrate(image, rows=args.rows, cols=args.cols, out_path=args.out)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
