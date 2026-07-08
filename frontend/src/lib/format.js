// Money/price/quantity formatting.
//
// Unit basis (from the engine logic): prices come from Binance quoted in the
// symbol's QUOTE asset (USDT for *USDT pairs). qty = capital / price, so all
// money amounts (initial_capital, equity, amount_per_buy) are denominated in
// that quote currency — i.e. USDT (≈ USD), NOT KRW. `qty` is a COIN COUNT.

const QUOTES = ["USDT", "BUSD", "USDC", "FDUSD", "TUSD", "USD"];

export function quoteOf(symbol) {
  const s = (symbol || "").toUpperCase();
  for (const q of QUOTES) if (s.endsWith(q)) return q;
  return "USDT";
}

export function baseOf(symbol) {
  const s = (symbol || "").toUpperCase();
  const q = quoteOf(s);
  return s.endsWith(q) ? s.slice(0, -q.length) : s;
}

// Price: keep enough significant decimals for sub-cent coins (VANRY ~0.0077).
export function fmtPrice(p) {
  const n = Number(p);
  if (!isFinite(n)) return String(p);
  const abs = Math.abs(n);
  let dp;
  if (abs >= 1000) dp = 2;
  else if (abs >= 1) dp = 4;
  else if (abs >= 0.01) dp = 5;
  else if (abs >= 0.0001) dp = 6;
  else dp = 8;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: dp });
}

// Money amount + quote unit, e.g. "1,000,000 USDT".
export function fmtMoney(value, symbol) {
  const n = Number(value);
  const q = quoteOf(symbol);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${q}`;
}

// Compact money for tight stat boxes: large amounts abbreviate to K/M/B so the
// value never overflows its card. Pair with a `title` of the exact fmtMoney
// value so the precise number stays available on hover.
export function fmtMoneyCompact(value, symbol) {
  const n = Number(value);
  const q = quoteOf(symbol);
  if (!isFinite(n)) return `${value} ${q}`;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e9) s = `${(n / 1e9).toFixed(2)}B`;
  else if (abs >= 1e6) s = `${(n / 1e6).toFixed(2)}M`;
  else s = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${s} ${q}`;
}

// Coin quantity (with the coin ticker), e.g. "130,396,720.22 VANRY".
export function fmtQty(qty, symbol) {
  const n = Number(qty);
  const abs = Math.abs(n);
  const dp = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  const num = n.toLocaleString("en-US", { maximumFractionDigits: dp });
  return symbol ? `${num} ${baseOf(symbol)}` : num;
}
