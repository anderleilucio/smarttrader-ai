(function () {
  // ===== CONFIGURAÇÃO DO FEED =====
  const FINNHUB_KEY = "d42pb1hr01qorlesfdtgd42pb1hr01qorlesfdu0"; // sua key
  const USE_LIVE = true;                     // liga dados reais
  const LIVE_INTERVAL_MS = 5000;             // 5s

  // ===== Estado base =====
  var state = {
    active: "TSLA",
    data: {
      TSLA:  { px: 456.10, chg: 0.003,   series: [] },
      NVDA:  { px: 181.93, chg: 0.021,   series: [] },
      AAPL:  { px: 197.45, chg: -0.0082, series: [] },
      AMZN:  { px: 169.80, chg: 0.004,   series: [] },
      VALE3: { px: 62.35,  chg: 0.006,   series: [] },
      PETR4: { px: 39.20,  chg: -0.012,  series: [] },
    },
    positions: {}, // {SYM:{qty, avg}}
    alerts: [],    // {sym, cond, val}
  };

  // ===== Utils =====
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
  const isBR = (sym) => /\d$/.test(sym); // tickers BR terminam com número (VALE3, PETR4, ITUB4)

  const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const moneyFor = (sym, v) => (isBR(sym) ? brlFmt : usdFmt).format(v);

  document.title = "SmartTrader AI";

  // ===== Relógio UTC =====
  const clockUTC = () => new Date().toISOString().slice(11, 19) + "Z";
  const tickClock = () => { const el = $("clock"); if (el) el.textContent = "UTC — " + clockUTC(); };
  tickClock();
  setInterval(tickClock, 1000);

  // ===== Lista de tickers =====
  const list = $("list");
  function drawList(q) {
    if (!list) return;
    list.innerHTML = "";
    Object.keys(state.data)
      .filter((s) => !q || s.toLowerCase().includes(q.toLowerCase()))
      .forEach((sym) => {
        const d = state.data[sym];
        const row = document.createElement("div");
        row.className = "ticker";
        row.innerHTML =
          `<div><strong>${sym}</strong></div>` +
          `<div class="pct ${d.chg >= 0 ? "up" : "down"}">${fmt(d.chg)}</div>`;
        row.onclick = function () {
          state.active = sym;
          startLive();           // troca de ativo reinicia atualizações
          drawList($("q").value);
          refresh();
        };
        list.appendChild(row);
      });
  }

  const qinput = $("q");
  if (qinput) {
    qinput.addEventListener("input", (e) => drawList(e.target.value));
    // ENTER carrega um novo símbolo
    qinput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        loadSymbol(e.target.value);
      }
    });
  }

  // ===== Série inicial simulada =====
  const N = 120;
  Object.values(state.data).forEach((d) => {
    if (d.series.length === 0) {
      let x = d.px;
      for (let i = 0; i < N; i++) {
        x *= 1 + (Math.random() - 0.5) * 0.002;
        d.series.push(x);
      }
    }
  });

  // ===== Canvas (gráfico) =====
  const canvas = $("chart");
  const ctx = canvas ? canvas.getContext("2d") : null;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 260;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", () => { resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  function drawChart(sym) {
    if (!canvas || !ctx) return;
    const d = state.data[sym];
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    let min = Math.min(...d.series);
    let max = Math.max(...d.series);
    if (!isFinite(min) || !isFinite(max) || min === max) {
      min = (d.px || 0) - 1;
      max = (d.px || 0) + 1;
    }

    const xstep = W / Math.max(1, d.series.length - 1);
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#00ffa3";
    d.series.forEach((v, i) => {
      const x = i * xstep;
      const y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ===== Fetch de cotações reais =====
  async function fetchUSQuote(sym) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Erro Finnhub: " + r.status);
    const j = await r.json();
    const px = j.c;
    const chg = (px && j.pc) ? (px / j.pc - 1) : 0;
    return { px, chg };
  }

  async function fetchBRQuote(sym) {
    // brapi público (sem key) — ótimo para testes
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(sym)}?range=1d&interval=1m`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Erro brapi: " + r.status);
    const j = await r.json();
    const r0 = j.results && j.results[0];
    const px = r0?.regularMarketPrice ?? r0?.close ?? r0?.price;
    const chg = (r0?.regularMarketChangePercent ?? 0) / 100;
    return { px, chg };
  }

  async function fetchQuote(sym) {
    try {
      return isBR(sym) ? await fetchBRQuote(sym) : await fetchUSQuote(sym);
    } catch (e) {
      console.warn("Erro no fetchQuote", sym, e);
      const d = state.data[sym];
      return { px: d?.px ?? 0, chg: d?.chg ?? 0 };
    }
  }

  // ===== Busca dinâmica: carregar novo símbolo digitado =====
  async function loadSymbol(raw) {
    const sym = (raw || "").trim().toUpperCase();
    if (!sym) return;

    // busca cotação
    const { px, chg } = await fetchQuote(sym);
    if (!px || !isFinite(px)) {
      pushNews(`⚠️ Símbolo não encontrado: ${sym}`);
      return;
    }

    // cria/atualiza no estado
    if (!state.data[sym]) state.data[sym] = { px, chg, series: [] };
    else { state.data[sym].px = px; state.data[sym].chg = chg; }

    // semente do gráfico (flat com ruído leve ao redor do preço atual)
    if (state.data[sym].series.length === 0) {
      const s = [];
      let x = px;
      for (let i = 0; i < N; i++) {
        x *= 1 + (Math.random() - 0.5) * 0.0008;
        s.push(x);
      }
      state.data[sym].series = s;
    }

    // define ativo atual e atualiza UI
    state.active = sym;
    startLive();                 // reinicia live para o novo ativo
    drawList(qinput ? qinput.value : "");
    refresh();
  }

  // ===== Atualização ao vivo =====
  async function updateLiveOnce() {
    const sym = state.active;
    const d = state.data[sym];
    if (!d) return;
    const { px, chg } = await fetchQuote(sym);
    if (!px) return;

    d.series.push(px);
    if (d.series.length > N) d.series.shift();
    d.px = px;
    d.chg = chg;

    refresh();
    checkAlerts();
  }

  function startLive() {
    if (!USE_LIVE) return;
    updateLiveOnce();
    if (window.__liveTimer) clearInterval(window.__liveTimer);
    window.__liveTimer = setInterval(updateLiveOnce, LIVE_INTERVAL_MS);
  }

  // inicia
  startLive();

  // ===== UI Refresh =====
  function refresh() {
    const sym = state.active;
    const d = state.data[sym];
    $("sym").textContent = sym;
    $("price").textContent = moneyFor(sym, d.px);
    const chg = $("chg");
    chg.textContent = fmt(d.chg);
    chg.className = "chg " + (d.chg >= 0 ? "up" : "down");
    drawChart(sym);
    drawPositions();
  }

  // ===== Posições =====
  function drawPositions() {
    const tb = $("pos").getElementsByTagName("tbody")[0];
    tb.innerHTML = "";
    Object.keys(state.positions).forEach((sym) => {
      const pos = state.positions[sym];
      const px = state.data[sym] ? state.data[sym].px : pos.avg;
      const pl = (px - pos.avg) * pos.qty;
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${sym}</td><td>${pos.qty}</td>` +
        `<td>${moneyFor(sym, pos.avg)}</td>` +
        `<td class="${pl >= 0 ? "ok" : "danger"}">${moneyFor(sym, pl)}</td>`;
      tb.appendChild(tr);
    });
  }

  function pushNews(txt) {
    const box = document.createElement("div");
    box.className = "news-item";
    box.innerHTML = `<div>${txt}</div><div class="muted small">${new Date().toLocaleTimeString()}</div>`;
    $("news").prepend(box);
  }

  function trade(side, sym, qty, px) {
    const p = state.positions[sym] || { qty: 0, avg: px };
    if (side === "buy") {
      const newQty = p.qty + qty;
      p.avg = (p.avg * p.qty + px * qty) / (newQty || 1);
      p.qty = newQty;
    } else {
      p.qty = Math.max(0, p.qty - qty);
      if (p.qty === 0) p.avg = px;
    }
    state.positions[sym] = p;
    pushNews(`🟢 Ordem ${side === "buy" ? "comprada" : "vendida"}: ${qty} ${sym} @ ${moneyFor(sym, px)} (paper)`);
    drawPositions();
  }

  // ===== Alertas =====
  function checkAlerts() {
    state.alerts.forEach((a) => (a._hit = false));
    state.alerts.forEach((a) => {
      const d = state.data[a.sym]; if (!d) return;
      const px = d.px, chg = d.chg * 100;
      if (a.cond === "above" && px >= a.val) a._hit = true;
      if (a.cond === "below" && px <= a.val) a._hit = true;
      if (a.cond === "changeUp" && chg >= a.val) a._hit = true;
      if (a.cond === "changeDown" && chg <= a.val) a._hit = true;
    });
    state.alerts = state.alerts.filter((a) => {
      if (a._hit) { pushNews(`🔔 Alerta: ${a.sym} atingiu ${a.cond} ${a.val}`); return false; }
      return true;
    });
  }

  // ===== Botões & Modais =====
  $("buyBtn").onclick  = () => trade("buy",  state.active, 10, state.data[state.active].px);
  $("sellBtn").onclick = () => trade("sell", state.active, 10, state.data[state.active].px);
  $("alertBtn").onclick = () => openAlert(state.active, "above", (state.data[state.active].px * 1.02).toFixed(2));

  function openOrder(side) {
    $("orderTitle").textContent = side === "buy" ? "Comprar" : "Vender";
    $("mSym").value = state.active;
    $("mSide").value = side;
    $("mQty").value = 10;
    $("mPx").value = state.data[state.active].px.toFixed(2);
    $("orderModal").classList.add("open");
  }
  function closeOrder() { $("orderModal").classList.remove("open"); }

  function openAlert(sym, cond, val) {
    $("aSym").value = sym; $("aCond").value = cond; $("aVal").value = val;
    $("alertModal").classList.add("open");
  }
  function closeAlert() { $("alertModal").classList.remove("open"); }

  $("cancelOrder").onclick = closeOrder;
  $("closeOrder").onclick  = closeOrder;
  $("confirmOrder").onclick = function () {
    const sym = $("mSym").value.trim().toUpperCase();
    const side = $("mSide").value;
    const qty = Math.max(1, parseInt($("mQty").value || "1", 10));
    const px  = state.data[sym] ? state.data[sym].px : parseFloat($("mPx").value);
    trade(side, sym, qty, px);
    closeOrder();
  };

  $("cancelAlert").onclick = closeAlert;
  $("closeAlert").onclick  = closeAlert;
  $("confirmAlert").onclick = function () {
    const sym  = $("aSym").value.trim().toUpperCase();
    const cond = $("aCond").value;
    const val  = parseFloat($("aVal").value);
    if (isFinite(val)) {
      state.alerts.push({ sym, cond, val });
      pushNews(`✅ Alerta criado: ${sym} ${cond} ${val}`);
    }
    closeAlert();
  };

  $("buyBtn").addEventListener("dblclick", () => openOrder("buy"));
  $("sellBtn").addEventListener("dblclick", () => openOrder("sell"));

  // ===== Inicialização =====
  drawList("");
  refresh();
})();
