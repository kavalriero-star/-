@echo off
REM ===== iBox Inspector 실행기 (Windows) =====
REM Python 3.9+ 가 설치되어 있어야 합니다. (https://www.python.org/downloads/)
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo [오류] Python 이 설치되어 있지 않습니다.
    echo https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요.
    echo 설치 시 "Add Python to PATH" 체크를 꼭 켜주세요.
    pause
    exit /b 1
)

if not exist .venv (
    echo [1/3] 가상환경 생성 중...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo [2/3] 필요한 패키지 설치 중... (처음 한 번만 시간이 걸립니다)
python -m pip install --upgrade pip
pip install -r requirements.txt

echo [3/3] 프로그램 실행
python -m src.gui

pause
