// pages/api/series.js
// Devolve série histórica para o gráfico: { t:[], c:[] }

export default async function handler(req, res) {
  try {
    const { symbol, tf = "24h" } = req.query;

    if (!symbol) {
      res.status(400).json({ error: "Missing symbol" });
      return;
    }

    const apiKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY;
    const useFake = !apiKey; // se não tiver key, gera série fake

    const tfToken = String(tf).toLowerCase();

    // === 1) Mapeia timeframe para janela/resolution (em segundos) ===
    const nowSec = Math.floor(Date.now() / 1000);
    let fromSec = nowSec - 24 * 60 * 60; // fallback: 1D
    let resolution = 5;                  // em minutos (padrão Finnhub)

    switch (tfToken) {
      case "1m": // últimos ~60 minutos
        fromSec = nowSec - 60 * 60;
        resolution = 1;
        break;
      case "24h":
      case "1d":
        fromSec = nowSec - 24 * 60 * 60;
        resolution = 5;
        break;
      case "1w":
        fromSec = nowSec - 7 * 24 * 60 * 60;
        resolution = 15;
        break;
      case "1mo":
        fromSec = nowSec - 30 * 24 * 60 * 60;
        resolution = 60;
        break;
      case "2mo":
        fromSec = nowSec - 60 * 24 * 60 * 60;
        resolution = 60;
        break;
      case "3mo":
        fromSec = nowSec - 90 * 24 * 60 * 60;
        resolution = 60;
        break;
      case "ytd":
        // do começo do ano até agora
        const yearStart = new Date();
        yearStart.setUTCMonth(0, 1);
        yearStart.setUTCHours(0, 0, 0, 0);
        fromSec = Math.floor(yearStart.getTime() / 1000);
        resolution = 60 * 24; // diário
        break;
      default:
        // qualquer outra coisa: 3 meses diário
        fromSec = nowSec - 90 * 24 * 60 * 60;
        resolution = 60 * 24;
        break;
    }

    // === 2) Se não tiver API key, devolve série fake (o front aceita) ===
    if (useFake) {
      const points = 300;
      const t = [];
      const c = [];
      const span = nowSec - fromSec;
      const step = Math.max(1, Math.floor(span / points));
      let last = 100 + Math.random() * 100;
      for (let i = 0; i < points; i++) {
        const ts = fromSec + i * step;
        last = last * (1 + (Math.random() - 0.5) / 50); // +/-1%
        t.push(ts);
        c.push(Number(last.toFixed(2)));
      }
      res.status(200).json({ t, c });
      return;
    }

    // === 3) Monta o símbolo para Finnhub (B3 ganha .SA) ===
    function mapSymbol(sym) {
      const s = String(sym).toUpperCase();
      if (/\d$/.test(s)) return s + ".SA"; // ITUB4 -> ITUB4.SA
      return s;
    }

    const finnhubSymbol = mapSymbol(symbol);

    const url =
      "https://finnhub.io/api/v1/stock/candle" +
      `?symbol=${encodeURIComponent(finnhubSymbol)}` +
      `&resolution=${encodeURIComponent(resolution)}` +
      `&from=${fromSec}` +
      `&to=${nowSec}` +
      `&token=${encodeURIComponent(apiKey)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      // se a API falhar, devolve vazio (front gera fallback bonitinho)
      res.status(200).json({ t: [], c: [] });
      return;
    }

    const data = await resp.json();
    // Finnhub responde { s:"ok"|"no_data", t:[...], c:[...] }
    if (!data || data.s !== "ok" || !Array.isArray(data.t) || !Array.isArray(data.c)) {
      res.status(200).json({ t: [], c: [] });
      return;
    }

    // Limitamos a HISTORY_LEN no front, mas já cortamos aqui também por via das dúvidas
    const HISTORY_LEN = 1200;
    const t = data.t.slice(-HISTORY_LEN);
    const c = data.c.slice(-HISTORY_LEN);

    res.status(200).json({ t, c });
  } catch (err) {
    console.error("Error in /api/series:", err);
    // em último caso manda vazio (front faz fallback)
    res.status(200).json({ t: [], c: [] });
  }
}
