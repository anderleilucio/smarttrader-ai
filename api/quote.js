// Vercel Serverless Function: /api/quote?symbol=TSLA  |  /api/quote?symbol=VALE3
// Retorna: { px: number, chg: number }  (chg é fração: 0.012 = +1.2%)

export default async function handler(req, res) {
  // ---- Regras/defesas básicas ----
  if (req.method !== 'GET') {
    setNoStore(res);
    return res.status(405).json({ error: 'method not allowed' });
  }

  const symRaw = (req.query.symbol || '').toString().trim().toUpperCase();
  if (!symRaw) {
    setNoStore(res);
    return res.status(400).json({ error: 'symbol required' });
  }

  const FINNHUB_KEY = process.env.FINNHUB_KEY || '';
  const isBR = /\d$/.test(symRaw); // termina com dígito? (VALE3, PETR4, ITUB4...)

  let px = null;
  let chg = 0;

  try {
    if (isBR) {
      // -------- Brasil via brapi.dev (sem chave) --------
      // Doc: https://brapi.dev/docs
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(symRaw)}?range=1d&interval=1m`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`brapi ${r.status}`);
      const j = await r.json();

      const it = (j?.results ?? [])[0] || {};
      // Tente regularMarketPrice; caia para price/close se necessário
      px = it.regularMarketPrice ?? it.price ?? it.close ?? null;

      // variação em fração: (price/prevClose) - 1
      const prev = it.regularMarketPreviousClose ?? it.previousClose ?? it.open ?? null;
      chg = (px != null && prev) ? (px / prev - 1) : 0;
    } else {
      // -------- EUA via Finnhub --------
      // Doc: https://finnhub.io/docs/api/quote
      if (!FINNHUB_KEY) throw new Error('FINNHUB_KEY missing');
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symRaw)}&token=${FINNHUB_KEY}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`finnhub ${r.status}`);
      const j = await r.json();

      // c = current, pc = previous close
      px = j?.c ?? null;
      const prev = j?.pc ?? null;
      chg = (px != null && prev) ? (px / prev - 1) : 0;
    }

    // Fallback defensivo
    if (!isFinite(px)) px = null;
    if (!isFinite(chg)) chg = 0;

    // ---- Resposta sem cache (CDN + browser) ----
    setNoStore(res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({ px, chg });
  } catch (err) {
    // Erro, mas também sem cache
    setNoStore(res);
    return res.status(200).json({ px: null, chg: 0, error: String(err?.message || err) });
  }
}

// Desliga cache em todos os níveis (browser + edge/CDN da Vercel)
function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  // opcional: evita indexação desse endpoint
  res.setHeader('x-robots-tag', 'noindex');
}
