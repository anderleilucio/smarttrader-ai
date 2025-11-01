// pages/api/quote.js
export default async function handler(req, res) {
  const { symbol = "" } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const mapBR = (s) => (/\d$/.test(s) ? `${s}.SA` : s); // ITUB4->ITUB4.SA
  const finnhubKey = process.env.FINNHUB_KEY;

  try {
    if (finnhubKey) {
      const sym = mapBR(symbol.toUpperCase());
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("finnhub quote error");
      const j = await r.json(); // { c: current, pc: previous close }
      const px = Number(j.c ?? 0);
      const pc = Number(j.pc ?? 0) || px;
      const chg = pc ? (px - pc) / pc : 0;
      return res.status(200).json({ px, chg });
    }
    // --- fallback sem chave ---
    const base = 100 + Math.random() * 200;
    return res.status(200).json({ px: Number(base.toFixed(2)), chg: (Math.random() - 0.5) / 50 });
  } catch (e) {
    // fallback de emergência
    const base = 100 + Math.random() * 200;
    return res.status(200).json({ px: Number(base.toFixed(2)), chg: (Math.random() - 0.5) / 50 });
  }
}
