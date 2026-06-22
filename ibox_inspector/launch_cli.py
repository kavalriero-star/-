"""CLI 실행파일 진입점 (PyInstaller 용)."""
import sys

from src.bootstrap import configure_stdio

configure_stdio()

from src.inspect_image import main

if __name__ == "__main__":
    sys.exit(main())
