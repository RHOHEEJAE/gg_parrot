import { useEffect, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import Builder from "../components/Builder.jsx";
import ResultView from "../components/ResultView.jsx";
import SimBadge from "../components/SimBadge.jsx";
import PaperPanel from "../components/PaperPanel.jsx";
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
          <div className="mb-4 rounded-lg bg-blue-950/40 border border-blue-800/50 px-4 py-3 text-sm text-blue-200">
            복제한 매크로: {loadedFrom}
          </div>
        )}
        <Builder form={form} setForm={setForm} />

        {valErr && <div className="mt-4 text-sm text-amber-300">{valErr}</div>}
        {error && <div className="mt-4 text-sm text-red-400">오류: {error}</div>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={runBacktest}
            disabled={busy || !!valErr}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-5 py-2.5 font-semibold"
          >
            {busy ? "실행 중…" : "백테스트 실행"}
          </button>
          <button
            onClick={saveAndShare}
            disabled={busy || !!valErr}
            className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-5 py-2.5 font-semibold"
          >
            저장 & 공유 링크 생성
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">결과</h2>
        </div>

        {!result && !busy && (
          <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center text-slate-500">
            <SimBadge className="mb-4" />
            <div>백테스트를 실행하면 결과가 여기에 표시됩니다.</div>
          </div>
        )}

        {result && (
          <ResultView result={result} summary={summary} dataSource={dataSource} periodLabel={periodLabel} symbol={form.symbol} />
        )}

        {result && (
          <div className="mt-6">
            <PaperPanel macro={buildMacro(form)} valErr={valErr} />
          </div>
        )}

        {share && (
          <div className="mt-6 rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-300">공유 & 인증 카드</div>
            <div className="flex gap-2">
              <input readOnly value={share.url} className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm" />
              <button
                onClick={() => navigator.clipboard?.writeText(share.url)}
                className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm"
              >
                복사
              </button>
            </div>
            <img
              src={api.cardUrl(share.slug)}
              alt="공유 카드"
              className="w-full rounded-xl border border-slate-800"
            />
            <a
              href={api.cardUrl(share.slug)}
              download={`${share.slug}.png`}
              className="inline-block text-sm text-blue-400 hover:underline"
            >
              카드 이미지 다운로드
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
