// Approximate USD→KRW rate, shared across the app.
//
// Amounts in this app are denominated in USDT (≈ USD). This hook fetches a
// rough USD→KRW rate once (module-cached, shared by every component that calls
// it) so the UI can show a convenient 원화 reference next to USDT figures.
// It is a REFERENCE ONLY — never a quote — and degrades to a fallback constant
// when the FX source is unavailable.
import { useEffect, useState } from "react";
import { api } from "../api.js";

const FALLBACK_RATE = 1380; // mirrors the backend KIMCHI_FX_FALLBACK default
const TTL_MS = 5 * 60 * 1000; // re-fetch at most every 5 minutes

let _cache = null; // { rate, isFallback, at }
let _inflight = null;

async function load() {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache;
  if (!_inflight) {
    _inflight = api
      .usdKrw()
      .then((d) => {
        const rate = Number(d && d.usdkrw);
        _cache = {
          rate: isFinite(rate) && rate > 0 ? rate : FALLBACK_RATE,
          isFallback: !!(d && d.is_fallback) || !(isFinite(rate) && rate > 0),
          at: Date.now(),
        };
        return _cache;
      })
      .catch(() => {
        _cache = { rate: FALLBACK_RATE, isFallback: true, at: Date.now() };
        return _cache;
      })
      .finally(() => {
        _inflight = null;
      });
  }
  return _inflight;
}

// Returns { rate, isFallback }. Starts from any cached value (or the fallback)
// and updates once the fetch resolves.
export function useUsdKrw() {
  const [state, setState] = useState(_cache || { rate: FALLBACK_RATE, isFallback: true });
  useEffect(() => {
    let alive = true;
    load().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
