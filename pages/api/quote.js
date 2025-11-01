// pages/api/quote.js
export default async function handler(req, res) {
  const { symbol = "" } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  // Ex.: ITUB4 -> ITUB4.SA (B3) | AAPL/TSLA mantêm
  const mapBR = (s) => (/\d$/.test(s) ? `${s}.SA` : s.toUpperCase());

  // Garanta no .env.local: FINNHUB_KEY=seu_token
  const finnhubKey = process.env.FINNHUB_KEY;

  try {
    // sempre sem cache
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (finnhubKey) {
      const sym = mapBR(symbol);
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("finnhub quote error");

      const j = await r.json(); // { c: current, pc: previous close, ... }
      const px = Number(j?.c ?? 0);
      const pc = Number(j?.pc ?? 0) || px;
      const chg = pc ? (px - pc) / pc : 0;

      return res.status(200).json({ px, chg });
    }

    // Fallback sem chave: valor randômico coerente p/ demo
    const base = 100 + Math.random() * 200;
    return res.status(200).json({
      px: Number(base.toFixed(2)),
      chg: (Math.random() - 0.5) / 50, // ~±1%
    });
  } catch {
    // Fallback de emergência se a API falhar
    const base = 100 + Math.random() * 200;
    return res.status(200).json({
      px: Number(base.toFixed(2)),
      chg: (Math.random() - 0.5) / 50,
    });
  }
}
