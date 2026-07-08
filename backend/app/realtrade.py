"""Builds the downloadable 'real-trade executable' bundle.

SCOPE: this is a DEMO MOCKUP. The generated bot.py shows an API-key input
screen and stops. It never connects to any exchange, never places an order,
and never stores or transmits the entered keys. See section 3 of the v3 spec.
"""
from __future__ import annotations

import io
import json
import zipfile

from .engine import Macro, human_summary

# bot.py is static (settings live in the bundled macro.json), so it is embedded
# verbatim — no string interpolation into the code body.
_BOT_PY = r'''"""
[데모용 실행 파일] 코인 매크로 실거래 봇 - 껍데기(mockup)

⚠️ 중요:
  * 이 파일은 데모용입니다. 실제 거래를 실행하지 않습니다.
  * 거래소에 연결하지 않고, 주문을 넣지 않습니다.
  * 입력한 API Key / Secret 은 어디에도 저장되거나 전송되지 않습니다
    (화면에서 입력만 받고 그대로 버립니다).
  * 실제 실거래 기능은 이 데모 버전에서 비활성화되어 있습니다.

실행: python bot.py
동봉된 macro.json 에 이 봇이 따를 매크로 설정이 들어 있습니다.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load_macro():
    path = os.path.join(HERE, "macro.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


DEMO_MESSAGE = "[데모] 인증 정보가 입력되었습니다. (실거래 연결은 이 데모 버전에서 비활성화)"


def run_gui(macro):
    """Simple tkinter key-input screen. Falls back to console on failure."""
    import tkinter as tk

    root = tk.Tk()
    root.title("코인 매크로 실거래 봇 (데모)")
    root.geometry("460x300")

    summary = macro.get("human_summary", "(매크로 설정)")
    tk.Label(root, text="실거래 봇 · 데모 버전", font=("맑은 고딕", 14, "bold")).pack(pady=(16, 4))
    tk.Label(root, text=summary, wraplength=420, fg="#555").pack(pady=(0, 8))
    tk.Label(root, text="⚠ 실제 거래는 실행되지 않습니다 (키는 저장/전송되지 않음)",
             fg="#b45309").pack(pady=(0, 10))

    frm = tk.Frame(root)
    frm.pack(pady=4)
    tk.Label(frm, text="API Key").grid(row=0, column=0, sticky="e", padx=6, pady=4)
    key_e = tk.Entry(frm, width=34)
    key_e.grid(row=0, column=1, pady=4)
    tk.Label(frm, text="API Secret").grid(row=1, column=0, sticky="e", padx=6, pady=4)
    sec_e = tk.Entry(frm, width=34, show="*")
    sec_e.grid(row=1, column=1, pady=4)

    result = tk.Label(root, text="", fg="#16a34a", wraplength=420)
    result.pack(pady=8)

    def on_auth():
        # NOTE: keys are intentionally NOT stored, logged, or sent anywhere.
        _ = key_e.get()
        _ = sec_e.get()
        result.config(text=DEMO_MESSAGE)

    tk.Button(root, text="인증", width=12, command=on_auth).pack(pady=4)
    root.mainloop()


def run_console(macro):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print("=== 코인 매크로 실거래 봇 (데모) ===")
    print("매크로:", macro.get("human_summary", "(설정)"))
    print("⚠ 실제 거래는 실행되지 않습니다. 키는 저장/전송되지 않습니다.\n")
    # keys are read then discarded; nothing is persisted or transmitted.
    _ = input("API Key: ")
    _ = input("API Secret: ")
    print("\n" + DEMO_MESSAGE)


def main():
    # Make Korean / symbol output safe on legacy Windows consoles (cp949).
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    macro = load_macro()
    try:
        run_gui(macro)
    except Exception:
        # No display / tkinter missing -> console fallback.
        run_console(macro)


if __name__ == "__main__":
    main()
'''

# requirements.txt — the demo bot.py uses only the Python standard library
# (json/os/sys/tkinter), so there is nothing external to install. The file is
# still shipped so run.bat's `pip install -r requirements.txt` is a no-op that
# succeeds instead of failing on a missing file.
_REQUIREMENTS_TXT = """# 이 데모 bot.py 는 파이썬 표준 라이브러리(json, os, sys, tkinter)만 사용합니다.
# 별도로 설치할 외부 패키지가 없습니다.
"""

# run.bat — one double-click on Windows: verify Python, install deps (no-op),
# then launch the demo bot. Paths are quoted so spaces/Korean folders work, and
# `pause` keeps the window open on any error instead of flashing shut.
_RUN_BAT = """@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   코인 매크로 실거래 봇 (데모) - 원클릭 실행
echo   * 데모용입니다. 실제 거래를 실행하지 않습니다.
echo ============================================
echo.

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
  where py >nul 2>nul && set "PY=py"
)
if not defined PY (
  echo [오류] 파이썬을 찾을 수 없습니다.
  echo   1^) https://www.python.org/downloads/ 에서 Python 3.10 이상을 설치하세요.
  echo   2^) 설치 화면에서 "Add Python to PATH" 를 반드시 체크하세요.
  echo   3^) 설치 후 이 run.bat 을 다시 더블클릭하세요.
  echo.
  pause
  exit /b 1
)

echo [1/2] 의존성 확인/설치 중...
"%PY%" -m pip install -r "%~dp0requirements.txt" --user --quiet
if errorlevel 1 echo [경고] 의존성 설치를 건너뜁니다(표준 라이브러리만 사용).

echo [2/2] 봇 실행...
"%PY%" "%~dp0bot.py"

echo.
echo === 종료되었습니다. 창을 닫으려면 아무 키나 누르세요. ===
pause >nul
endlocal
"""

_README_TXT = """코인 매크로 실거래 봇 (데모용 실행 파일)
========================================

⚠️ 이 파일은 데모용입니다. 실제 거래를 실행하지 않습니다.

가장 쉬운 실행 (Windows, 2단계)
  ① Python 3.10+ 설치 (https://www.python.org/downloads/, "Add Python to PATH" 체크)
  ② run.bat 더블클릭  → 의존성 설치 후 봇이 실행됩니다.

포함 파일
  - run.bat        : 더블클릭 원클릭 실행(파이썬 확인 → 의존성 설치 → bot.py 실행)
  - bot.py         : 실행 파일 (키 입력 화면까지만 동작하는 껍데기)
  - requirements.txt: 최소 의존성(이 데모는 표준 라이브러리만 사용 → 비어 있음)
  - macro.json     : 이 봇이 따를 매크로 설정 (백테스트/페이퍼에서 만든 것과 동일)
  - README-run.txt : 이 안내 파일

매크로 요약
  {summary}

수동 실행 (run.bat 대신)
  1) 이 폴더에서:  python bot.py
  2) API Key / Secret 입력 화면이 뜹니다 (tkinter 창, 없으면 콘솔).
  3) 아무 값이나 넣고 "인증"을 누르면 데모 메시지가 출력되고 종료됩니다.

무엇을 하지 "않는지" (중요)
  - 거래소에 연결하지 않습니다.
  - 주문(매수/매도)을 넣지 않습니다.
  - 입력한 API Key/Secret 을 저장하거나 서버로 전송하지 않습니다.
    (화면에서 입력만 받고 그대로 버립니다.)

실거래 관련 고지
  실거래는 사용자 PC에서 사용자 본인의 API 키로 실행됩니다.
  본 도구는 투자 조언이 아니며, 실거래로 인한 손익 책임은 사용자에게 있습니다.
"""


def build_bundle(macro: Macro) -> bytes:
    """Return a zip (bytes): run.bat, bot.py, requirements.txt, macro.json, README."""
    summary = human_summary(macro)
    macro_payload = macro.model_dump(mode="json")
    macro_payload["human_summary"] = summary

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("run.bat", _RUN_BAT)
        zf.writestr("bot.py", _BOT_PY)
        zf.writestr("requirements.txt", _REQUIREMENTS_TXT)
        zf.writestr("macro.json", json.dumps(macro_payload, ensure_ascii=False, indent=2))
        zf.writestr("README-run.txt", _README_TXT.format(summary=summary))
    return buf.getvalue()
