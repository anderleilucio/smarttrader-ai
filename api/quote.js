// Vercel Serverless Function: /api/quote?symbol=TSLA  |  /api/quote?symbol=VALE3
export default async function handler(req, res) {
  try {
    const symRaw = (req.query.symbol || "").toString().trim().toUpperCase();
    if (!symRaw) return res.status(400).json({ error: "symbol required" });

    const isBR = /\d$/.test(symRaw); // VALE3, PETR4, ITUB4...
    const FINNHUB_KEY = process.env.FINNHUB_KEY || ""; // adicionado no Passo 2

    let px = null, chg = 0;

    if (isBR) {
      // Brasil via brapi.dev (sem chave)
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(symRaw)}?range=1d&interval=1m`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`brapi ${r.status}`);
      const j = await r.json();
      const r0 = j?.results?.[0] || {};
      px  = r0.regularMarketPrice ?? r0.close ?? r0.price ?? null;
      chg = (r0.regularMarketChangePercent ?? 0) / 100;
    } else {
      // EUA via Finnhub (usa KEY do ambiente)
      if (!FINNHUB_KEY) throw new Error("FINNHUB_KEY missing");
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symRaw)}&token=${FINNHUB_KEY}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`finnhub ${r.status}`);
      const j = await r.json();
      px  = j?.c ?? null;
      chg = (px && j?.pc) ? (px / j.pc - 1) : 0;
    }

    if (!px || !isFinite(px)) return res.status(404).json({ error: "not_found", symbol: symRaw });

    // cache leve pra aliviar chamadas (5s)
    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=10");
    return res.status(200).json({ symbol: symRaw, px, chg });
  } catch (e) {
    return res.status(500).json({ error: e.message || "internal_error" });
  }
}
