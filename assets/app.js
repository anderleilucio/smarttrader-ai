/* assets/app.js — SmartTrader AI (dados reais via /api/quote) */
(function () {
  // ===== Config =====
  var REFRESH_MS = 5000;            // atualiza quote a cada 5s
  var HISTORY_LEN = 180;            // pontos no gráfico
  var DEFAULTS = ["TSLA", "NVDA", "AAPL", "AMZN", "MSFT", "ITUB4", "VALE3", "PETR4"]; // lista inicial

  // ===== Estado =====
  var state = {
    active: "TSLA",
    data: {},           // {SYM:{px, chg, series:[]}}
    positions: {},      // {SYM:{qty, avg}}
    alerts: []          // [{sym, cond, val, _hit}]
  };

  // ===== Utils =====
  function $(id) { return document.getElementById(id); }
  function fmtPct(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%"; }
  var usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  function money(v) { return (v >= 0 ? "" : "-") + usd.format(Math.abs(v)).replace("-", ""); }
  function isBR(sym){ return /\d$/.test(sym); }

  // Marca
  document.title = "SmartTrader AI";

  // ===== Relógio UTC =====
  function tickClock() { $("clock").textContent = "UTC — " + new Date().toISOString().slice(11, 19) + "Z"; }
  tickClock(); setInterval(tickClock, 1000);

  // ===== Busca de preços (serverless) =====
  async function fetchQuote(sym) {
    var url = "/api/quote?symbol=" + encodeURIComponent(sym);
    var r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json(); // {symbol, px, chg}
  }

  function ensure(sym) {
    sym = sym.trim().toUpperCase();
    if (!state.data[sym]) state.data[sym] = { px: NaN, chg: 0, series: [] };
    return sym;
  }

  async function updateOne(sym) {
    sym = ensure(sym);
    try {
      var q = await fetchQuote(sym);
      var d = state.data[sym];
      d.px = q.px;
      d.chg = q.chg;
      var last = d.series.length ? d.series[d.series.length - 1] : q.px;
      // se px válido, adiciona ponto; senão mantém
      if (isFinite(q.px)) {
        d.series.push(q.px);
        if (d.series.length > HISTORY_LEN) d.series.shift();
        // primeira carga: cria um pequeno histórico para o gráfico não começar vazio
        if (d.series.length < 10) {
          while (d.series.length < 10) d.series.unshift(last);
        }
      }
    } catch (e) {
      // fallback leve: mantém último preço e não quebra
      console.warn("quote fail", sym, e.message);
    }
  }

  async function updateMany(symbols) {
    await Promise.all(symbols.map(updateOne));
    drawList($("q").value);
    refresh();
    checkAlerts();
  }

  // ===== Sidebar / Lista =====
  var list = $("list");
  function drawList(q) {
    q = (q || "").toLowerCase();
    list.innerHTML = "";
    Object.keys(state.data)
      .filter(function (s) { return !q || s.toLowerCase().indexOf(q) > -1; })
      .sort()
      .forEach(function (sym) {
        var d = state.data[sym];
        var row = document.createElement("div");
        row.className = "ticker";
        row.innerHTML =
          '<div><strong>' + sym + (isBR(sym) ? " 🇧🇷" : "") + '</strong></div>' +
          '<div class="pct ' + (d.chg >= 0 ? "up" : "down") + '">' + (isFinite(d.chg) ? fmtPct(d.chg) : "--") + "</div>";
        row.onclick = function () { state.active = sym; refresh(); };
        list.appendChild(row);
      });
  }
  $("q").addEventListener("input", function (e) { drawList(e.target.value); });
  $("q").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var s = ensure(e.target.value || state.active);
      state.active = s;
      if (!Object.keys(state.data).includes(s)) DEFAULTS.push(s);
      updateOne(s).then(refresh);
    }
  });

  // ===== Gráfico =====
  var canvas = $("chart"), ctx = canvas.getContext("2d");
  function resizeCanvas() {
    var w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    var h = 260;
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", function () { resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  function drawChart(sym) {
    var d = state.data[sym] || { series: [] };
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var s = d.series.length ? d.series : [0, 0];
    var min = Math.min.apply(null, s), max = Math.max.apply(null, s);
    if (!isFinite(min) || !isFinite(max) || min === max) { min = (d.px || 0) - 1; max = (d.px || 0) + 1; }

    var xstep = W / Math.max(1, (s.length - 1));
    ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
    s.forEach(function (v, i) {
      var x = i * xstep;
      var y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ===== UI principal =====
  function refresh() {
    var sym = state.active;
    var d = state.data[sym] || {};
    $("sym").textContent = sym;
    $("price").textContent = isFinite(d.px) ? usd.format(d.px) : "$ —";
    var chg = $("chg");
    chg.textContent = isFinite(d.chg) ? fmtPct(d.chg) : "—";
    chg.className = "chg " + (d.chg >= 0 ? "up" : "down");
    drawChart(sym);
    drawPositions();
  }

  // ===== Posições (paper) =====
  function drawPositions() {
    var tb = $("pos").getElementsByTagName("tbody")[0];
    tb.innerHTML = "";
    Object.keys(state.positions).forEach(function (sym) {
      var pos = state.positions[sym];
      var px = state.data[sym] ? state.data[sym].px : pos.avg;
      var pl = (px - pos.avg) * pos.qty;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + sym + "</td>" +
        "<td>" + pos.qty + "</td>" +
        "<td>" + money(pos.avg) + "</td>" +
        '<td class="' + (pl >= 0 ? "ok" : "danger") + '">' + money(pl) + "</td>";
      tb.appendChild(tr);
    });
  }
  function pushNews(txt) {
    var box = document.createElement("div");
    box.className = "news-item";
    box.innerHTML = "<div>" + txt + "</div><div class=\"muted small\">" + new Date().toLocaleTimeString() + "</div>";
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
    pushNews("🟢 Ordem " + (side === "buy" ? "comprada" : "vendida") + ": " + qty + " " + sym + " @ " + usd.format(px) + " (paper)");
    drawPositions();
  }

  // ===== Alertas =====
  function checkAlerts() {
    state.alerts.forEach(function (a) { a._hit = false; });
    state.alerts.forEach(function (a) {
      var d = state.data[a.sym]; if (!d) return;
      var px = d.px, chg = d.chg * 100;
      if (a.cond === "above" && px >= a.val) a._hit = true;
      if (a.cond === "below" && px <= a.val) a._hit = true;
      if (a.cond === "changeUp" && chg >= a.val) a._hit = true;
      if (a.cond === "changeDown" && chg <= a.val) a._hit = true;
    });
    var keep = [];
    state.alerts.forEach(function (a) {
      if (a._hit) pushNews("🔔 Alerta: " + a.sym + " atingiu " + a.cond + " " + a.val);
      else keep.push(a);
    });
    state.alerts = keep;
  }

  // ===== Botões & Modais =====
  $("buyBtn").onclick = function () {
    var sym = state.active, px = state.data[sym]?.px;
    if (isFinite(px)) trade("buy", sym, 10, px);
  };
  $("sellBtn").onclick = function () {
    var sym = state.active, px = state.data[sym]?.px;
    if (isFinite(px)) trade("sell", sym, 10, px);
  };
  $("alertBtn").onclick = function () {
    var sym = state.active, px = state.data[sym]?.px;
    if (isFinite(px)) openAlert(sym, "above", (px * 1.02).toFixed(2));
  };

  function openOrder(side) {
    $("orderTitle").textContent = side === "buy" ? "Comprar" : "Vender";
    $("mSym").value = state.active;
    $("mSide").value = side;
    $("mQty").value = 10;
    $("mPx").value = (state.data[state.active]?.px || 0).toFixed(2);
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
    if (isFinite(px)) trade(side, sym, qty, px);
    closeOrder();
  };
  $("cancelAlert").onclick = closeAlert;
  $("closeAlert").onclick = closeAlert;
  $("confirmAlert").onclick = function () {
    var sym = $("aSym").value.trim().toUpperCase();
    var cond = $("aCond").value;
    var val = parseFloat($("aVal").value);
    if (isFinite(val)) {
      state.alerts.push({ sym: sym, cond: cond, val: val });
      pushNews("✅ Alerta criado: " + sym + " " + cond + " " + val);
    }
    closeAlert();
  };

  $("buyBtn").addEventListener("dblclick", function () { openOrder("buy"); });
  $("sellBtn").addEventListener("dblclick", function () { openOrder("sell"); });

  // ===== Inicialização =====
  DEFAULTS.forEach(ensure);
  drawList("");
  refresh();
  // primeira carga rápida
  updateMany(DEFAULTS);
  // loop de atualização
  setInterval(function () {
    var watch = Array.from(new Set(DEFAULTS.concat([state.active])));
    updateMany(watch);
  }, REFRESH_MS);
})();
