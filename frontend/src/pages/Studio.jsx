import { useEffect, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import Builder from "../components/Builder.jsx";
import ResultView from "../components/ResultView.jsx";
import SimBadge from "../components/SimBadge.jsx";
import PaperPanel from "../components/PaperPanel.jsx";
import OptimizePanel from "../components/OptimizePanel.jsx";
import RegisterMacroModal from "../components/RegisterMacroModal.jsx";
import { api } from "../api.js";
import { buildMacro, defaultForm, macroToForm, validate } from "../lib/macro.js";

export default function Studio() {
  const { slug } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(defaultForm());
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState("");
  const [dataSource, setDataSource] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [share, setShare] = useState(null); // { slug, url }
  const [loadedFrom, setLoadedFrom] = useState("");
  const [runLeverage, setRunLeverage] = useState(1); // leverage of the last run (for badges)
  const [autoRun, setAutoRun] = useState(true); // re-run backtest automatically on builder change
  const [registerOpen, setRegisterOpen] = useState(false); // 리더보드 등록 모달

  // Clone flow: load a shared macro into the builder.
  useEffect(() => {
    if (!slug) return;
    setBusy(true);
    api
      .getMacro(slug)
      .then((data) => {
        setForm(macroToForm(data.macro));
        setLoadedFrom(data.human_summary);
        setShare({ slug, url: `${window.location.origin}/s/${slug}` });
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setBusy(false));
  }, [slug]);

  // Copy-to-builder from a leaderboard entry: full macro passed via router state.
  useEffect(() => {
    const macro = location.state?.macro;
    if (macro) {
      setForm(macroToForm(macro));
      setLoadedFrom("리더보드에서 복사한 매크로");
      window.history.replaceState({}, ""); // consume state so refresh doesn't re-apply
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Prefill symbol from a "오늘의 경주마" marquee click (/?symbol=XRPUSDT).
  useEffect(() => {
    if (slug) return; // clone flow owns the form
    const sym = searchParams.get("symbol");
    if (!sym) return;
    setForm((f) => ({ ...f, symbol: sym.toUpperCase() }));
    searchParams.delete("symbol");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, slug]);

  const valErr = validate(form);

  // Auto-run: re-run the backtest a beat after the builder settles, so tweaking
  // a value no longer means "scroll down → click 실행 → scroll back up" each time.
  // Only fires once a first result exists (so the empty state isn't skipped) and
  // the form is valid. Debounced; skipped while a run is already in flight.
  useEffect(() => {
    if (!autoRun || valErr || !result) return;
    const t = setTimeout(() => {
      if (!busy) runBacktest();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, JSON.stringify(form)]);

  // Ctrl/⌘+Enter runs the backtest from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!valErr && !busy) runBacktest();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valErr, busy, JSON.stringify(form)]);

  async function runBacktest() {
    setError("");
    if (valErr) return setError(valErr);
    setBusy(true);
    try {
      const macro = buildMacro(form);
      const data = await api.backtest(macro);
      setResult(data.result);
      setSummary(data.human_summary);
      setDataSource(data.data_source);
      setPeriodLabel(data.period_label);
      setRunLeverage(macro.leverage || 1);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAndShare() {
    setError("");
    if (valErr) return setError(valErr);
    setBusy(true);
    try {
      const macro = buildMacro(form);
      const data = await api.createMacro(macro);
      setResult(data.result);
      setSummary(data.human_summary);
      setDataSource(data.data_source);
      setRunLeverage(macro.leverage || 1);
      setShare({ slug: data.share_slug, url: `${window.location.origin}/s/${data.share_slug}` });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">매크로 빌더</h2>
        {loadedFrom && (
          <div className="mb-4 rounded-lg bg-blue-50 border border-blue-300 px-4 py-3 text-sm text-blue-800">
            복제한 매크로: {loadedFrom}
          </div>
        )}
        <Builder form={form} setForm={setForm} />

        {valErr && <div className="mt-4 text-sm text-amber-700">{valErr}</div>}
        {error && <div className="mt-4 text-sm text-red-600">오류: {error}</div>}

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <button
            onClick={runBacktest}
            disabled={busy || !!valErr}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-5 py-2.5 font-semibold text-white"
          >
            {busy ? "실행 중…" : "백테스트 실행"}
          </button>
          <button
            onClick={saveAndShare}
            disabled={busy || !!valErr}
            className="rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-40 px-5 py-2.5 font-semibold"
          >
            저장 & 공유 링크 생성
          </button>
          <label
            className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none"
            title="빌더를 바꾸면 자동으로 백테스트를 다시 실행합니다"
          >
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
            ⚡ 자동 실행
          </label>
          <span className="text-xs text-slate-400">
            빌더 수정 시 자동 재실행 · <kbd className="rounded border border-slate-300 bg-slate-100 px-1">Ctrl</kbd>+<kbd className="rounded border border-slate-300 bg-slate-100 px-1">Enter</kbd> 로도 실행
          </span>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">결과</h2>
        </div>

        {!result && !busy && (
          <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-500">
            <SimBadge className="mb-4" />
            <div>백테스트를 실행하면 결과가 여기에 표시됩니다.</div>
          </div>
        )}

        {result && (
          <ResultView result={result} summary={summary} dataSource={dataSource} periodLabel={periodLabel} symbol={form.symbol} leverage={runLeverage} />
        )}

        {result && form.rule_type === "A" && (
          <div className="mt-6">
            <OptimizePanel form={form} setForm={setForm} valErr={valErr} />
          </div>
        )}

        {result && (
          <div className="mt-6">
            <PaperPanel macro={buildMacro(form)} valErr={valErr} onRegister={() => setRegisterOpen(true)} />
          </div>
        )}

        {share && (
          <div className="mt-6 rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-700">공유 & 인증 카드</div>
            <div className="flex gap-2">
              <input readOnly value={share.url} className="flex-1 rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm" />
              <button
                onClick={() => navigator.clipboard?.writeText(share.url)}
                className="rounded-lg bg-slate-200 hover:bg-slate-300 px-3 py-2 text-sm"
              >
                복사
              </button>
            </div>
            <img
              src={api.cardUrl(share.slug)}
              alt="공유 카드"
              className="w-full rounded-xl border border-slate-200"
            />
            <a
              href={api.cardUrl(share.slug)}
              download={`${share.slug}.png`}
              className="inline-block text-sm text-blue-600 hover:underline"
            >
              카드 이미지 다운로드
            </a>
          </div>
        )}
      </section>

      {registerOpen && (
        <RegisterMacroModal
          key="studio-register"
          open={true}
          initialMacro={valErr ? null : buildMacro(form)}
          onClose={() => setRegisterOpen(false)}
          onDone={() => setRegisterOpen(false)}
        />
      )}
    </div>
  );
}
