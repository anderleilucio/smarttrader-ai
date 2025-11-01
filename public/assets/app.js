/* public/assets/app.js — SmartTrader AI (tempo real via /api/quote) */
(function () {
  // ===== Config =====
  var REFRESH_MS  = 6000;            // atualiza a cada 6s
  var HISTORY_LEN = 120;             // tamanho máximo da série mantida em memória
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];

  // Pontos “visíveis” por timeframe (aproximados ao nosso tick de 6s)
  var TF_POINTS = {
    "1m": 10,   // ~1 min
    "1h": 60,   // ~1 hora
    "5h": 90,
    "12h": 110,
    "24h": 120,
    "1w": 120,
    "1mo": 120,
    "2mo": 120,
    "3mo": 120,
    "ytd": 120
  };

  // ===== Estado =====
  var state = {
    active: "TSLA",
    data: {},        // {SYM:{px, chg, series:[]}}
    positions: {},   // {SYM:{qty, avg}}
    alerts: [],      // [{sym, cond, val, _hit?}]
    viewN: 60,       // qtde de pontos visíveis
    panStart: null   // {x, startIndex} enquanto arrasta
  };

  // ===== Helpers =====
  function $(id){ return document.getElementById(id); }
  function onClick(id, fn){ var el=$(id); if(el) el.onclick = fn; }
  function on(el, ev, fn){ if(el) el.addEventListener(ev, fn); }
  function fmtPct(v){ return (v>=0?"+":"") + ((v||0)*100).toFixed(2) + "%"; }
  function isBR(sym){ return /\d$/.test(sym); }
  function moneyOf(sym, v){
    var fmt = isBR(sym)
      ? new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" })
      : new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" });
    var s = fmt.format(Math.abs(v||0));
    return (v<0?"-":"") + s.replace("-", "");
  }

  // Marca
  document.title = "SmartTrader AI";

  // ===== Relógio UTC =====
  function tickClock(){ var c=$("clock"); if(c) c.textContent = "UTC — " + new Date().toISOString().slice(11,19) + "Z"; }
  tickClock(); setInterval(tickClock, 1000);

  // ===== Lista inicial =====
  DEFAULTS.forEach(function(s){ state.data[s] = { px:null, chg:0, series:[] }; });

  // ===== Render da lista =====
  var list = $("list");
  function drawList(q){
    if(!list) return;
    list.innerHTML = "";
    var query = (q||"").toLowerCase();
    Object.keys(state.data)
      .filter(function(s){ return !query || s.toLowerCase().indexOf(query)>-1; })
      .forEach(function (sym) {
        var d = state.data[sym] || {};
        var row = document.createElement("div");
        row.className = "ticker" + (sym===state.active ? " active" : "");
        var flag = isBR(sym) ? ' <span title="Brasil">🇧🇷</span>' : '';
        row.innerHTML =
          '<div><strong>'+sym+'</strong>'+flag+'</div>'+
          '<div class="pct '+((d.chg||0)>=0?'up':'down')+'">'+fmtPct(d.chg||0)+'</div>';
        row.onclick = function () {
          state.active = sym;
          drawList($("q")?.value);
          refresh(true);
        };
        list.appendChild(row);
      });
  }
  var qEl = $("q");
  if (qEl){
    on(qEl, "input", function(e){ drawList(e.target.value); });
    on(qEl, "keydown", function(e){
      if(e.key==="Enter"){
        var sym = e.target.value.trim().toUpperCase();
        if(sym){
          if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[] };
          state.active = sym; e.target.blur(); drawList(sym); refresh(true);
        }
      }
    });
  }

  // ===== Gráfico (canvas) =====
  var canvas = $("chart"), ctx = canvas ? canvas.getContext("2d") : null;

  function resizeCanvas() {
    if(!canvas || !ctx) return;
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 600));
    var cssH = Math.max(1, Math.floor(rect.height || 260));
    var dpr  = (window.devicePixelRatio || 1);
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    canvas._cssW = cssW; canvas._cssH = cssH;
  }
  window.addEventListener("resize", function () { resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  function getViewport(series){
    var n = series.length;
    if (n === 0) return {start:0, end:0};
    var view = Math.max(2, Math.min(state.viewN, n));
    return { start: Math.max(0, n - view), end: n-1 };
  }

  function drawChart(sym) {
    if(!canvas || !ctx) return;
    var d = state.data[sym] || { series: [] };
    var W = canvas._cssW || 600, H = canvas._cssH || 260;
    ctx.clearRect(0, 0, W, H);

    var series = d.series || [];
    if (!series.length) return;

    var vp = getViewport(series);
    var slice = series.slice(vp.start, vp.end+1);

    // Caso somente 1 ponto visível, desenha linha central
    if (slice.length === 1) {
      var y = Math.floor(H/2);
      ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
      ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      return;
    }

    var min = Math.min.apply(null, slice);
    var max = Math.max.apply(null, slice);
    if (!isFinite(min) || !isFinite(max) || min === max) { min=(d.px||0)-1; max=(d.px||0)+1; }

    var xstep = W / Math.max(1, slice.length - 1);
    ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
    for (var i=0;i<slice.length;i++){
      var v = slice[i];
      var x = i * xstep;
      var y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ===== Dados (quotes) =====
  async function fetchQuote(sym){
    try{
      var r = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_=' + Date.now(), { cache:'no-store' });
      var j = await r.json();
      var px  = (j && j.px  != null) ? j.px  : null;
      var chg = (j && j.chg != null) ? j.chg : 0;

      if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[] };
      if(px != null){
        var slot = state.data[sym];
        slot.px  = px;
        slot.chg = chg;

        // Série com leve ruído quando repetir o mesmo preço (só visual)
        var s = slot.series;
        var v = px;
        var last = s.length ? s[s.length - 1] : null;
        if (last !== null && Math.abs(px - last) < 1e-8) {
          var noise = (Math.random() - 0.5) * 0.0016; // ±0.16%
          v = px * (1 + noise);
        }
        s.push(v);

        // primeira amostra: semente de 10 pontos p/ evitar linha reta
        if (s.length === 1) { for (var k=0;k<9;k++) s.unshift(v); }

        if (s.length > HISTORY_LEN) s.shift();
      }
    } catch (e) {
      // fica silencioso
    }
  }

  // Atualização periódica
  var ticking = false;
  async function periodic(){
    if(ticking) return; ticking = true;

    await fetchQuote(state.active);

    var others = Object.keys(state.data).filter(function(s){ return s !== state.active; });
    for(var i=0;i<others.length;i++){
      await fetchQuote(others[i]);
      await new Promise(function(res){ setTimeout(res, 120); });
    }

    refresh(false);
    checkAlerts();

    ticking = false;
  }

  setInterval(periodic, REFRESH_MS);
  (async function boot(){ await fetchQuote(state.active); refresh(true); periodic(); })();

  // ===== UI Principal =====
  function refresh(forceDraw){
    var sym = state.active;
    var d = state.data[sym] || { px:null, chg:0, series:[] };
    var symEl=$("sym"), priceEl=$("price"), chgEl=$("chg");
    if(symEl) symEl.textContent = sym;
    if(priceEl) priceEl.textContent = (d.px==null) ? (isBR(sym) ? "R$ —" : "$ —") : moneyOf(sym, d.px);
    if(chgEl){ chgEl.textContent = fmtPct(d.chg||0); chgEl.className = "pill " + ((d.chg||0)>=0 ? "up" : "down"); }

    if(forceDraw) resizeCanvas();
    drawChart(sym);
    drawPositions();
    highlightTF();
  }

  // ===== Posições (paper) =====
  function drawPositions(){
    var table = $("pos"); if(!table) return;
    var tb = table.getElementsByTagName("tbody")[0]; if(!tb) return;
    tb.innerHTML = "";
    Object.keys(state.positions).forEach(function(sym){
      var pos = state.positions[sym];
      var px  = (state.data[sym] && state.data[sym].px!=null) ? state.data[sym].px : pos.avg;
      var pl  = (px - pos.avg) * pos.qty;
      var tr  = document.createElement("tr");
      tr.innerHTML =
        "<td>"+sym+"</td>"+
        "<td>"+pos.qty+"</td>"+
        "<td>"+moneyOf(sym, pos.avg)+"</td>"+
        '<td class="'+(pl>=0?"ok":"danger")+'">'+moneyOf(sym, pl)+"</td>";
      tb.appendChild(tr);
    });
  }

  // ===== Notícias rápidas =====
  function pushNews(txt){
    var box = document.createElement("div");
    box.className = "news-item";
    box.innerHTML = "<div>"+txt+"</div>"+
      '<div class="muted small">'+new Date().toLocaleTimeString()+"</div>";
    var news=$("news"); if(news) news.prepend(box);
  }

  // ===== Trades (paper) =====
  function trade(side, sym, qty, px){
    var p = state.positions[sym] || { qty:0, avg:px };
    if(side==="buy"){
      var newQty = p.qty + qty;
      p.avg = (p.avg*p.qty + px*qty) / (newQty || 1);
      p.qty = newQty;
    }else{
      p.qty = Math.max(0, p.qty - qty);
      if(p.qty===0) p.avg = px;
    }
    state.positions[sym] = p;
    pushNews((side==="buy"?"🟢 Comprado":"🔴 Vendido")+": "+qty+" "+sym+" @ "+moneyOf(sym, px)+" (paper)");
    drawPositions();
  }

  // ===== Alertas =====
  function checkAlerts(){
    state.alerts.forEach(function(a){ a._hit = false; });
    state.alerts.forEach(function(a){
      var d = state.data[a.sym]; if(!d) return;
      var px = d.px, chg = (d.chg||0)*100;
      if(a.cond==="above" && px>=a.val) a._hit = true;
      if(a.cond==="below" && px<=a.val) a._hit = true;
      if(a.cond==="changeUp" && chg>=a.val) a._hit = true;
      if(a.cond==="changeDown" && chg<=a.val) a._hit = true;
    });
    var keep = [];
    state.alerts.forEach(function(a){ if(a._hit) pushNews("🔔 Alerta: "+a.sym+" atingiu "+a.cond+" "+a.val); else keep.push(a); });
    state.alerts = keep;
  }

  // ===== Timeframes & Zoom =====
  function setTimeframe(tf){
    state.viewN = Math.max(2, TF_POINTS[tf] || HISTORY_LEN);
    highlightTF();
    drawChart(state.active);
  }
  function highlightTF(){
    var bar = $("tfbar");
    if(!bar) return;
    var btns = bar.querySelectorAll(".tf");
    btns.forEach(function(b){
      var tf = b.getAttribute("data-tf");
      if (!tf) return;
      var match = (Math.max(2, TF_POINTS[tf]||HISTORY_LEN) === Math.max(2, state.viewN));
      b.classList.toggle("active", match);
    });
  }
  function zoom(delta){ // delta > 0 => zoom in, < 0 => out
    var v = state.viewN;
    if (delta > 0) v = Math.max(5, Math.floor(v * 0.8));
    else          v = Math.min(HISTORY_LEN, Math.ceil(v * 1.25));
    state.viewN = v;
    drawChart(state.active);
    highlightTF();
  }
  function resetZoom(){
    state.viewN = 60;
    drawChart(state.active);
    highlightTF();
  }

  // Bind de botões de timeframe (se existirem)
  var tfbar = $("tfbar");
  if (tfbar){
    tfbar.querySelectorAll(".tf[data-tf]").forEach(function(btn){
      on(btn, "click", function(){
        var tf = btn.getAttribute("data-tf");
        if(tf) setTimeframe(tf);
      });
    });
  }
  // Botões de zoom
  onClick("zoomIn",  function(){ zoom(1);  });
  onClick("zoomOut", function(){ zoom(-1); });
  onClick("resetZoom", resetZoom);

  // Zoom via scroll
  if (canvas){
    on(canvas, "wheel", function(e){
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1 : -1);
    }, { passive:false });
  }

  // Pan (arrastar)
  if (canvas){
    on(canvas, "mousedown", function(e){
      var rect = canvas.getBoundingClientRect();
      state.panStart = { x: e.clientX - rect.left, startIndex: getViewport(state.data[state.active]?.series||[]).start };
    });
    on(window, "mouseup", function(){ state.panStart = null; });
    on(window, "mousemove", function(e){
      if(!state.panStart) return;
      var series = state.data[state.active]?.series || [];
      var n = series.length; if (n < 2) return;

      var rect = canvas.getBoundingClientRect();
      var dx = (e.clientX - rect.left) - state.panStart.x;
      var vp = getViewport(series);
      var view = vp.end - vp.start + 1;
      var perPx = view / (canvas._cssW || 1);
      var shift = Math.round(dx * perPx);

      var start = Math.max(0, Math.min(n - view, state.panStart.startIndex - shift));
      // simulamos pan alterando “janela” com viewN fixo usando um offset via prefix/suffix.
      // Implementação simples: recorta a janela aplicando offset através de overflow invisível (render usa slice).
      // Para manter simples, manipulamos um buffer derivado — aqui fazemos “scroll” empurrando pontos
      // virtualmente: ao pan, apenas redesenhamos como se a janela tivesse mudado de início.
      // Para isso, temporariamente copiamos os últimos `view` pontos começando em `start`.
      var temp = series.slice(start, start + view);
      drawTempSeries(temp);
    });
  }
  function drawTempSeries(temp){
    if(!canvas || !ctx) return;
    var W = canvas._cssW || 600, H = canvas._cssH || 260;
    ctx.clearRect(0, 0, W, H);

    if (temp.length <= 1) {
      var y = Math.floor(H/2);
      ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
      ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      return;
    }
    var min = Math.min.apply(null, temp);
    var max = Math.max.apply(null, temp);
    if (!isFinite(min) || !isFinite(max) || min === max) { min=(temp[0]||0)-1; max=(temp[0]||0)+1; }

    var xstep = W / Math.max(1, temp.length - 1);
    ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
    for (var i=0;i<temp.length;i++){
      var v = temp[i];
      var x = i * xstep;
      var y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ===== Modais e ações =====
  onClick("buyBtn",  function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) trade("buy",  s, 10, px); });
  onClick("sellBtn", function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) trade("sell", s, 10, px); });
  onClick("alertBtn", function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) openAlert(s, "above", (px*1.02).toFixed(2)); });

  function openOrder(side){
    var m=$("orderModal"); if(!m) return;
    var t=$("orderTitle"), ms=$("mSym"), md=$("mSide"), mq=$("mQty"), mp=$("mPx");
    if(t) t.textContent = side==="buy" ? "Comprar" : "Vender";
    if(ms) ms.value = state.active; if(md) md.value = side; if(mq) mq.value = 10;
    if(mp) mp.value  = (state.data[state.active]?.px ?? 0).toFixed(2);
    m.classList.add("open");
  }
  function closeOrder(){ var m=$("orderModal"); if(m) m.classList.remove("open"); }
  function openAlert(sym, cond, val){
    var m=$("alertModal"); if(!m) return;
    var as=$("aSym"), ac=$("aCond"), av=$("aVal");
    if(as) as.value = sym; if(ac) ac.value = cond; if(av) av.value = val;
    m.classList.add("open");
  }
  function closeAlert(){ var m=$("alertModal"); if(m) m.classList.remove("open"); }

  onClick("cancelOrder", closeOrder);
  onClick("closeOrder",  closeOrder);
  onClick("confirmOrder", function(){
    var sym  = $("mSym")?.value.trim().toUpperCase() || state.active;
    var side = $("mSide")?.value || "buy";
    var qty  = Math.max(1, parseInt(($("mQty")?.value || "1"), 10));
    var px   = state.data[sym]?.px ?? parseFloat($("mPx")?.value || "0");
    if(isFinite(px)) trade(side, sym, qty, px);
    closeOrder();
  });

  onClick("cancelAlert", closeAlert);
  onClick("closeAlert",  closeAlert);
  onClick("confirmAlert", function(){
    var sym  = ($("aSym")?.value || "").trim().toUpperCase();
    var cond = $("aCond")?.value || "above";
    var val  = parseFloat($("aVal")?.value || "0");
    if(sym && isFinite(val)){ state.alerts.push({ sym:sym, cond:cond, val:val }); pushNews("✅ Alerta criado: "+sym+" "+cond+" "+val); }
    closeAlert();
  });

  // Duplo clique para abrir modal completo
  var buyBtn = $("buyBtn"), sellBtn = $("sellBtn");
  on(buyBtn,  "dblclick", function(){ openOrder("buy"); });
  on(sellBtn, "dblclick", function(){ openOrder("sell"); });

  // Primeira render
  drawList("");
  refresh(true);
})();
