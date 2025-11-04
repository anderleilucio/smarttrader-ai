// pages/api/series.js

// Converte timeframe (do front) em parâmetros da Finnhub
function tfToFinnhub(tf) {
  const t = String(tf || "24h").toLowerCase();

  // intraday / curtos (tokens antigos, usados pelo front)
  if (t === "1m")   return { res: 1,   lookbackMin: 15 };       // 15 min em 1m
  if (t === "1h")   return { res: 1,   lookbackMin: 8 * 60 };   // ~1 dia em 1m
  if (t === "5h")   return { res: 5,   lookbackMin: 24 * 60 };  // 1 dia em 5m
  if (t === "12h")  return { res: 15,  lookbackMin: 24 * 60 };  // 1 dia em 15m

  // 1D / 24h (Robinhood 1D)
  if (t === "24h" || t === "1d") {
    return { res: 5, lookbackMin: 10 * 60 };                    // ~10h em 5m
  }

  // 1 semana (Robinhood 1W)
  if (t === "1w") {
    return { res: 30, lookbackDays: 7 };                        // 7 dias em 30m
  }

  // 1 mês (Robinhood 1M)
  if (t === "1mo" || t === "1mth") {
    return { res: 60, lookbackDays: 32 };                       // ~1 mês em 1h
  }

  // 2–3 meses (tokens antigos do front)
  if (t === "2mo") {
    return { res: "D", lookbackDays: 70 };                      // ~2 meses diário
  }
  if (t === "3mo") {
    return { res: "D", lookbackDays: 100 };                     // ~3 meses diário
  }

  // YTD / 1 ano / 5 anos / MAX (Robinhood)
  if (t === "ytd") {
    return { res: "D", lookbackDays: 365 };                     // ~1 ano
  }
  if (t === "1y") {
    return { res: "D", lookbackDays: 365 };                     // idem, 1 ano
  }
  if (t === "5y") {
    return { res: "D", lookbackDays: 365 * 5 };                 // ~5 anos
  }
  if (t === "max") {
    return { res: "D", lookbackDays: 365 * 10 };                // até ~10 anos
  }

  // default: 1D
  return { res: 5, lookbackMin: 10 * 60 };
}

// mantém no máximo n candles
const clampLen = (arr, n = 1200) => arr.slice(-n);

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
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
        sym
      )}&resolution=${resolution}&from=${from}&to=${now}&token=${finnhubKey}`;

      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("finnhub series error");
      const j = await r.json(); // { t:[], c:[], s:"ok" }

      // se a API não retornar dados úteis, cai no fallback
      if (
        j.s !== "ok" ||
        !Array.isArray(j.t) ||
        !Array.isArray(j.c) ||
        j.t.length === 0 ||
        j.c.length === 0
      ) {
        throw new Error("no data");
      }

      return res.status(200).json({
        t: clampLen(
          j.t.map((x) => (typeof x === "number" ? x : Number(x))).filter(Number.isFinite),
          1200
        ),
        c: clampLen(
          j.c.map((x) => Number(x)).filter(Number.isFinite),
          1200
        ),
      });
    }

    // --- fallback sem chave (random walk coerente) ---
    const n = 300;
    const start = 100 + Math.random() * 100;
    const c = [start];
    for (let i = 1; i < n; i++) {
      c.push(c[i - 1] * (1 + (Math.random() - 0.5) / 80)); // variação suave
    }
    const tick = 60 * 15; // 15 min
    const now = Math.floor(Date.now() / 1000);
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * tick);
    return res.status(200).json({ t, c });
  } catch (e) {
    // --- fallback de emergência se a API falhar / símbolo estranho (GOLD, etc.) ---
    const n = 200;
    const start = 100 + Math.random() * 50;
    const c = [start];
    for (let i = 1; i < n; i++) {
      c.push(c[i - 1] * (1 + (Math.random() - 0.5) / 90));
    }
    const tick = 60 * 30; // 30 min
    const now = Math.floor(Date.now() / 1000);
    const t = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * tick);
    return res.status(200).json({ t, c });
  }
}
