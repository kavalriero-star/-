#!/usr/bin/env bash
# ===== 실행파일 빌드 (macOS / Linux) =====
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[오류] Python3 가 필요합니다."
    exit 1
fi

[ -d .venv-build ] || python3 -m venv .venv-build
source .venv-build/bin/activate

echo "[1/2] 빌드 의존성 설치..."
python -m pip install --upgrade pip
pip install -r requirements-build.txt

echo "[2/2] PyInstaller 빌드..."
pyinstaller --clean -y ibox_inspector.spec

echo ""
echo "완료! dist 폴더 확인:"
echo "  dist/iBoxInspector  (GUI)"
echo "  dist/ibox-cli       (명령줄)"
