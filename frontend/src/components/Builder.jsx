import { RULE_TYPES, PERIOD_PRESETS, CANDLE_INTERVALS, MAX_LEVERAGE, withTypeDefaults } from "../lib/macro.js";
import InfoTooltip from "./InfoTooltip.jsx";
import { quoteOf } from "../lib/format.js";

const money = (v, symbol) => `${Number(v || 0).toLocaleString("en-US")} ${quoteOf(symbol)}`;

// Live risk read-out for a chosen leverage. Price move to liquidation ≈ 100/N %.
function leverageRisk(lev) {
  const n = Math.max(1, Math.round(Number(lev) || 1));
  if (n <= 1) return null;
  const movePct = 100 / n;
  let level, cls;
  if (n >= 20) { level = "매우 위험"; cls = "border-red-400 bg-red-50 text-red-800"; }
  else if (n >= 10) { level = "고위험"; cls = "border-red-300 bg-red-50 text-red-700"; }
  else if (n >= 4) { level = "주의"; cls = "border-amber-300 bg-amber-50 text-amber-800"; }
  else { level = "낮음"; cls = "border-amber-200 bg-amber-50 text-amber-700"; }
  return { n, movePct, level, cls };
}

function Field({ label, term, children, hint }) {
  return (
    <label className="block">
      <span className="flex items-center text-sm text-slate-700 mb-1">
        {label}
        {term && <InfoTooltip term={term} />}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-slate-900 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function Builder({ form, setForm }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setChk = (k) => (e) => setForm({ ...form, [k]: e.target.checked });
  const rt = form.rule_type;
  const meta = RULE_TYPES[rt];
  const isShort = form.position_side === "short";

  // Field builders — plain functions (invoked, not JSX components) so inputs
  // keep focus across keystrokes. They close over the current `form`.
  const num = (k, label, opts = {}) => (
    <Field key={k} label={label} term={opts.term} hint={opts.hint}>
      <input className={inputCls} type="number" step={opts.step || "any"} value={form[k]} onChange={set(k)} />
    </Field>
  );
  const sel = (k, label, options, opts = {}) => (
    <Field key={k} label={label} term={opts.term} hint={opts.hint}>
      <select className={inputCls} value={form[k]} onChange={set(k)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
  const chk = (k, label, opts = {}) => (
    <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={!!form[k]} onChange={setChk(k)} />
      {label}
      {opts.term && <InfoTooltip term={opts.term} />}
    </label>
  );
  const cap = num("initial_capital", `초기 자본 initial_capital (${quoteOf(form.symbol)})`, {
    hint: money(form.initial_capital, form.symbol),
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="종목 (symbol)" hint={`금액 단위: ${quoteOf(form.symbol)} (달러 기준, 원화 아님)`}>
          <input className={inputCls} value={form.symbol} onChange={set("symbol")} />
        </Field>
        <Field label="규칙 타입 (전략)" term={`strat_${rt}`}>
          <select className={inputCls} value={rt} onChange={(e) => setForm(withTypeDefaults(form, e.target.value))}>
            {Object.entries(RULE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field
          label={
            <span className="flex items-center">
              포지션 방향
              <span className="ml-1 text-xs text-slate-500">롱</span>
              <InfoTooltip term="long" />
              <span className="ml-1 text-xs text-slate-500">숏</span>
              <InfoTooltip term="short" />
            </span>
          }
        >
          <select className={inputCls} value={form.position_side} onChange={set("position_side")} disabled={!meta.allowShort}>
            <option value="long">롱 (long)</option>
            <option value="short" disabled={!meta.allowShort}>숏 (short)</option>
          </select>
        </Field>
        {sel("candle_interval", "봉 단위 candle_interval", CANDLE_INTERVALS, {
          term: "candle_interval",
          hint: meta.indicator ? "지표 계산 기준(필수)" : "체결 판정 기준",
        })}
        <Field label="백테스트 기간" term="backtest">
          <select className={inputCls} value={form.preset} onChange={set("preset")}>
            {PERIOD_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {form.preset === "custom" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="시작일" hint="YYYY-MM-DD">
            <input className={inputCls} type="date" value={form.start} onChange={set("start")} />
          </Field>
          <Field label="종료일" hint="YYYY-MM-DD">
            <input className={inputCls} type="date" value={form.end} onChange={set("end")} />
          </Field>
        </div>
      )}

      {/* leverage — a macro condition (backtest/paper only; C is excluded) */}
      {rt !== "C" && (() => {
        const lev = Math.max(1, Math.round(Number(form.leverage) || 1));
        const risk = leverageRisk(lev);
        return (
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center text-sm font-semibold text-slate-500">
              레버리지 (leverage)
              <InfoTooltip term="leverage" />
              <span className="ml-2 text-xs font-normal text-slate-400">격리(isolated) · 백테스트·모의만</span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range" min="1" max={MAX_LEVERAGE} step="1" value={lev}
                onChange={set("leverage")}
                className="flex-1 accent-red-500"
              />
              <div className="flex items-center gap-1">
                <input
                  className={inputCls + " w-20 text-center"}
                  type="number" min="1" max={MAX_LEVERAGE} step="1" value={form.leverage}
                  onChange={set("leverage")}
                />
                <span className="text-sm text-slate-500">배</span>
              </div>
            </div>
            {risk ? (
              <div className={"rounded-lg border px-3 py-2 text-sm flex items-start gap-2 " + risk.cls}>
                <span className="text-base leading-none">⚠️</span>
                <span>
                  <b>레버리지 {risk.n}배 · {risk.level}</b> — 가격이 약{" "}
                  <b>{risk.movePct.toFixed(risk.movePct < 1 ? 2 : 1)}%</b> 반대로 움직이면{" "}
                  <b>청산(전액 손실)</b>됩니다.
                  {lev >= 10 && " 초보자에겐 특히 위험해요."}
                  <InfoTooltip term="liquidation" />
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-500">1배 = 현물과 동일(청산 없음). 배수를 올리면 수익도 손실도 그만큼 커지고 청산 위험이 생겨요.</div>
            )}
          </div>
        );
      })()}

      {/* rule-specific params */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="text-sm font-semibold text-slate-500">규칙 파라미터 · {meta.label}</div>

        {rt === "A" && (
          <div className="grid grid-cols-2 gap-4">
            {num("take_profit_pct", "익절률 take_profit (%)", { term: "take_profit" })}
            {cap}
          </div>
        )}
        {rt === "B" && (
          <div className="grid grid-cols-3 gap-4">
            {num("buy_price", `매수가 buy_price (${quoteOf(form.symbol)})`, { term: "limit_order" })}
            {num("sell_price", `매도가 sell_price (${quoteOf(form.symbol)})`, { term: "limit_order" })}
            {cap}
          </div>
        )}
        {rt === "C" && (
          <div className="grid grid-cols-2 gap-4">
            {num("amount_per_buy", `1회 매수액 amount_per_buy (${quoteOf(form.symbol)})`, { term: "dca", hint: money(form.amount_per_buy, form.symbol) })}
            {num("interval_days", "매수 주기 interval_days (일)", { term: "dca" })}
          </div>
        )}

        {rt === "D" && (
          <div className="grid grid-cols-2 gap-4">
            {num("lower_price", `하단가격 lower_price (${quoteOf(form.symbol)})`, { term: "grid" })}
            {num("upper_price", `상단가격 upper_price (${quoteOf(form.symbol)})`, { term: "grid" })}
            {num("grid_count", "격자 수 grid_count", { term: "grid_count", step: "1" })}
            {sel("grid_mode", "격자 간격 grid_mode", [{ value: "arithmetic", label: "등차(균등금액)" }, { value: "geometric", label: "등비(균등비율)" }], { term: "grid_mode" })}
            {num("per_grid_invest", `격자당 투입액 (빈칸=균등, ${quoteOf(form.symbol)})`, { hint: "비우면 예산을 격자 수로 균등 분배" })}
            {sel("band_exit_action", "밴드 이탈 시 band_exit_action", [{ value: "stop", label: "전량 청산·중단" }, { value: "hold", label: "보유 유지" }])}
            <div className="col-span-2 grid grid-cols-2 gap-4 items-end">
              {chk("rebalance_on_start", "시작 시 격자 재배치 rebalance_on_start")}
              {cap}
            </div>
          </div>
        )}

        {rt === "E" && (
          <div className="grid grid-cols-2 gap-4">
            {sel("entry_mode", "진입 방식 entry_mode", [{ value: "immediate", label: "즉시 진입" }, { value: "dip", label: "하락 시 진입(dip)" }])}
            {num("entry_dip", "진입 하락폭 entry_dip (%)", { hint: "entry_mode=dip일 때" })}
            {num("activation_profit", "발동 이익 activation_profit (%)", { term: "activation_profit" })}
            {num("trail_percent", "추적 폭 trail_percent (%)", { term: "trail_percent" })}
            {chk("reenter_after_exit", "청산 후 재진입 reenter_after_exit")}
            {cap}
          </div>
        )}

        {rt === "F" && (
          <div className="grid grid-cols-2 gap-4">
            {num("rsi_period", "RSI 기간 rsi_period", { term: "rsi", step: "1" })}
            {num("confirm_candles", "확정 봉수 confirm_candles", { step: "1", hint: "연속 N봉 충족 시 신호" })}
            {num("entry_threshold", "진입 임계 entry_threshold", { hint: "이하일 때 진입(롱)" })}
            {num("exit_threshold", "청산 임계 exit_threshold", { hint: "이상일 때 청산(롱)" })}
            {sel("exit_mode", "청산 방식 exit_mode", [{ value: "indicator", label: "지표" }, { value: "take_profit", label: "익절" }, { value: "both", label: "둘 중 먼저" }])}
            {num("take_profit", "익절률 take_profit (%)", { hint: "exit_mode 익절/both일 때" })}
            {cap}
          </div>
        )}

        {rt === "G" && (
          <div className="grid grid-cols-2 gap-4">
            {num("bb_period", "기간 bb_period", { term: "bollinger", step: "1" })}
            {num("bb_std", "표준편차 bb_std (σ)", { term: "bollinger" })}
            {sel("strategy", "전략 strategy", [{ value: "reversion", label: "되돌림(밴드터치 역추세)" }, { value: "breakout", label: "돌파(밴드 뚫기)" }])}
            {sel("exit_target", "청산 목표 exit_target", [{ value: "mid", label: "중앙선" }, { value: "opposite", label: "반대 밴드" }])}
            <div className="col-span-2 grid grid-cols-2 gap-4 items-end">
              {chk("squeeze_filter", "스퀴즈 필터 squeeze_filter", { term: "squeeze" })}
              {num("squeeze_lookback", "스퀴즈 룩백 squeeze_lookback", { step: "1" })}
            </div>
            {cap}
          </div>
        )}

        {rt === "H" && (
          <div className="grid grid-cols-2 gap-4">
            {num("base_order_size", `기본주문 base_order_size (${quoteOf(form.symbol)})`, { term: "martingale" })}
            {num("safety_order_size", `세이프티주문 safety_order_size (${quoteOf(form.symbol)})`, { term: "safety_order" })}
            {num("price_deviation", "가격 편차 price_deviation (%)", { hint: "세이프티 주문 간 하락 간격" })}
            {num("max_safety_orders", "최대 세이프티 max_safety_orders", { step: "1" })}
            {num("safety_order_step_scale", "간격 배율 step_scale")}
            {num("safety_order_volume_scale", "수량 배율 volume_scale")}
            {num("take_profit", "익절률 take_profit (%)", { hint: "평단 기준 익절" })}
            {cap}
            <div className="col-span-2 text-xs text-amber-600">stop_loss는 평단가 기준으로 적용됩니다. 총 소요자금이 (초기자본 × 투입비율)을 넘으면 저장이 반려돼요.</div>
          </div>
        )}

        {rt === "I" && (
          <div className="grid grid-cols-2 gap-4">
            {num("k", "변동성 계수 k", { term: "volatility_breakout" })}
            {sel("exit_mode", "청산 방식 exit_mode", [{ value: "next_open", label: "다음 봉 시가" }, { value: "trailing", label: "트레일링" }, { value: "take_profit", label: "익절" }])}
            {num("trail_percent", "추적 폭 trail_percent (%)", { term: "trail_percent", hint: "exit_mode=trailing일 때" })}
            {num("take_profit", "익절률 take_profit (%)", { hint: "exit_mode=take_profit일 때" })}
            {num("ma_filter_period", "이평 필터 ma_filter_period", { step: "1", hint: "비우면 미사용" })}
            {num("session_start_hour", "세션 시작시각 session_start_hour", { step: "1" })}
            {cap}
            <div className="col-span-2 text-xs text-slate-500">내부적으로 봉 단위 데이터로 전일 변동폭을 계산합니다.</div>
          </div>
        )}

        {rt === "J" && (
          <div className="grid grid-cols-2 gap-4">
            {sel("ma_type", "이평 종류 ma_type", [{ value: "SMA", label: "단순(SMA)" }, { value: "EMA", label: "지수(EMA)" }], { term: "ma_cross" })}
            {num("confirm_candles", "확정 봉수 confirm_candles", { step: "1" })}
            {num("fast_period", "단기 fast_period", { step: "1" })}
            {num("slow_period", "장기 slow_period", { step: "1" })}
            {sel("exit_signal", "청산 신호 exit_signal", [{ value: "dead_cross", label: "데드크로스" }, { value: "take_profit", label: "익절" }, { value: "both", label: "둘 중 먼저" }])}
            {num("take_profit", "익절률 take_profit (%)", { hint: "exit_signal 익절/both일 때" })}
            {cap}
          </div>
        )}
      </div>

      {/* common risk */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="text-sm font-semibold text-slate-500">공통 리스크 관리</div>
        <div className="grid grid-cols-2 gap-4">
          {num("invest_ratio_pct", "자금 투입 비율 invest_ratio (%)", { term: "invest_ratio", hint: "한 번에 자금의 몇 %를 투입할지" })}
          <Field label="손절률 stop_loss (%)" term="stop_loss" hint={isShort && (rt === "A" || rt === "B") ? "숏은 손절 필수" : "미사용 시 체크 해제"}>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.use_stop_loss} disabled={isShort && (rt === "A" || rt === "B")} onChange={setChk("use_stop_loss")} />
              <input className={inputCls} type="number" value={form.stop_loss_pct} disabled={!form.use_stop_loss} onChange={set("stop_loss_pct")} />
            </div>
          </Field>
        </div>
      </div>

      {/* advanced common risk. For DCA (rule C) the time-based holding/cooldown
          controls don't apply (buy-and-accumulate, no round-trip exits), so they
          are disabled with a note; 일일 최대손실 still works (halts buys for the day). */}
      {(() => {
        const isDca = rt === "C";
        return (
          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="text-sm font-semibold text-slate-500 cursor-pointer">공통 리스크 관리 (고급)</summary>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <Field label="일일 최대손실 (%)" term="daily_max_loss" hint={isDca ? "도달 시 당일 추가 매수 중단" : "도달 시 당일 거래 중단"}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.use_daily_max_loss} onChange={setChk("use_daily_max_loss")} />
                  <input className={inputCls} type="number" value={form.daily_max_loss_pct} disabled={!form.use_daily_max_loss} onChange={set("daily_max_loss_pct")} />
                </div>
              </Field>
              <Field label="최대 보유시간 (h)" term="max_holding" hint={isDca ? "DCA(누적 매수)에는 미적용" : "초과 시 강제 청산"}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!isDca && form.use_max_holding} disabled={isDca} onChange={setChk("use_max_holding")} />
                  <input className={inputCls} type="number" value={form.max_holding_hours} disabled={isDca || !form.use_max_holding} onChange={set("max_holding_hours")} />
                </div>
              </Field>
              {isDca ? (
                <Field label="재진입 금지 (분)" term="cooldown" hint="DCA(누적 매수)에는 미적용">
                  <input className={inputCls} type="number" value={form.cooldown_minutes} disabled onChange={set("cooldown_minutes")} />
                </Field>
              ) : (
                num("cooldown_minutes", "재진입 금지 (분)", { term: "cooldown", hint: "손절 후 쿨다운" })
              )}
            </div>
            {isDca && (
              <div className="mt-3 text-xs text-slate-500">
                ※ DCA 전략은 매수 후 계속 보유하는 방식이라 <b>최대 보유시간·재진입 금지</b>는 적용되지 않아요. 익절/청산이 있는 전략(A·B·E~J)에서 동작합니다.
              </div>
            )}
          </details>
        );
      })()}

      {/* fees */}
      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="text-sm font-semibold text-slate-500 cursor-pointer">
          수수료 · 슬리피지 · 펀딩비 (고급)
        </summary>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {num("commission_pct", "수수료 (%)", { term: "commission", step: "0.01" })}
          {num("slippage_pct", "슬리피지 (%)", { term: "slippage", step: "0.01" })}
          {num("funding_pct", "펀딩비/일 (숏, %)", { step: "0.01" })}
        </div>
      </details>
    </div>
  );
}
