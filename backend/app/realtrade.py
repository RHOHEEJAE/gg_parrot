"""Builds the downloadable 'real-trade' bundle.

SCOPE (v8): the bundled ``bot.py`` now really connects to the Binance **Spot
Testnet** and places **real testnet orders** (fake funds). The flow/API calls
mirror live trading so a user can later switch to mainnet themselves by flipping
one constant — the code never enables mainnet automatically. No withdraw feature,
and API keys are used in-memory only (never stored/sent/logged).
"""
from __future__ import annotations

import io
import json
import zipfile

from .engine import Macro, human_summary

# --- bot.py (verbatim; settings come from the bundled macro.json) --------
_BOT_PY = r'''"""
[TESTNET 실구동] 코인 매크로 봇 — 바이낸스 Spot Testnet

⚠️ 기본값은 테스트넷(가짜 자금)입니다. 실제 자산은 움직이지 않습니다.
  * API 키는 메모리에서만 사용하며 파일 저장·네트워크 전송·로깅하지 않습니다.
  * 출금(withdraw)/이체 기능은 없습니다. 주문(매수/매도)만 합니다.
  * 메인넷 전환은 사용자가 직접(USE_TESTNET=False). 코드가 자동 전환하지 않습니다.

실행:  python bot.py   (또는 run.bat 더블클릭)
동봉된 macro.json 의 매크로 설정(rule_type/params/risk/symbol)을 따릅니다.

참고: 이 봇은 백테스트/페이퍼 엔진의 '진입 + 익절/손절/밴드' 부분을 실거래로
옮긴 단순화 버전입니다. 지표 전략(RSI/볼린저/MA 등)은 해당 매크로의 익절/손절
목표로 근사 실행합니다. 흐름·주문 호출은 실거래와 동일합니다.
"""
from __future__ import annotations

import getpass
import json
import os
import sys
import time
from decimal import Decimal, ROUND_DOWN

# ==================================================================
#  단 하나의 전환 스위치. 메인넷(실제 자금) 전환 시 여기만 False 로.
#  README-run.txt 의 "메인넷 전환 가이드"를 반드시 먼저 읽으세요.
USE_TESTNET = True
# ==================================================================

# 안전장치 상수 (메인넷 전환 대비 코드에 항상 포함)
MAX_ORDER_USDT = float(os.environ.get("MAX_ORDER_USDT", "100"))   # 1회 주문 상한(USDT)
POLL_SECONDS = float(os.environ.get("BOT_POLL_SECONDS", "5"))     # 시세 폴링 주기(초)
DEFAULT_TP_PCT = 3.0   # 매크로에 익절 목표가 없을 때 기본 익절률(%)
MAX_RETRIES = 3

HERE = os.path.dirname(os.path.abspath(__file__))


def _utf8_stdout() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def load_macro() -> dict:
    with open(os.path.join(HERE, "macro.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def banner(symbol: str) -> None:
    net = "TESTNET (가짜 자금)" if USE_TESTNET else "!!! MAINNET (실제 자금) !!!"
    print("=" * 60)
    print(f"   *** {net} ***")
    print(f"   심볼: {symbol} · 1회 주문 상한: {MAX_ORDER_USDT} USDT")
    print("   주문(매수/매도)만 실행 · 출금 기능 없음 · 키는 저장/전송 안 함")
    print("=" * 60)


def _round_step(qty: float, step: float) -> float:
    if step <= 0:
        return qty
    d = Decimal(str(step))
    return float((Decimal(str(qty)) / d).to_integral_value(rounding=ROUND_DOWN) * d)


def _parse_filters(info: dict) -> tuple[float, float]:
    """(lot step size, min notional) so orders satisfy exchange rules."""
    step, min_notional = 0.0, 0.0
    for f in (info or {}).get("filters", []):
        if f["filterType"] == "LOT_SIZE":
            step = float(f["stepSize"])
        elif f["filterType"] in ("MIN_NOTIONAL", "NOTIONAL"):
            min_notional = float(f.get("minNotional", f.get("notional", 0)) or 0)
    return step, min_notional


def _strategy_targets(macro: dict) -> dict:
    """Derive entry/exit levels from the macro (simplified live executor)."""
    p = macro.get("params", {})
    risk = macro.get("risk", {})
    rule = macro.get("rule_type", "A")
    tp = p.get("take_profit_pct") or p.get("take_profit") or p.get("tp")
    return {
        "rule": rule,
        "tp_pct": float(tp) if tp else None,
        "sl_pct": float(risk["stop_loss_pct"]) if risk.get("stop_loss_pct") else None,
        "buy_price": float(p["buy_price"]) if p.get("buy_price") else None,
        "sell_price": float(p["sell_price"]) if p.get("sell_price") else None,
        "invest_ratio": float(risk.get("invest_ratio", 1.0)),
        "capital": float(p.get("initial_capital", 0) or 0),
    }


def _should_enter(t: dict, price: float) -> bool:
    if t["rule"] == "B" and t["buy_price"]:
        return price <= t["buy_price"]   # limit band: buy at/below buy_price
    return True                          # others: enter when flat


def _should_exit(t: dict, price: float, entry: float) -> bool:
    if t["rule"] == "B" and t["sell_price"] and price >= t["sell_price"]:
        return True
    tp = t["tp_pct"] if t["tp_pct"] is not None else (None if t["rule"] == "B" else DEFAULT_TP_PCT)
    if tp is not None and price >= entry * (1 + tp / 100.0):
        return True
    if t["sl_pct"] is not None and price <= entry * (1 - t["sl_pct"] / 100.0):
        return True
    return False


def _base_asset(symbol: str) -> str:
    for q in ("USDT", "BUSD", "USDC", "FDUSD"):
        if symbol.endswith(q):
            return symbol[: -len(q)]
    return symbol


def _balances(client, base: str):
    """(USDT free, base free) from the account. (None, None) on error."""
    try:
        u = client.get_asset_balance(asset="USDT")
        b = client.get_asset_balance(asset=base)
        return (float(u["free"]) if u else 0.0), (float(b["free"]) if b else 0.0)
    except Exception:
        return None, None


def _place(client, symbol: str, side: str, qty: float):
    """Place a MARKET order with limited retries. Returns the response or None."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            order = client.create_order(symbol=symbol, side=side, type="MARKET", quantity=qty)
            fills = order.get("fills", [])
            avg = fills[0]["price"] if fills else "?"
            print(f"  ✓ {side} 주문 체결: id={order.get('orderId')} 수량={qty} 체결가~{avg} "
                  f"상태={order.get('status')}")
            return order
        except Exception as exc:  # BinanceAPIException 등
            print(f"  ✗ {side} 주문 실패({attempt}/{MAX_RETRIES}): {exc}")
            if attempt < MAX_RETRIES:
                time.sleep(1.0)
    print("  주문을 포기합니다(재시도 초과).")
    return None


def main() -> None:
    _utf8_stdout()
    macro = load_macro()
    symbol = str(macro.get("symbol", "BTCUSDT")).upper()
    banner(symbol)
    print(macro.get("human_summary", ""))
    print()

    # 키 입력: 메모리에서만 사용. 저장/전송/로깅하지 않음.
    api_key = input("API Key (테스트넷): ").strip()
    api_secret = getpass.getpass("API Secret (입력 숨김): ").strip()
    if not api_key or not api_secret:
        print("키가 비어 있어 종료합니다.")
        return

    try:
        from binance.client import Client
    except ImportError:
        print("python-binance 가 설치되어 있지 않습니다.  pip install -r requirements.txt 후 다시 실행하세요.")
        return

    try:
        client = Client(api_key, api_secret, testnet=USE_TESTNET)
        account = client.get_account()
    except Exception as exc:
        print(f"연결/인증 실패: {exc}")
        if "-2015" in str(exc) or "Invalid API-key" in str(exc):
            print("점검하세요:")
            print("  ① 반드시 https://testnet.binance.vision (Spot Test Network) 에서 발급한 키인가요?")
            print("     - 실제 binance.com 키, 선물 testnet.binancefuture.com 키는 동작하지 않습니다.")
            print("  ② 키에 IP 제한을 걸었다면 현재 IP를 허용하거나 제한을 해제하세요.")
            print("  ③ 테스트넷이 초기화되면 기존 키가 만료됩니다 → 키를 재발급하세요.")
            print("  ④ Secret 을 공백 없이 정확히 입력했는지 확인하세요.")
        else:
            print("테스트넷 키는 https://testnet.binance.vision 에서 발급합니다(README-run.txt 참고).")
        return

    base = _base_asset(symbol)
    usdt = next((b for b in account["balances"] if b["asset"] == "USDT"), None)
    print(f"연결 성공. USDT 잔고(가짜): {usdt['free'] if usdt else '조회 실패'}")

    # 이 환경(테스트넷)에 종목이 상장돼 있는지 먼저 확인 → 없으면 친절히 안내 후 종료.
    info = client.get_symbol_info(symbol)
    if not info:
        print(f"\n[오류] '{symbol}' 은(는) 테스트넷에 상장되어 있지 않습니다.")
        print("  테스트넷은 일부 주요 종목만 지원합니다(급등 잡코인은 대개 없음).")
        print("  예: BTCUSDT, ETHUSDT, BNBUSDT, LTCUSDT, XRPUSDT, TRXUSDT, ADAUSDT")
        print("  → 같은 폴더의 macro.json 에서 \"symbol\" 을 위 종목(롱)으로 바꾼 뒤 다시 실행하세요.")
        return
    if str(macro.get("position_side", "long")).lower() == "short":
        print("⚠ 현물(spot) 테스트넷은 숏(공매도)을 지원하지 않습니다. 롱 기준으로만 동작합니다.")
    if int(macro.get("leverage", 1) or 1) > 1:
        print(f"⚠ 이 매크로는 레버리지 {macro.get('leverage')}배로 설정돼 있지만, 실거래(현물)에는 "
              "레버리지를 적용하지 않습니다. 1배(현물) 기준으로만 주문합니다.")

    step, min_notional = _parse_filters(info)
    t = _strategy_targets(macro)
    print(f"전략: rule={t['rule']} 익절={t['tp_pct']}% 손절={t['sl_pct']}% "
          f"밴드=({t['buy_price']},{t['sell_price']}) 투입비율={t['invest_ratio']*100:.0f}%")
    print(f"주문 상한 {MAX_ORDER_USDT} USDT · {POLL_SECONDS}초마다 평가. Ctrl+C 로 안전 종료.")
    print("아래에 매 주기 [시각] 현재가 · 포지션 · 잔고(USDT/코인) 가 실시간으로 표시됩니다.\n")

    in_position = False
    entry_price = 0.0
    held_qty = 0.0
    realized = 0.0  # 누적 실현손익(USDT)
    try:
        while True:
            try:
                price = float(client.get_symbol_ticker(symbol=symbol)["price"])
            except Exception as exc:  # 일시적 네트워크/레이트리밋 등: 죽지 않고 재시도
                print(f"  일시 오류(시세 조회): {exc} — {POLL_SECONDS}초 후 재시도")
                time.sleep(POLL_SECONDS)
                continue
            # 실시간 상태 한 줄: 이 콘솔이 곧 잔고/포지션/손익 대시보드입니다.
            uf, bf = _balances(client, base)
            if in_position and entry_price > 0:
                pnl_pct = (price - entry_price) / entry_price * 100.0
                pos = f"보유 {held_qty} {base}(진입가 {entry_price})"
                pnl = f"손익 {pnl_pct:+.2f}%"
            else:
                pos, pnl = "포지션 없음", "손익 -"
            bal = (f"USDT {uf:.2f} / {base} {bf:.6f}" if uf is not None else "잔고 조회 실패")
            print(f"[{time.strftime('%H:%M:%S')}] {symbol} 현재가 {price} | {pos} | {pnl} "
                  f"| 누적 {realized:+.2f} USDT | 잔고 {bal}")
            if not in_position:
                if _should_enter(t, price):
                    budget = t["capital"] * t["invest_ratio"] if t["capital"] else MAX_ORDER_USDT
                    spend = min(budget, MAX_ORDER_USDT)   # 1회 주문 상한 강제
                    qty = _round_step(spend / price, step)
                    if qty <= 0 or qty * price < min_notional:
                        print(f"  (주문 최소금액 미만: 필요≥{min_notional} USDT, 대기)")
                    else:
                        print(f"[진입 신호] 현재가 {price} → 매수 {qty} {symbol}")
                        order = _place(client, symbol, "BUY", qty)
                        if order:
                            in_position, entry_price, held_qty = True, price, qty
            else:
                if _should_exit(t, price, entry_price):
                    print(f"[청산 신호] 현재가 {price} (진입 {entry_price}) → 매도 {held_qty}")
                    order = _place(client, symbol, "SELL", _round_step(held_qty, step))
                    if order:
                        trade_pnl = held_qty * (price - entry_price)
                        trade_pct = (price - entry_price) / entry_price * 100.0 if entry_price else 0.0
                        realized += trade_pnl
                        print(f"  이번 거래 손익: {trade_pct:+.2f}% ({trade_pnl:+.2f} USDT) · 누적 {realized:+.2f} USDT")
                        in_position, entry_price, held_qty = False, 0.0, 0.0
            time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("\n종료 요청(Ctrl+C).")
        if in_position:
            print(f"⚠ 아직 보유 중인 포지션이 있습니다: {held_qty} {symbol} (진입가 {entry_price}). "
                  f"필요하면 거래소에서 직접 정리하세요.")
        print("봇을 종료합니다.")


if __name__ == "__main__":
    main()
'''

# --- requirements.txt ----------------------------------------------------
_REQUIREMENTS_TXT = """# 봇 실행에 필요한 최소 의존성
python-binance>=1.0.19
"""

# --- run.bat (robust Windows launcher) -----------------------------------
# IMPORTANT: cmd.exe parses .bat files using the system OEM code page (e.g. cp949
# on Korean Windows), NOT UTF-8 — `chcp 65001` only changes console *output*.
# So this file is kept ASCII-only; Korean guidance lives in README-run.txt.
# It is written to the zip with CRLF line endings (build_bundle) for cmd.exe.
_RUN_BAT = """@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Coin Macro Bot (Binance TESTNET - fake funds)
echo   * Default is TESTNET. No real assets are moved.
echo   * Korean guide: open README-run.txt
echo ============================================================
echo.

REM Find Python: try "py -3", then "python", then "python3"
set "PYEXE="
py -3 --version >nul 2>nul && set "PYEXE=py -3"
if not defined PYEXE (
  python --version >nul 2>nul && set "PYEXE=python"
)
if not defined PYEXE (
  python3 --version >nul 2>nul && set "PYEXE=python3"
)
if not defined PYEXE (
  echo [ERROR] Python was not found.
  echo   Install Python 3.10+ from https://www.python.org/downloads/
  echo   and check "Add Python to PATH" during setup, then run again.
  echo.
  pause
  exit /b 1
)
echo Using Python: %PYEXE%
echo.

echo [1/2] Installing dependency (python-binance)...
%PYEXE% -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo [ERROR] Dependency install failed. Check your internet and Python.
  echo   Manual:  %PYEXE% -m pip install -r requirements.txt
  echo.
  pause
  exit /b 1
)
echo.

echo [2/2] Starting bot...
%PYEXE% "%~dp0bot.py"
if errorlevel 1 (
  echo.
  echo [ERROR] The bot exited with an error. See the messages above.
)

echo.
echo === Finished. Press any key to close this window. ===
pause >nul
"""

# --- run.ps1 (optional PowerShell launcher; ASCII for PS 5.1 safety) -----
_RUN_PS1 = """# Coin Macro Bot launcher (PowerShell). Korean guide: README-run.txt
# If blocked by execution policy, run this first in PowerShell:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# or just double-click run.bat instead.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Find-Python {
  foreach ($cand in @("py -3", "python", "python3")) {
    try {
      $exe, $rest = $cand.Split(" ", 2)
      & $exe $rest --version *> $null
      if ($LASTEXITCODE -eq 0) { return $cand }
    } catch {}
  }
  return $null
}

$py = Find-Python
if (-not $py) {
  Write-Host "[ERROR] Python not found. Install from https://www.python.org/downloads/ then retry."
  Read-Host "Press Enter to exit"; exit 1
}
Write-Host "Using Python: $py"
Invoke-Expression "$py -m pip install -r `"$PSScriptRoot\\requirements.txt`""
Invoke-Expression "$py `"$PSScriptRoot\\bot.py`""
Read-Host "Press Enter to exit"
"""

_README_TXT = """코인 매크로 봇 (바이낸스 테스트넷 실구동)
==========================================

⚠️ 기본은 테스트넷(가짜 자금)입니다. 실제 자산은 움직이지 않습니다.

가장 쉬운 실행 (Windows, 2단계)
  ① Python 3.10+ 설치 (https://www.python.org/downloads/, 설치 시 "Add Python to PATH" 체크)
  ② run.bat 더블클릭  → 의존성 설치 후 봇 실행 → API 키 입력

수동 실행 (run.bat 이 막힐 때)
  1) 이 폴더에서:  pip install -r requirements.txt
  2) 그다음:       python bot.py
  (PowerShell 사용 시 run.ps1 도 있습니다. 실행정책 막히면 안내 문구 참고.)

포함 파일
  - run.bat / run.ps1 : 실행 런처(파이썬 탐색 → 의존성 설치 → bot.py)
  - bot.py            : 테스트넷 실구동 봇(실제 주문, 가짜 자금)
  - requirements.txt  : python-binance
  - macro.json        : 이 봇이 따를 매크로 설정
  - README-run.txt    : 이 안내 파일

매크로 요약
  {summary}

------------------------------------------------------------
테스트넷 키 발급 & 실행
------------------------------------------------------------
1) https://testnet.binance.vision 접속 → (깃허브 등으로) 로그인
2) "Generate HMAC_SHA256 Key" 로 API Key / Secret 발급 (테스트넷 전용, 가짜 자금)
3) run.bat 실행 → 프롬프트에 위 Key/Secret 입력
4) 봇이 테스트넷에 연결되어 잔고를 조회하고, 매크로 조건에 따라
   실제 주문(매수/매도)을 테스트넷에 전송합니다. 주문ID/체결이 콘솔에 출력됩니다.
   (키는 메모리에서만 사용하며 저장/전송/로깅하지 않습니다.)

------------------------------------------------------------
⚠️ 메인넷(실제 자금) 전환 가이드 — 사용자가 직접, 신중히
------------------------------------------------------------
이 봇은 기본이 테스트넷이며 자동으로 메인넷을 켜지 않습니다. 실거래로 전환하려면:

  1) bot.py 상단의 스위치 한 곳만 바꿉니다:
        USE_TESTNET = True   →   USE_TESTNET = False
     (바꿀 곳은 이 상수 하나뿐입니다.)
  2) 메인넷 API 키는 바이낸스 본 사이트에서 발급하되,
        - "거래(Spot Trading)" 권한만 켜고,
        - "출금(Withdraw)" 권한은 반드시 끕니다.
  3) 반드시 소액부터. 환경변수로 1회 주문 상한을 낮추세요:
        (Windows) set MAX_ORDER_USDT=10  후 run.bat 실행
  4) 시장가 주문은 슬리피지가 있을 수 있습니다. 소액으로 흐름을 확인하세요.

책임 고지
  - 실거래는 사용자 PC에서 사용자 본인의 API 키로 실행됩니다.
  - 본 도구는 투자 조언이 아니며, 수익을 보장하지 않습니다.
  - 실거래로 인한 손익 책임은 전적으로 사용자 본인에게 있습니다.
  - 회사/서비스 맥락에서 실서비스 배포 전에는 법무·컴플라이언스 검토가 필요합니다.

이 봇은 주문(매수/매도)만 하며 출금/이체 기능이 없습니다.
"""


def build_bundle(macro: Macro) -> bytes:
    """Return a zip: run.bat, run.ps1, bot.py, requirements.txt, macro.json, README."""
    summary = human_summary(macro)
    macro_payload = macro.model_dump(mode="json")
    macro_payload["human_summary"] = summary

    # Windows launchers/read-me use CRLF; cmd.exe is picky about LF-only .bat.
    def crlf(text: str) -> str:
        return text.replace("\r\n", "\n").replace("\n", "\r\n")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("run.bat", crlf(_RUN_BAT))
        zf.writestr("run.ps1", crlf(_RUN_PS1))
        zf.writestr("bot.py", _BOT_PY)
        zf.writestr("requirements.txt", _REQUIREMENTS_TXT)
        zf.writestr("macro.json", json.dumps(macro_payload, ensure_ascii=False, indent=2))
        zf.writestr("README-run.txt", crlf(_README_TXT.format(summary=summary)))
    return buf.getvalue()
