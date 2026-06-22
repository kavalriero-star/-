# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 스펙: GUI 실행파일(iBoxInspector)과 CLI 실행파일(ibox-cli)을 빌드한다.
# 빌드:  pyinstaller --clean -y ibox_inspector.spec
# 결과:  dist/iBoxInspector(.exe), dist/ibox-cli(.exe)

block_cipher = None

# 실행파일에 함께 넣을 데이터 (런타임에 config/샘플로 접근)
datas = [
    ("config/grid.yaml", "config"),
    ("data/samples/box.jpg", "data/samples"),
]

# 무거운 딥러닝 패키지는 실행파일에서 제외 (없어도 색상 기반 판정으로 동작)
excludes = [
    "ultralytics", "torch", "torchvision", "torchaudio",
    "matplotlib", "pandas", "scipy", "tensorflow",
]


def _exe(entry, name, console):
    a = Analysis(
        [entry],
        pathex=["."],
        binaries=[],
        datas=datas,
        hiddenimports=[],
        hookspath=[],
        runtime_hooks=[],
        excludes=excludes,
        cipher=block_cipher,
        noarchive=False,
    )
    pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
    exe = EXE(
        pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
        name=name,
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=console,
        disable_windowed_traceback=False,
    )
    return exe


gui_exe = _exe("launch_gui.py", "iBoxInspector", console=False)
cli_exe = _exe("launch_cli.py", "ibox-cli", console=True)
