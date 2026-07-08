"""Server-side share/certification card (Pillow) -> PNG bytes.

The card ALWAYS carries the "past simulation, not real trading" badge.
"""
from __future__ import annotations

import io
import os
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (17, 24, 39)          # slate-900
PANEL = (31, 41, 55)       # slate-800
FG = (243, 244, 246)
MUTED = (156, 163, 175)
GREEN = (34, 197, 94)
RED = (239, 68, 68)
AMBER = (245, 158, 11)

_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgun.ttf",   # Malgun Gothic (Korean)
    r"C:\Windows\Fonts\malgunbd.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = list(_FONT_CANDIDATES)
    if bold:
        candidates.insert(0, r"C:\Windows\Fonts\malgunbd.ttf")
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def render_card(
    *,
    symbol: str,
    human_summary: str,
    period_label: str,
    return_pct: float,
    win_pct: float,
    mdd_pct: float,
    trades: int,
    share_url: str,
    data_source: str = "",
) -> bytes:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    pad = 56
    # --- header: symbol + warning badge ---
    d.text((pad, 44), symbol.upper(), font=_font(56, bold=True), fill=FG)

    badge = "과거 시뮬레이션 결과 · 실거래 아님"
    bf = _font(26, bold=True)
    bw = d.textlength(badge, font=bf)
    bx0 = W - pad - bw - 68
    d.rounded_rectangle((bx0, 50, W - pad, 96), radius=14, fill=(69, 26, 3))
    # hand-drawn warning triangle (emoji glyphs don't render in the TTF)
    tx, ty = bx0 + 22, 62
    d.polygon([(tx, ty + 22), (tx + 22, ty + 22), (tx + 11, ty)], fill=AMBER)
    d.text((tx + 8, ty + 3), "!", font=_font(20, bold=True), fill=(69, 26, 3))
    d.text((bx0 + 56, 58), badge, font=bf, fill=AMBER)

    # --- human summary ---
    d.text((pad, 128), human_summary, font=_font(30), fill=MUTED)

    # --- big return ---
    color = GREEN if return_pct >= 0 else RED
    sign = "+" if return_pct >= 0 else ""
    ret_txt = f"{sign}{return_pct:.2f}%"
    d.text((pad, 196), "백테스트 수익률", font=_font(28), fill=MUTED)
    d.text((pad, 232), ret_txt, font=_font(140, bold=True), fill=color)

    # --- stat panel ---
    stats = [
        ("승률", f"{win_pct:.1f}%"),
        ("MDD", f"-{mdd_pct:.1f}%"),
        ("매매 횟수", f"{trades}"),
        ("기간", period_label),
    ]
    panel_y = 424
    d.rounded_rectangle((pad, panel_y, W - pad, panel_y + 118), radius=18, fill=PANEL)
    col_w = (W - 2 * pad) / len(stats)
    for i, (label, value) in enumerate(stats):
        cx = pad + col_w * i + 28
        d.text((cx, panel_y + 24), label, font=_font(24), fill=MUTED)
        d.text((cx, panel_y + 58), value, font=_font(40, bold=True), fill=FG)

    # --- footer: share link ---
    footer = f"복제하기 → {share_url}"
    d.text((pad, 576), footer, font=_font(26), fill=(96, 165, 250))
    if data_source:
        note = f"데이터: {data_source}"
        nf = _font(22)
        d.text((W - pad - d.textlength(note, font=nf), 578), note, font=nf, fill=MUTED)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
