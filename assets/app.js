(function () {
  // ===== CONFIGURAÇÃO DO FEED =====
  const FINNHUB_KEY = "d42pb1hr01qorlesfdtgd42pb1hr01qorlesfdu0"; // Sua chave Finnhub
  const USE_LIVE = true;                     // ativa dados reais
  const LIVE_INTERVAL_MS = 5000;             // intervalo de atualização (5s)

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
  function $(id) { return document.getElementById(id); }
  function fmt(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%"; }
  function isBR(sym) { return /\d$/.test(sym); }

  const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  function moneyFor(sym, v) {
    return isBR(sym) ? brlFmt.format(v) : usdFmt.format(v);
  }

  document.title = "SmartTrader AI";

  // ===== Relógio UTC =====
  function clockUTC() { return new Date().toISOString().slice(11, 19) + "Z"; }
  function tickClock() { var el = $("clock"); if (el) el.textContent = "UTC — " + clockUTC(); }
  tickClock();
  setInterval(tickClock, 1000);

  // ===== Lista de tickers =====
  var list = $("list");
  function drawList(q) {
    if (!list) return;
    list.innerHTML = "";
    Object.keys(state.data)
      .filter(s => !q || s.toLowerCase().includes(q.toLowerCase()))
      .forEach(sym => {
        var d = state.data[sym];
        var row = document.createElement("div");
        row.className = "ticker";
        row.innerHTML =
          `<div><strong>${sym}</strong></div>` +
          `<div class="pct ${d.chg >= 0 ? "up" : "down"}">${fmt(d.chg)}</div>`;
        row.onclick = function () { state.active = sym; drawList($("q").value); refresh(); };
        list.appendChild(row);
      });
  }
  var qinput = $("q");
  if (qinput) qinput.addEventListener("input", e => drawList(e.target.value));

  // ===== Série inicial simulada =====
  var N = 120;
  Object.values(state.data).forEach(d => {
    if (d.series.length === 0) {
      var x = d.px;
      for (var i = 0; i < N; i++) {
        x *= (1 + (Math.random() - 0.5) * 0.002);
        d.series.push(x);
      }
    }
  });

  // ===== Canvas (gráfico) =====
  var canvas = $("chart");
  var ctx = canvas ? canvas.getContext("2d") : null;
  function resizeCanvas() {
    if (!canvas || !ctx) return;
    var w = canvas.clientWidth || 600;
    var h = canvas.clientHeight || 260;
    var ratio = window.devicePixelRatio || 1;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", () => { resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  function drawChart(sym) {
    if (!canvas || !ctx) return;
    var d = state.data[sym];
    var W = canvas.width;
    var H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var min = Math.min(...d.series);
    var max = Math.max(...d.series);
    if (!isFinite(min) || !isFinite(max) || min === max) {
      min = (d.px || 0) - 1;
      max = (d.px || 0) + 1;
    }

    var xstep = W / Math.max(1, d.series.length - 1);
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#00ffa3";
    d.series.forEach((v, i) => {
      var x = i * xstep;
      var y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
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

  async function updateLiveOnce() {
    const sym = state.active;
    const d = state.data[sym];
    if (!d) return;
    const { px, chg } = await fetchQuote(sym);
    if (!px) return;
    const next = px;
    d.series.push(next);
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

  // ===== Atualização ao vivo =====
  startLive();

  // ===== UI Refresh =====
  function refresh() {
    var sym = state.active;
    var d = state.data[sym];
    $("sym").textContent = sym;
    $("price").textContent = moneyFor(sym, d.px);
    var chg = $("chg");
    chg.textContent = fmt(d.chg);
    chg.className = "chg " + (d.chg >= 0 ? "up" : "down");
    drawChart(sym);
    drawPositions();
  }

  // ===== Posições =====
  function drawPositions() {
    var tb = $("pos").getElementsByTagName("tbody")[0];
    tb.innerHTML = "";
    Object.keys(state.positions).forEach(function (sym) {
      var pos = state.positions[sym];
      var px = state.data[sym] ? state.data[sym].px : pos.avg;
      var pl = (px - pos.avg) * pos.qty;
      var tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${sym}</td><td>${pos.qty}</td>` +
        `<td>${moneyFor(sym, pos.avg)}</td>` +
        `<td class="${pl >= 0 ? "ok" : "danger"}">${moneyFor(sym, pl)}</td>`;
      tb.appendChild(tr);
    });
  }

  function pushNews(txt) {
    var box = document.createElement("div");
    box.className = "news-item";
    box.innerHTML =
      `<div>${txt}</div><div class="muted small">${new Date().toLocaleTimeString()}</div>`;
    $("news").prepend(box);
  }

  function trade(side, sym, qty, px) {
    var p = state.positions[sym] || { qty: 0, avg: px };
    if (side === "buy") {
      var newQty = p.qty + qty;
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
    state.alerts.forEach(a => a._hit = false);
    state.alerts.forEach(a => {
      var d = state.data[a.sym]; if (!d) return;
      var px = d.px, chg = d.chg * 100;
      if (a.cond === "above" && px >= a.val) a._hit = true;
      if (a.cond === "below" && px <= a.val) a._hit = true;
      if (a.cond === "changeUp" && chg >= a.val) a._hit = true;
      if (a.cond === "changeDown" && chg <= a.val) a._hit = true;
    });
    state.alerts = state.alerts.filter(a => {
      if (a._hit) {
        pushNews(`🔔 Alerta: ${a.sym} atingiu ${a.cond} ${a.val}`);
        return false;
      }
      return true;
    });
  }

  // ===== Botões =====
  $("buyBtn").onclick = () => trade("buy", state.active, 10, state.data[state.active].px);
  $("sellBtn").onclick = () => trade("sell", state.active, 10, state.data[state.active].px);
  $("alertBtn").onclick = () => openAlert(state.active, "above", (state.data[state.active].px * 1.02).toFixed(2));

  // ===== Modais =====
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
  $("closeOrder").onclick = closeOrder;
  $("confirmOrder").onclick = function () {
    var sym = $("mSym").value.trim().toUpperCase();
    var side = $("mSide").value;
    var qty = Math.max(1, parseInt($("mQty").value || "1", 10));
    var px = state.data[sym] ? state.data[sym].px : parseFloat($("mPx").value);
    trade(side, sym, qty, px);
    closeOrder();
  };

  $("cancelAlert").onclick = closeAlert;
  $("closeAlert").onclick = closeAlert;
  $("confirmAlert").onclick = function () {
    var sym = $("aSym").value.trim().toUpperCase();
    var cond = $("aCond").value;
    var val = parseFloat($("aVal").value);
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
