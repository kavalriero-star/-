@echo off
REM ===== 실행파일(.exe) 빌드 (Windows) =====
REM Python 3.9+ 필요. 빌드 후 dist\iBoxInspector.exe 가 생성됩니다.
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo [오류] Python 이 필요합니다. https://www.python.org/downloads/
    pause
    exit /b 1
)

if not exist .venv-build ( python -m venv .venv-build )
call .venv-build\Scripts\activate.bat

echo [1/2] 빌드 의존성 설치...
python -m pip install --upgrade pip
pip install -r requirements-build.txt

echo [2/2] PyInstaller 빌드...
pyinstaller --clean -y ibox_inspector.spec

echo.
echo 완료! dist 폴더를 확인하세요:
echo   dist\iBoxInspector.exe  (GUI)
echo   dist\ibox-cli.exe       (명령줄)
pause
