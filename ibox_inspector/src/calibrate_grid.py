"""격자 보정 도구.

참조 이미지에서 박스 안쪽 4개 모서리를 마우스로 클릭하여 config/grid.yaml 을
생성한다. 클릭 순서: 좌상 -> 우상 -> 우하 -> 좌하.

사용 예:
    python -m src.calibrate_grid --image data/samples/box.jpg --rows 4 --cols 4
"""
from __future__ import annotations

import argparse

import cv2
import yaml

CLICK_LABELS = ["좌상(TL)", "우상(TR)", "우하(BR)", "좌하(BL)"]


def main(argv=None):
    parser = argparse.ArgumentParser(description="격자 보정 (4모서리 클릭)")
    parser.add_argument("--image", required=True)
    parser.add_argument("--rows", type=int, default=4)
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--out", default="config/grid.yaml")
    args = parser.parse_args(argv)

    image = cv2.imread(args.image)
    if image is None:
        print(f"[오류] 이미지를 열 수 없습니다: {args.image}")
        return 1

    # 화면에 맞게 축소 표시 (클릭 좌표는 원본 스케일로 복원)
    h, w = image.shape[:2]
    scale = min(1.0, 1280.0 / max(h, w))
    disp = cv2.resize(image, (int(w * scale), int(h * scale)))

    points = []

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 4:
            points.append((x / scale, y / scale))

    win = "Calibrate (click 4 corners: TL, TR, BR, BL) - press R reset, Q quit"
    cv2.namedWindow(win)
    cv2.setMouseCallback(win, on_mouse)

    while True:
        view = disp.copy()
        for i, (px, py) in enumerate(points):
            cv2.circle(view, (int(px * scale), int(py * scale)), 6, (0, 0, 255), -1)
            cv2.putText(view, CLICK_LABELS[i], (int(px * scale) + 8, int(py * scale)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        if len(points) >= 2:
            pts = [(int(px * scale), int(py * scale)) for px, py in points]
            cv2.polylines(view, [__import__("numpy").array(pts)], len(points) == 4,
                          (255, 200, 0), 2)
        hint = (f"클릭: {len(points)}/4  다음 -> "
                f"{CLICK_LABELS[len(points)] if len(points) < 4 else '완료 (S=저장)'}")
        cv2.putText(view, hint, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (0, 255, 0), 2)
        cv2.imshow(win, view)

        key = cv2.waitKey(20) & 0xFF
        if key in (ord("q"), 27):
            cv2.destroyAllWindows()
            return 0
        if key == ord("r"):
            points.clear()
        if key == ord("s") and len(points) == 4:
            break

    cv2.destroyAllWindows()

    cfg = {
        "mode": "perspective",
        "rows": args.rows,
        "cols": args.cols,
        "corners": {
            "tl": [round(points[0][0], 1), round(points[0][1], 1)],
            "tr": [round(points[1][0], 1), round(points[1][1], 1)],
            "br": [round(points[2][0], 1), round(points[2][1], 1)],
            "bl": [round(points[3][0], 1), round(points[3][1], 1)],
        },
        "detection": {"conf_threshold": 0.40},
        "fallback": {"enabled": True, "dark_value": 90,
                     "dark_ratio_threshold": 0.12},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)
    print(f"저장 완료: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
