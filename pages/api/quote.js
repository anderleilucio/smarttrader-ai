// pages/api/quote.js
// GET /api/quote?symbol=TSLA   |   /api/quote?symbol=VALE3
// Resposta: { px: number|null, chg: number }   // chg em fração (ex.: 0.012 = +1.2%)

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      setNoStore(res);
      return res.status(405).json({ error: "method not allowed" });
    }

    const symRaw = String(req.query.symbol || "").trim().toUpperCase();
    if (!symRaw) {
      setNoStore(res);
      return res.status(400).json({ error: "symbol required" });
    }

    const FINNHUB_KEY = process.env.FINNHUB_KEY || "";
    const isBR = /\d$/.test(symRaw); // termina com dígito? (VALE3, PETR4, ITUB4...)

    let px = null;
    let chg = 0;

    if (isBR) {
      // -------- Brasil via brapi.dev (sem chave) --------
      // Doc: https://brapi.dev/docs
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(symRaw)}?range=1d&interval=1m`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`brapi ${r.status}`);
      const j = safeJson(await r.text());

      const it = (j && Array.isArray(j.results) ? j.results[0] : null) || {};
      // preço atual (ordem de preferência)
      px = coerceNum(it.regularMarketPrice ?? it.price ?? it.close);
      // fechamento anterior / preço de referência
      const prev = coerceNum(it.regularMarketPreviousClose ?? it.previousClose ?? it.open);

      chg = isFiniteNum(px) && isFiniteNum(prev) && prev !== 0 ? px / prev - 1 : 0;
    } else {
      // -------- EUA via Finnhub --------
      // Doc: https://finnhub.io/docs/api/quote
      if (!FINNHUB_KEY) throw new Error("FINNHUB_KEY missing");
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symRaw)}&token=${FINNHUB_KEY}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`finnhub ${r.status}`);
      const j = safeJson(await r.text());

      // c = current, pc = previous close
      px = coerceNum(j?.c);
      const prev = coerceNum(j?.pc);
      chg = isFiniteNum(px) && isFiniteNum(prev) && prev !== 0 ? px / prev - 1 : 0;
    }

    // Fallback defensivo
    if (!isFiniteNum(px)) px = null;
    if (!isFiniteNum(chg)) chg = 0;

    setNoStore(res);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({ px, chg });
  } catch (err) {
    setNoStore(res);
    return res
      .status(200) // mantém 200 para a UI não quebrar
      .json({ px: null, chg: 0, error: String(err?.message || err) });
  }
}

/* ---------------- helpers ---------------- */

function setNoStore(res) {
  // desliga cache no browser e na CDN da Vercel
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("x-robots-tag", "noindex");
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

function coerceNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
