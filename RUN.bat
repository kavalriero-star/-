@echo off
chcp 65001 > nul
title Pixel Office AI Launcher
echo.
echo ===================================
echo   Pixel Office AI 시작 중...
echo ===================================
echo.

REM 스크립트가 있는 폴더로 이동
cd /d "%~dp0"

REM 1순위: 한글 이름 파일
if exist "오피스AI_여기를_더블클릭.html" (
    echo 파일 열기: 오피스AI_여기를_더블클릭.html
    start "" "오피스AI_여기를_더블클릭.html"
    timeout /t 2 > nul
    exit /b 0
)

REM 2순위: 영문 이름 파일
if exist "pixel-office-standalone.html" (
    echo 파일 열기: pixel-office-standalone.html
    start "" "pixel-office-standalone.html"
    timeout /t 2 > nul
    exit /b 0
)

REM 어느 것도 없으면 안내
echo [에러] HTML 파일을 찾을 수 없습니다.
echo.
echo 다음 명령으로 최신 파일을 받아주세요:
echo   git pull origin claude/pixel-art-ai-agent-JjL5s
echo.
pause
