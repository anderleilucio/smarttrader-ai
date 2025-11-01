// pages/api/series.js
function tfToFinnhub(tf) {
  // Finnhub resoluções: 1,5,15,30,60, D, W, M
  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  switch (tf) {
    case "1D":  return { res: 1,  from: now - oneDay };          // 1 dia intraday (1m)
    case "1W":  return { res: 5,  from: now - 7 * oneDay };      // 1 semana (5m)
    case "1M":  return { res: 30, from: now - 30 * oneDay };     // 1 mês (30m)
    case "3M":  return { res: 60, from: now - 90 * oneDay };     // 3 meses (60m)
    case "1Y":  return { res: "D", from: now - 365 * oneDay };   // 1 ano (diário)
    case "5Y":  return { res: "W", from: now - 5 * 365 * oneDay };// 5 anos (semanal)
    case "MAX": return { res: "M", from: 946684800 };            // desde 2000-01-01 (mensal)
    default:    return { res: 1,  from: now - oneDay };
  }
}

const clampLen = (arr, n = 1200) => arr.slice(-n); // deixa bastante pontos para 1D/1W

export default async function handler(req, res) {
  const { symbol = "", tf = "1D" } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const mapBR = s => (/\d$/.test(s) ? `${s}.SA` : s);
  const finnhubKey = process.env.FINNHUB_KEY;

  try {
    if (finnhubKey) {
      const { res: resolution, from } = tfToFinnhub(tf);
      const to = Math.floor(Date.now() / 1000);

      const sym = mapBR(symbol.toUpperCase());
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${resolution}&from=${from}&to=${to}&token=${finnhubKey}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("finnhub series error");
      const j = await r.json(); // { t:[], c:[], s:"ok" }
      if (j.s !== "ok" || !Array.isArray(j.t) || !Array.isArray(j.c)) throw new Error("no data");

      return res.status(200).json({
        t: clampLen(j.t.map(x => Number(x))),
        c: clampLen(j.c.map(x => Number(x))),
      });
    }

    // fallback (sem chave): curva aleatória coerente
    const n = 240, tick = 60, now = Math.floor(Date.now() / 1000);
    const c = [100 + Math.random() * 50];
    for (let i = 1; i < n; i++) c.push(c[i - 1] * (1 + (Math.random() - 0.5) / 200));
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * tick);
    return res.status(200).json({ t, c });
  } catch {
    const n = 120, tick = 60, now = Math.floor(Date.now() / 1000);
    const c = [100 + Math.random() * 50];
    for (let i = 1; i < n; i++) c.push(c[i - 1] * (1 + (Math.random() - 0.5) / 250));
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * tick);
    return res.status(200).json({ t, c });
  }
}
