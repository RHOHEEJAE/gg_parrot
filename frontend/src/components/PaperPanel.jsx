import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import InfoTooltip from "./InfoTooltip.jsx";
import { baseOf, fmtMoney, fmtMoneyCompact, fmtPrice, fmtQty, quoteOf } from "../lib/format.js";

const SIDE_KO = { buy: "매수", sell: "매도", short: "숏 진입", cover: "숏 청산" };
const SIDE_COLOR = {
  buy: "text-green-600",
  short: "text-green-600",
  sell: "text-red-600",
  cover: "text-red-600",
};

function PaperBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 border border-indigo-300 px-3 py-1 text-xs font-semibold text-indigo-700">
      🧪 모의(페이퍼) 트레이딩 · 실거래 아님
      <InfoTooltip term="paper_trading" />
    </span>
  );
}

export default function PaperPanel({ macro, valErr }) {
  const [session, setSession] = useState(null); // {session_id,...}
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState("live"); // live | replay
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => stopPolling, []); // cleanup on unmount

  async function start() {
    setError("");
    if (valErr) return setError(valErr);
    setBusy(true);
    try {
      const s = await api.paperStart(macro, macro.symbol, mode);
      setSession(s);
      setStatus(null);
      stopPolling();
      const poll = async () => {
        try {
          const st = await api.paperStatus(s.session_id);
          setStatus(st);
          if (st.status !== "running") stopPolling();
        } catch (_) {}
      };
      poll();
      pollRef.current = setInterval(poll, 2000);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!session) return;
    setBusy(true);
    try {
      await api.paperStop(session.session_id);
      stopPolling();
      const st = await api.paperStatus(session.session_id);
      setStatus(st);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadBot() {
    setError("");
    try {
      await api.downloadBundle(macro);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  const running = status?.status === "running";
  const ret = status?.current_return ?? 0;
  const up = ret >= 0;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">페이퍼 트레이딩 (실시간 모의매매)</h3>
        <div className="flex items-center gap-2">
          {macro.leverage > 1 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300 px-3 py-1 text-xs font-bold text-red-700">
              ⚠️ 고위험 레버리지 {macro.leverage}배
              <InfoTooltip term="leverage" />
            </span>
          )}
          <PaperBadge />
        </div>
      </div>

      {macro.leverage > 1 && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          레버리지 {macro.leverage}배: 가격이 약 <b>{(100 / macro.leverage).toFixed(macro.leverage >= 100 ? 2 : 1)}%</b> 반대로
          움직이면 청산(전액 손실)됩니다. 모의(가짜 돈)로 위험을 체험하는 용도예요.
          <InfoTooltip term="liquidation" />
        </div>
      )}
      <p className="text-sm text-slate-500">
        실제 주문 없이 실시간 시세로 "샀다/팔았다 치고" 기록만 합니다. 거래소 계정·API 키가 필요 없습니다.
      </p>

      {/* controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={!!session && running}
          className="rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="live">실시간(live)</option>
          <option value="replay">데모 리플레이(최근 시세 빠르게 재생)</option>
        </select>

        {!running ? (
          <button
            onClick={start}
            disabled={busy || !!valErr}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2.5 font-semibold text-white"
          >
            {busy ? "시작 중…" : "▶ 페이퍼 트레이딩 시작"}
          </button>
        ) : (
          <button
            onClick={stop}
            disabled={busy}
            className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 px-5 py-2.5 font-semibold text-white"
          >
            ■ 중지
          </button>
        )}
        <span className="text-xs text-slate-500">
          {macro.symbol} · {mode === "replay" ? "리플레이" : "실시간"}
          {status && status.last_price > 0 && ` · 현재가 ${fmtPrice(status.last_price)} ${quoteOf(macro.symbol)}`}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        💵 금액 단위는 <b>{quoteOf(macro.symbol)}</b>(미국 달러 기준, 원화 아님) · 수량 단위는 코인 개수({baseOf(macro.symbol)})입니다.
      </p>

      {valErr && <div className="text-sm text-amber-700">{valErr}</div>}
      {error && <div className="text-sm text-red-600">오류: {error}</div>}

      {/* live figures */}
      {status && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-100 border border-slate-300 px-4 py-3 min-w-0">
            <div className="text-xs text-slate-500">현재 평가금액 ({quoteOf(macro.symbol)})</div>
            <div className="text-2xl font-bold truncate" title={fmtMoney(status.current_equity, macro.symbol)}>
              {fmtMoneyCompact(status.current_equity, macro.symbol)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-100 border border-slate-300 px-4 py-3">
            <div className="text-xs text-slate-500">현재 수익률</div>
            <div className={"text-2xl font-bold " + (up ? "text-green-600" : "text-red-600")}>
              {up ? "+" : ""}
              {ret.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-xl bg-slate-100 border border-slate-300 px-4 py-3">
            <div className="text-xs text-slate-500">상태</div>
            <div className="text-2xl font-bold">
              {running ? <span className="text-indigo-600">● 실행중</span> : "중지됨"}
            </div>
          </div>
        </div>
      )}

      {/* liquidation alert (leverage) */}
      {status && (status.liquidations || 0) > 0 && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-700">
          <div className="font-extrabold">⚠️ {status.liquidations}번 청산됨 (전액 손실)</div>
          <div className="text-sm mt-1">
            청산으로 잃은 금액 <b>{fmtMoney(status.liquidated_loss || 0, macro.symbol)}</b> · 레버리지 {macro.leverage}배의
            위험을 모의로 확인했습니다.
          </div>
        </div>
      )}

      {/* live trade log */}
      {status && (
        <div>
          <div className="text-sm text-slate-500 mb-2">실시간 매매 로그 (최신이 위)</div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-200">
            <div className="flex items-center px-4 py-2 text-xs text-slate-500 bg-slate-100 sticky top-0">
              <span className="w-20">시각</span>
              <span className="w-16">구분</span>
              <span className="flex-1 text-right">체결가 ({quoteOf(macro.symbol)})</span>
              <span className="w-44 text-right">수량 ({baseOf(macro.symbol)})</span>
              <span className="w-20 text-right">누적수익</span>
            </div>
            {(status.trades || []).length === 0 && (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">
                아직 체결이 없습니다. 조건을 낮추거나(익절/손절 0.3~1%) 변동성 큰 종목/리플레이를 써보세요.
              </div>
            )}
            {(status.trades || []).map((t, i) => (
              <div
                key={t.id}
                className={
                  "flex items-center px-4 py-2 text-sm " + (i === 0 ? "bg-indigo-50" : "")
                }
              >
                <span className="text-slate-500 w-20">{t.ts.slice(11, 19)}</span>
                <span className={"font-semibold w-16 " + (SIDE_COLOR[t.side] || "")}>
                  {SIDE_KO[t.side] || t.side}
                </span>
                <span className="text-slate-700 flex-1 text-right tabular-nums">
                  {fmtPrice(t.price)}
                </span>
                <span className="text-slate-500 w-44 text-right tabular-nums">
                  {fmtQty(t.qty)}
                </span>
                <span
                  className={
                    "w-20 text-right tabular-nums " +
                    (t.return_at_trade >= 0 ? "text-green-600" : "text-red-600")
                  }
                >
                  {t.return_at_trade >= 0 ? "+" : ""}
                  {Number(t.return_at_trade).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* real-trade download (demo mockup) */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
        <div className="text-sm font-semibold text-amber-800">동작 검증 완료 → 실거래로 전환</div>
        <button
          onClick={downloadBot}
          disabled={!!valErr}
          className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-slate-900"
        >
          ⬇ 실거래 실행 파일 다운로드 (bot.py)
        </button>
        <p className="text-xs text-amber-700">
          실거래는 사용자 PC에서 사용자 본인의 API 키로 실행됩니다. 본 도구는 투자 조언이 아니며, 실거래로
          인한 손익 책임은 사용자에게 있습니다.
        </p>
        <p className="text-xs text-slate-500">
          ※ 데모 버전: 다운로드되는 파일은 키 입력 화면까지만 동작하며 실제 거래를 실행하지 않습니다. 키는
          저장·전송되지 않습니다.
        </p>
      </div>
    </div>
  );
}
