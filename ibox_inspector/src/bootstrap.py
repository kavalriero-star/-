"""표준 입출력 인코딩 정리.

Windows 콘솔 기본 인코딩(cp1252 등)은 한글을 출력하지 못해 print() 시
UnicodeEncodeError 가 발생한다. 또한 PyInstaller windowed(.exe) 모드에서는
sys.stdout/stderr 가 None 이라 print() 가 실패할 수 있다. 이 둘을 모두 안전하게
처리한다. 프로그램 시작 시 한 번 호출하면 된다.
"""
from __future__ import annotations

import io
import sys


def configure_stdio() -> None:
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None:
            # 콘솔이 없는 windowed 실행파일: print 를 흡수해 크래시 방지
            setattr(sys, name, io.StringIO())
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            # reconfigure 미지원 환경은 그대로 둔다(치명적이지 않음)
            pass
