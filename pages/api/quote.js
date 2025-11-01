// /pages/api/quote.js
export default async function handler(req, res) {
  if (req.method !== 'GET') return noStore(res, 405, { error: 'method not allowed' });

  const symRaw = (req.query.symbol || '').toString().trim().toUpperCase();
  if (!symRaw) return noStore(res, 400, { error: 'symbol required' });

  const FINNHUB_KEY = process.env.FINNHUB_KEY || '';
  const isBR = /\d$/.test(symRaw); // VALE3, PETR4, ITUB4 etc.

  let px = null, chg = 0;

  try {
    if (isBR) {
      // Brasil — brapi.dev (sem chave)
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(symRaw)}?range=1d&interval=1m`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`brapi ${r.status}`);
      const j = await r.json();

      const it = (j?.results ?? [])[0] || {};
      px = it.regularMarketPrice ?? it.price ?? it.close ?? null;
      const prev = it.regularMarketPreviousClose ?? it.previousClose ?? it.open ?? null;
      chg = (px != null && prev) ? (px / prev - 1) : 0;
    } else {
      // EUA — Finnhub
      if (!FINNHUB_KEY) throw new Error('FINNHUB_KEY missing');
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symRaw)}&token=${FINNHUB_KEY}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`finnhub ${r.status}`);
      const j = await r.json();
      px = j?.c ?? null;
      const prev = j?.pc ?? null;
      chg = (px != null && prev) ? (px / prev - 1) : 0;
    }

    if (!isFinite(px)) px = null;
    if (!isFinite(chg)) chg = 0;

    return noStore(res, 200, { px, chg });
  } catch (err) {
    return noStore(res, 200, { px: null, chg: 0, error: String(err?.message || err) });
  }
}

function noStore(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');
  res.status(status).json(body);
}
