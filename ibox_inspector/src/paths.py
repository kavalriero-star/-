"""리소스 경로 처리.

개발 실행(python -m ...)과 PyInstaller 실행파일(frozen) 양쪽에서 config/샘플
파일을 찾을 수 있게 한다. 실행파일 옆에 config/grid.yaml 이 있으면 그것을 우선
사용하므로, 사용자가 재빌드 없이 격자 설정을 수정할 수 있다.
"""
from __future__ import annotations

import os
import sys


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def bundle_dir() -> str:
    """번들(읽기전용) 리소스 기준 디렉터리."""
    if is_frozen():
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    # src/ 의 부모 = ibox_inspector/
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def external_dir() -> str:
    """사용자가 수정 가능한 외부 파일 기준 디렉터리(실행파일/작업 폴더 위치)."""
    if is_frozen():
        return os.path.dirname(sys.executable)
    return os.getcwd()


def resource_path(rel: str) -> str:
    return os.path.join(bundle_dir(), rel)


def find_resource(rel: str) -> str:
    """외부(실행파일 옆)에 있으면 우선, 없으면 번들 리소스를 사용."""
    ext = os.path.join(external_dir(), rel)
    if os.path.exists(ext):
        return ext
    return resource_path(rel)


def default_grid_path() -> str:
    return find_resource(os.path.join("config", "grid.yaml"))


def sample_image_path() -> str:
    return find_resource(os.path.join("data", "samples", "box.jpg"))
