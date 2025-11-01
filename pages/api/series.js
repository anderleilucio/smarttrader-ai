// pages/api/series.js
function tfToFinnhub(tf) {
  // resolução: 1 (1m), 5, 15, 30, 60, D
  switch (tf) {
    case "1m":  return { res: 1,   lookbackMin: 15 };
    case "1h":  return { res: 1,   lookbackMin: 120 };
    case "5h":  return { res: 5,   lookbackMin: 600 };
    case "12h": return { res: 15,  lookbackMin: 12*60 };
    case "24h": return { res: 30,  lookbackMin: 24*60 };
    case "1w":  return { res: 60,  lookbackMin: 7*24*60 };
    case "1mo": return { res: "D", lookbackDays: 32 };
    case "2mo": return { res: "D", lookbackDays: 70 };
    case "3mo": return { res: "D", lookbackDays: 95 };
    case "ytd": return { res: "D", lookbackDays: 365 };
    default:    return { res: 30,  lookbackMin: 24*60 };
  }
}
const clampLen = (arr, n=120) => arr.slice(-n);

export default async function handler(req, res) {
  const { symbol = "", tf = "24h" } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const mapBR = (s) => (/\d$/.test(s) ? `${s}.SA` : s);
  const finnhubKey = process.env.FINNHUB_KEY;

  try {
    if (finnhubKey) {
      const { res: resolution, lookbackMin, lookbackDays } = tfToFinnhub(tf);
      const now = Math.floor(Date.now() / 1000);
      const from = lookbackDays
        ? now - lookbackDays * 86400
        : now - (lookbackMin || 60) * 60;

      const sym = mapBR(symbol.toUpperCase());
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${resolution}&from=${from}&to=${now}&token=${finnhubKey}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("finnhub series error");
      const j = await r.json(); // { t:[], c:[], s:"ok" }
      if (j.s !== "ok" || !Array.isArray(j.t) || !Array.isArray(j.c)) throw new Error("no data");

      // devolve já no formato esperado pelo front
      return res.status(200).json({
        t: clampLen(j.t.map((x) => (typeof x === "number" ? x : Number(x))), 120),
        c: clampLen(j.c.map((x) => Number(x)), 120),
      });
    }

    // --- fallback sem chave: random walk coerente ---
    const n = 60;
    const start = 100 + Math.random() * 100;
    const c = [start];
    for (let i = 1; i < n; i++) c.push(c[i-1] * (1 + (Math.random()-0.5)/100));
    const tick = 60; // 1min
    const now = Math.floor(Date.now() / 1000);
    const t = Array.from({length:n}, (_,i)=> now - (n-1-i)*tick);
    return res.status(200).json({ t, c });
  } catch (e) {
    // fallback de emergência
    const n = 30, start = 100 + Math.random()*50;
    const c = [start]; for (let i=1;i<n;i++) c.push(c[i-1]*(1+(Math.random()-0.5)/120));
    const tick=60, now=Math.floor(Date.now()/1000);
    const t = Array.from({length:n},(_,i)=> now-(n-1-i)*tick);
    return res.status(200).json({ t, c });
  }
}
