(function () {
  // ===== Estado base =====
  var state = {
    active: "TSLA",
    data: {
      TSLA:  { px: 456.10, chg: 0.003,  series: [] },
      NVDA:  { px: 181.93, chg: 0.021,  series: [] },
      AAPL:  { px: 197.45, chg: -0.0082, series: [] },
      AMZN:  { px: 169.80, chg: 0.004,  series: [] },
      VALE3: { px: 62.35,  chg: 0.006,  series: [] },
      PETR4: { px: 39.20,  chg: -0.012, series: [] },
    },
    positions: {}, // {SYM:{qty, avg}}
    alerts: [],    // {sym, cond, val}
  };

  // ===== Utils =====
  function $(id) { return document.getElementById(id); }
  function fmt(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%"; }

  var usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  function money(v) { return (v >= 0 ? "" : "-") + usd.format(Math.abs(v)).replace("-", ""); }

  // Título da página (marca)
  document.title = "SmartTrader AI";

  // ===== Relógio UTC =====
  function clockUTC() {
    // HH:MM:SSZ
    return new Date().toISOString().slice(11, 19) + "Z";
  }
  function tickClock() { $("clock").textContent = "UTC — " + clockUTC(); }
  tickClock();
  setInterval(tickClock, 1000);

  // ===== Lista de tickers =====
  var list = $("list");
  function drawList(q) {
    list.innerHTML = "";
    Object.keys(state.data)
      .filter(function (s) { return !q || s.toLowerCase().indexOf(q.toLowerCase()) > -1; })
      .forEach(function (sym) {
        var d = state.data[sym];
        var row = document.createElement("div");
        row.className = "ticker";
        row.innerHTML =
          '<div><strong>' + sym + "</strong></div>" +
          '<div class="pct ' + (d.chg >= 0 ? "up" : "down") + '">' + fmt(d.chg) + "</div>";
        row.onclick = function () { state.active = sym; drawList($("q").value); refresh(); };
        list.appendChild(row);
      });
  }
  $("q").addEventListener("input", function (e) { drawList(e.target.value); });

  // ===== Série simulada =====
  var N = 120;
  if (!Object.values) Object.values = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
  Object.values(state.data).forEach(function (d) {
    if (d.series.length === 0) {
      var x = d.px;
      for (var i = 0; i < N; i++) {
        x = x * (1 + (Math.random() - 0.5) * 0.002);
        d.series.push(x);
      }
    }
  });

  // ===== Gráfico (canvas responsivo) =====
  var canvas = $("chart"), ctx = canvas.getContext("2d");

  function resizeCanvas() {
    // Ajusta para o CSS width atual (retina friendly)
    var w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    var h = canvas.clientHeight || 260;
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", function () { resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  function drawChart(sym) {
    var d = state.data[sym];
    var W = canvas.width;
    var H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var min = Math.min.apply(null, d.series);
    var max = Math.max.apply(null, d.series);
    if (!isFinite(min) || !isFinite(max) || min === max) { // proteção
      min = (d.px || 0) - 1;
      max = (d.px || 0) + 1;
    }

    var xstep = W / Math.max(1, (d.series.length - 1));
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#00ffa3";

    d.series.forEach(function (v, i) {
      var x = i * xstep;
      var y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ===== Ticker de preços simulado =====
  setInterval(function () {
    Object.keys(state.data).forEach(function (sym) {
      var d = state.data[sym];
      var last = d.series[d.series.length - 1];
      var next = last * (1 + (Math.random() - 0.48) * 0.004);
      d.series.push(next);
      if (d.series.length > N) d.series.shift();
      d.chg = (next / d.series[0] - 1);
      d.px = next;
    });
    refresh();
    checkAlerts();
  }, 1200);

  // ===== UI Refresh =====
  function refresh() {
    var sym = state.active;
    var d = state.data[sym];
    $("sym").textContent = sym;
    $("price").textContent = usd.format(d.px);
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
    box.innerHTML =
      "<div>" + txt + "</div>" +
      '<div class="muted small">' + new Date().toLocaleTimeString() + "</div>";
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
      if (a._hit) {
        pushNews("🔔 Alerta: " + a.sym + " atingiu " + a.cond + " " + a.val);
      } else keep.push(a);
    });
    state.alerts = keep;
  }

  // ===== Botões =====
  $("buyBtn").onclick = function () {
    var sym = state.active, px = state.data[sym].px;
    trade("buy", sym, 10, px);
  };
  $("sellBtn").onclick = function () {
    var sym = state.active, px = state.data[sym].px;
    trade("sell", sym, 10, px);
  };
  $("alertBtn").onclick = function () {
    // cria alerta "preço acima de +2%"
    var sym = state.active, px = state.data[sym].px;
    openAlert(sym, "above", (px * 1.02).toFixed(2));
  };

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
      state.alerts.push({ sym: sym, cond: cond, val: val });
      pushNews("✅ Alerta criado: " + sym + " " + cond + " " + val);
    }
    closeAlert();
  };

  // Duplo clique abre modal de ordem
  $("buyBtn").addEventListener("dblclick", function () { openOrder("buy"); });
  $("sellBtn").addEventListener("dblclick", function () { openOrder("sell"); });

  // ===== Inicialização =====
  drawList("");
  refresh();
})();
