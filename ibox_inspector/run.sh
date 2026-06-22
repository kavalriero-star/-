#!/usr/bin/env bash
# ===== iBox Inspector 실행기 (macOS / Linux) =====
# Python 3.9+ 가 설치되어 있어야 합니다.
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[오류] Python3 가 설치되어 있지 않습니다. https://www.python.org/downloads/ 에서 설치하세요."
    exit 1
fi

if [ ! -d .venv ]; then
    echo "[1/3] 가상환경 생성 중..."
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "[2/3] 필요한 패키지 설치 중... (처음 한 번만 시간이 걸립니다)"
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "[3/3] 프로그램 실행"
python -m src.gui
