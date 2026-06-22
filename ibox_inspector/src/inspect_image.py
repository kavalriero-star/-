"""CLI: 이미지 파일을 검사하여 칸별 제품 유무를 출력한다.

사용 예:
    python -m src.inspect_image --image data/samples/box.jpg
    python -m src.inspect_image --image box.jpg --no-yolo   # YOLO 없이 폴백 판정
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import cv2

from .bootstrap import configure_stdio
from .grid import draw_results, load_grid, results_to_dict
from .imaging import load_image
from .paths import default_grid_path, sample_image_path


def main(argv=None):
    configure_stdio()
    parser = argparse.ArgumentParser(description="박스 칸별 제품 유무 검사")
    parser.add_argument("--image", default=None,
                        help="검사할 이미지 경로 (생략 시 샘플 이미지 사용)")
    parser.add_argument("--grid", default=None,
                        help="격자 정의 파일 (기본: config/grid.yaml)")
    parser.add_argument("--model", default=None,
                        help="YOLO 가중치 경로 (기본: models/best.pt 또는 yolov8n.pt)")
    parser.add_argument("--conf", type=float, default=None,
                        help="검출 신뢰도 임계값 (기본: grid.yaml 값)")
    parser.add_argument("--no-yolo", action="store_true",
                        help="YOLO 미사용, 어두운 픽셀 비율 폴백만 사용")
    parser.add_argument("--out", default=None,
                        help="결과 오버레이 이미지 저장 경로 (기본: <image>.result.jpg)")
    args = parser.parse_args(argv)

    image_path = args.image or sample_image_path()
    image = load_image(image_path)
    if image is None:
        print(f"[오류] 이미지를 열 수 없습니다: {image_path}", file=sys.stderr)
        return 1

    grid = load_grid(args.grid or default_grid_path())
    if args.conf is not None:
        grid.conf_threshold = args.conf

    boxes = []
    used_fallback = True
    if not args.no_yolo:
        try:
            from .detector import Detector
            det = Detector(model_path=args.model, conf=grid.conf_threshold)
            boxes = det.detect(image)
            used_fallback = len(boxes) == 0
            if not det.is_custom:
                print("[안내] 커스텀 학습 모델(models/best.pt)이 없어 사전학습 모델을 "
                      "사용했습니다. 정확도가 낮을 수 있어 폴백 판정을 함께 적용합니다.")
        except Exception as e:  # ultralytics 미설치 등
            print(f"[안내] YOLO 검출을 사용할 수 없어 폴백 판정을 사용합니다: {e}")
            boxes = []

    results = grid.evaluate(boxes, image=image)

    # 콘솔 출력
    summary = results_to_dict(results)
    print(f"\n총 {summary['total_cells']}칸 중 "
          f"제품 있음 {summary['occupied']}칸 / 비어 있음 {summary['empty']}칸 "
          f"{'(폴백 판정)' if used_fallback else '(YOLO 판정)'}")
    print("-" * 40)
    for r in results:
        mark = "있음 O" if r.occupied else "없음 X"
        print(f"  [{r.row},{r.col}]  {mark}   (score={r.conf:.3f})")

    # 결과 이미지/JSON 저장
    out_path = args.out or (os.path.splitext(image_path)[0] + ".result.jpg")
    overlay = draw_results(image, results, used_fallback)
    cv2.imwrite(out_path, overlay)
    json_path = os.path.splitext(out_path)[0] + ".json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("-" * 40)
    print(f"결과 이미지: {out_path}")
    print(f"결과 JSON : {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
