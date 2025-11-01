// pages/api/quote.js
export default async function handler(req, res) {
  // Aceita apenas GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");

  const raw = (req.query.symbol || "").toString().trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: "symbol required" });

  // ITUB4 -> ITUB4.SA (B3)
  const mapBR = (s) => (/\d$/.test(s) ? `${s}.SA` : s);
  const symbol = raw;
  const finnhubKey = process.env.FINNHUB_KEY;

  // helper de timeout
  async function fetchWithTimeout(url, ms = 6000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      return r;
    } finally {
      clearTimeout(id);
    }
  }

  try {
    if (finnhubKey) {
      const sym = mapBR(symbol);
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`;
      const r = await fetchWithTimeout(url);
      if (!r.ok) throw new Error(`finnhub quote error: ${r.status}`);
      const j = await r.json(); // esperado: { c, pc, t, ... }

      const px = Number(j?.c ?? 0);
      const pc = Number(j?.pc ?? 0) || px;
      const chg = pc ? (px - pc) / pc : 0;
      const ts = (Number(j?.t) || Math.floor(Date.now() / 1000)) * 1000;

      return res.status(200).json({
        symbol,
        provider: "finnhub",
        px: Number(px.toFixed(2)),
        chg: Number(chg.toFixed(6)), // fração (ex.: 0.0123 = +1.23%)
        ts,
      });
    }

    // ---------- Fallback sem chave ----------
    const simPx = 100 + Math.random() * 200;
    return res.status(200).json({
      symbol,
      provider: "simulated",
      px: Number(simPx.toFixed(2)),
      chg: Number(((Math.random() - 0.5) / 50).toFixed(6)),
      ts: Date.now(),
    });
  } catch (e) {
    // ---------- Fallback de emergência ----------
    const simPx = 100 + Math.random() * 200;
    return res.status(200).json({
      symbol,
      provider: "degraded",
      px: Number(simPx.toFixed(2)),
      chg: Number(((Math.random() - 0.5) / 50).toFixed(6)),
      ts: Date.now(),
      note: "fallback",
    });
  }
}
