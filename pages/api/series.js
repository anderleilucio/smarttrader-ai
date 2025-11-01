// pages/api/series.js
function tfToFinnhub(tf) {
  // Mapeia os TFs "tipo Robinhood" para resolução + lookback em segundos
  // Finnhub aceita: 1,5,15,30,60, D, W, M
  switch (String(tf || "").toUpperCase()) {
    case "1D":  // hoje intraday ~ 1min (ou 5min se quiser menos carga)
      return { res: 1,   lookbackSec: 60 * 60 * 24 };
    case "1W":  // última semana intraday ~ 5min
      return { res: 5,   lookbackSec: 60 * 60 * 24 * 7 };
    case "1M":  // último mês intraday ~ 30min
      return { res: 30,  lookbackSec: 60 * 60 * 24 * 32 };
    case "3M":  // 3 meses – diário
      return { res: "D", lookbackSec: 60 * 60 * 24 * 100 };
    case "1Y":  // 1 ano – diário
      return { res: "D", lookbackSec: 60 * 60 * 24 * 370 };
    case "5Y":  // 5 anos – semanal
      return { res: "W", lookbackSec: 60 * 60 * 24 * 370 * 5 };
    case "MAX": // máximo – mensal (reduz pontos)
      return { res: "M", lookbackSec: 60 * 60 * 24 * 370 * 20 };
    default:
      return { res: 30,  lookbackSec: 60 * 60 * 24 * 32 };
  }
}

const clampLen = (arr, n = 1200) => arr.slice(-n);

export default async function handler(req, res) {
  const { symbol = "", tf = "1D" } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const mapBR = (s) => (/\d$/.test(s) ? `${s}.SA` : s);
  const token  = process.env.FINNHUB_KEY;

  try {
    if (token) {
      const { res: resolution, lookbackSec } = tfToFinnhub(tf);
      const now  = Math.floor(Date.now() / 1000);
      const from = now - (lookbackSec || 60 * 60 * 24);

      const sym = mapBR(symbol.toUpperCase());
      const url =
        `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}` +
        `&resolution=${resolution}&from=${from}&to=${now}&token=${token}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("finnhub series error");
      const j = await r.json(); // { c, t, s }
      if (j.s !== "ok" || !Array.isArray(j.t) || !Array.isArray(j.c)) {
        throw new Error("no data");
      }

      // Garante números e ordenação
      const t = j.t.map(Number);
      const c = j.c.map(Number);

      return res.status(200).json({
        t: clampLen(t, 1200),
        c: clampLen(c, 1200),
      });
    }

    // --- fallback sem chave: random walk coerente ---
    const n = 300;
    const start = 100 + Math.random() * 100;
    const c = [start];
    for (let i = 1; i < n; i++) c.push(c[i - 1] * (1 + (Math.random() - 0.5) / 120));
    const step = 60; // 1 min
    const now  = Math.floor(Date.now() / 1000);
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * step);

    return res.status(200).json({ t, c });
  } catch (e) {
    // fallback de emergência
    const n = 180, start = 100 + Math.random() * 50;
    const c = [start]; for (let i = 1; i < n; i++) c.push(c[i - 1] * (1 + (Math.random() - 0.5) / 150));
    const step = 60, now = Math.floor(Date.now() / 1000);
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * step);
    return res.status(200).json({ t, c });
  }
}
