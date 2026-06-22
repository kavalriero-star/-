"""커스텀 YOLOv8 학습 스크립트 (단일 클래스: product).

라벨링된 데이터셋(data/dataset/)을 준비한 뒤 실행하면 학습 후 가장 좋은
가중치를 models/best.pt 로 복사한다.

사용 예:
    python -m src.train --epochs 100 --imgsz 640
"""
from __future__ import annotations

import argparse
import os
import shutil


def main(argv=None):
    parser = argparse.ArgumentParser(description="커스텀 YOLOv8 학습")
    parser.add_argument("--data", default="dataset.yaml")
    parser.add_argument("--base", default="yolov8n.pt",
                        help="시작 가중치 (yolov8n/s/m...)")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--name", default="ibox_product")
    args = parser.parse_args(argv)

    from ultralytics import YOLO

    model = YOLO(args.base)
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        name=args.name,
    )

    # 학습 결과의 best.pt 를 models/best.pt 로 복사
    save_dir = getattr(results, "save_dir", None) or os.path.join(
        "runs", "detect", args.name)
    best = os.path.join(str(save_dir), "weights", "best.pt")
    os.makedirs("models", exist_ok=True)
    if os.path.exists(best):
        shutil.copy(best, os.path.join("models", "best.pt"))
        print(f"학습 완료. models/best.pt 저장됨 (원본: {best})")
    else:
        print(f"[경고] best.pt 를 찾지 못했습니다: {best}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
