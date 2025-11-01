// pages/api/series.js
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  const sym = (req.query.symbol || '').toString().trim().toUpperCase();
  const tf  = (req.query.tf || '1m').toString();

  if (!sym) return res.status(400).json({ error: 'symbol required', points: [] });

  const isBR = /\d$/.test(sym);
  try {
    if (isBR) {
      // --- B3 via Brapi (histórico diário). Para intraday, Brapi é limitado; usamos diário.
      // Usamos range conforme tf. (fallback para 1-3 meses/YTD)
      let range  = '1mo', interval = '1d';
      if (tf === '1m' || tf === '5m' || tf === '1h' || tf === '5h' || tf === '12h' || tf === '24h') {
        range = '1mo'; interval = '1d';
      } else if (tf === '1w') {
        range = '1mo'; interval = '1d';
      } else if (tf === '1mo') {
        range = '1mo'; interval = '1d';
      } else if (tf === '2mo') {
        range = '2mo'; interval = '1d';
      } else if (tf === '3mo') {
        range = '3mo'; interval = '1d';
      } else if (tf === 'YTD') {
        range = '6mo'; interval = '1d';
      }

      const url = `https://brapi.dev/api/quote/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
      const r   = await fetch(url, { cache: 'no-store' });
      const j   = await r.json();
      const it  = (j?.results || [])[0] || {};
      const hist = it?.historicalDataPrice || [];
      const points = hist.map(h => (typeof h.close === 'number' ? h.close : h.price)).filter(v => isFinite(v));
      return res.status(200).json({ points });
    } else {
      // --- EUA via Finnhub (intraday quando possível)
      const token = process.env.FINNHUB_KEY || '';
      if (!token) return res.status(200).json({ points: [] });

      // define resolução e período por tf
      // resoluções finnhub: 1,5,15,30,60, D, W, M
      let resolution = '1';
      let lookbackSec = 60 * 60 * 2; // 2h default
      if (tf === '1m')  { resolution = '1';   lookbackSec = 60*60*2; }
      if (tf === '5m')  { resolution = '5';   lookbackSec = 60*60*6; }
      if (tf === '1h')  { resolution = '15';  lookbackSec = 60*60*24; }
      if (tf === '5h')  { resolution = '30';  lookbackSec = 60*60*36; }
      if (tf === '12h') { resolution = '60';  lookbackSec = 60*60*48; }
      if (tf === '24h') { resolution = '60';  lookbackSec = 60*60*72; }
      if (tf === '1w')  { resolution = '60';  lookbackSec = 60*60*24*7; }
      if (tf === '1mo' || tf === '2mo' || tf === '3mo' || tf === 'YTD') {
        resolution = 'D';
        lookbackSec = tf === '1mo' ? 60*60*24*35
                     : tf === '2mo' ? 60*60*24*70
                     : tf === '3mo' ? 60*60*24*105
                     : 60*60*24*200; // YTD ~200d
      }

      const now = Math.floor(Date.now()/1000);
      const from = now - lookbackSec;
      const url  = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${resolution}&from=${from}&to=${now}&token=${token}`;
      const r    = await fetch(url, { cache: 'no-store' });
      const j    = await r.json();
      if (j?.s !== 'ok') return res.status(200).json({ points: [] });

      // usa fechamento (c)
      const points = (j.c || []).filter(v => isFinite(v));
      return res.status(200).json({ points });
    }
  } catch (e) {
    return res.status(200).json({ points: [], error: String(e?.message || e) });
  }
}
