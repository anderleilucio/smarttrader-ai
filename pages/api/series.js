// pages/api/series.js
function tfToFinnhub(tf) {
  // resoluções permitidas: 1,5,15,30,60,D
  switch (tf) {
    case "1m":  return { res: 1,   lookbackMin: 15 };          // ~15 min
    case "1h":  return { res: 1,   lookbackMin: 120 };         // ~2 h (1m candles)
    case "5h":  return { res: 5,   lookbackMin: 600 };         // ~10 h (5m candles)
    case "12h": return { res: 15,  lookbackMin: 12 * 60 };     // 12 h (15m)
    case "24h": return { res: 30,  lookbackMin: 24 * 60 };     // 24 h (30m)
    case "1w":  return { res: 60,  lookbackMin: 7 * 24 * 60 }; // 1 semana (1h)
    case "1mo": return { res: "D", lookbackDays: 32 };
    case "2mo": return { res: "D", lookbackDays: 70 };
    case "3mo": return { res: "D", lookbackDays: 95 };
    case "ytd": return { res: "D", ytd: true };
    default:    return { res: 30,  lookbackMin: 24 * 60 };
  }
}

const clampLen = (arr, n = 120) => arr.slice(-n);

export default async function handler(req, res) {
  const { symbol = "", tf = "24h" } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const mapBR = (s) => (/\d$/.test(s) ? `${s}.SA` : s);
  const finnhubKey = process.env.FINNHUB_KEY;

  try {
    if (finnhubKey) {
      const { res: resolution, lookbackMin, lookbackDays, ytd } = tfToFinnhub(tf);
      const nowSec = Math.floor(Date.now() / 1000);

      let fromSec;
      if (ytd) {
        const y0 = Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000;
        fromSec = y0;
      } else if (lookbackDays) {
        fromSec = nowSec - lookbackDays * 86400;
      } else {
        fromSec = nowSec - (lookbackMin || 60) * 60;
      }

      const sym = mapBR(symbol.toUpperCase());
      const url =
        `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}` +
        `&resolution=${resolution}&from=${fromSec}&to=${nowSec}&token=${finnhubKey}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`finnhub series http ${r.status}`);

      const j = await r.json(); // { s:'ok'|'no_data', t:[], c:[] ... }
      if (j.s !== "ok" || !Array.isArray(j.t) || !Array.isArray(j.c)) {
        throw new Error("no_data");
      }

      // Filtra pontos inválidos e garante alinhamento/ordem
      const outT = [];
      const outC = [];
      for (let i = 0; i < Math.min(j.t.length, j.c.length); i++) {
        const t = Number(j.t[i]);
        const c = Number(j.c[i]);
        if (!Number.isFinite(t) || !Number.isFinite(c)) continue;
        outT.push(t);
        outC.push(c);
      }

      // Ordena por tempo (por segurança)
      const idx = outT.map((t, i) => [t, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
      const tSorted = idx.map((i) => outT[i]);
      const cSorted = idx.map((i) => outC[i]);

      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(200).json({
        t: clampLen(tSorted, 120),
        c: clampLen(cSorted, 120),
      });
    }

    // ------- Fallback (sem chave): random walk coerente -------
    const n = 60;
    const now = Math.floor(Date.now() / 1000);
    const tick = 60; // 1 min
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * tick);
    const c = [];
    let v = 100 + Math.random() * 100;
    for (let i = 0; i < n; i++) {
      v = v * (1 + (Math.random() - 0.5) / 100);
      c.push(Number(v.toFixed(2)));
    }
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({ t, c });
  } catch (e) {
    // ------- Fallback de emergência -------
    const n = 30;
    const now = Math.floor(Date.now() / 1000);
    const tick = 60;
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * tick);
    const c = [];
    let v = 100 + Math.random() * 50;
    for (let i = 0; i < n; i++) {
      v = v * (1 + (Math.random() - 0.5) / 120);
      c.push(Number(v.toFixed(2)));
    }
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({ t, c });
  }
}
