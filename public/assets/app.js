/* public/assets/app.js — SmartTrader AI (tempo real via /api/quote) */
(function () {
  "use strict";

  /* ===================== Config ===================== */
  var REFRESH_MS  = 6000;             // tick ~6s
  var HISTORY_LEN = 120;              // buffer por símbolo
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];

  // pontos “visíveis” por timeframe (aprox. para tick de 6s)
  var TF_POINTS = {
    "1m": 10,  "1h": 60,  "5h": 90, "12h":110,
    "24h":120, "1w":120,  "1mo":120,"2mo":120,"3mo":120,"ytd":120
  };

  /* ===================== Estado ===================== */
  var state = {
    active: "TSLA",
    // data[SYM] = { px, chg, series: number[], times: number[] (epoch ms) }
    data: {},
    positions: {},
    alerts: [],
    viewN: 60,        // quantidade de pontos visíveis
    offset: 0,        // 0 = olhando o fim (mais recente)
    pan: null         // {x, startOffset}
  };

  /* ===================== Helpers ===================== */
  function $(id){ return document.getElementById(id); }
  function on(el, ev, fn, opts){ if(el) el.addEventListener(ev, fn, opts||false); }
  function onClick(id, fn){ var el=$(id); if(el) el.onclick = fn; }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function fmtPct(v){ return (v>=0?"+":"") + ((v||0)*100).toFixed(2) + "%"; }
  function isBR(sym){ return /\d$/.test(sym); }
  function moneyOf(sym, v){
    var fmt = isBR(sym)
      ? new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" })
      : new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" });
    var s = fmt.format(Math.abs(v||0));
    return (v<0?"-":"") + s.replace("-", "");
  }
  function fmtClock(d){ // HH:MM (UTC)
    var hh = String(d.getUTCHours()).padStart(2,"0");
    var mm = String(d.getUTCMinutes()).padStart(2,"0");
    return hh+":"+mm+"Z";
  }

  document.title = "SmartTrader AI";

  /* ===================== Relógio do topo ===================== */
  function tickClock(){
    var c=$("clock");
    if(c) c.textContent = "UTC — " + new Date().toISOString().slice(11,19) + "Z";
  }
  tickClock(); setInterval(tickClock, 1000);

  /* ===================== Sementes da lista ===================== */
  DEFAULTS.forEach(function(s){
    state.data[s] = { px:null, chg:0, series:[], times:[] };
  });

  /* ===================== Lista de símbolos ===================== */
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
          state.offset = 0;
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
          if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[], times:[] };
          state.active = sym; state.offset = 0;
          e.target.blur(); drawList(sym); refresh(true);
        }
      }
    });
  }

  /* ===================== Canvas / Gráfico ===================== */
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
  on(window, "resize", function(){ resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  // janela visível com viewN + offset
  function getViewport(series){
    var n = series.length;
    if (n === 0) return {start:0, end:0, view:0};
    var view = clamp(state.viewN, 2, n);
    var maxOffset = Math.max(0, n - view);
    state.offset = clamp(state.offset, 0, maxOffset);
    var end   = n - 1 - state.offset;
    var start = end - (view - 1);
    if (start < 0){ start = 0; end = start + view - 1; }
    return { start:start, end:end, view:view };
  }

  function drawAxesAndLabels(W, H, sliceTimes){
    // grid vertical em 4 divisões + labels de tempo
    var divisions = 4;
    var step = Math.max(1, Math.floor((sliceTimes.length-1)/divisions));
    ctx.font = "12px Inter, ui-sans-serif";
    ctx.fillStyle = "#94a0b8"; // muted
    ctx.strokeStyle = "#1e2330"; // line
    ctx.lineWidth = 1;

    // planos verticais
    for (var i = 0; i < sliceTimes.length; i += step){
      var x = (i / Math.max(1, sliceTimes.length-1)) * W;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x)+0.5, 0);
      ctx.lineTo(Math.floor(x)+0.5, H);
      ctx.stroke();
      // label
      var t = new Date(sliceTimes[i]);
      var txt = fmtClock(t);
      var tw = ctx.measureText(txt).width;
      var tx = clamp(x - tw/2, 0, W - tw);
      ctx.fillText(txt, tx, H - 6);
    }
  }

  function drawChart(sym) {
    if(!canvas || !ctx) return;
    var d = state.data[sym] || { series: [], times: [] };
    var W = canvas._cssW || 600, H = canvas._cssH || 260;
    ctx.clearRect(0, 0, W, H);

    var series = d.series || [];
    var times  = d.times  || [];
    if (!series.length) return;

    var vp = getViewport(series);
    var slice = series.slice(vp.start, vp.end+1);
    var ts    = times.slice (vp.start, vp.end+1);

    if (slice.length <= 1) {
      var y = Math.floor(H/2);
      ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
      ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      return;
    }

    // eixo X (grid/labels)
    drawAxesAndLabels(W, H, ts);

    // faixa útil (deixa 22px para labels na base)
    var bottomPad = 18;
    var Hplot = H - bottomPad;

    var min = Math.min.apply(null, slice);
    var max = Math.max.apply(null, slice);
    if (!isFinite(min) || !isFinite(max) || min === max) { min=(d.px||0)-1; max=(d.px||0)+1; }

    var xstep = W / Math.max(1, slice.length - 1);
    ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
    for (var i=0;i<slice.length;i++){
      var v = slice[i];
      var x = i * xstep;
      var y = Hplot - ((v - min) / (max - min + 1e-9)) * (Hplot - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* ===================== Dados (quotes) ===================== */
  async function fetchQuote(sym){
    try{
      var r = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_=' + Date.now(), { cache:'no-store' });
      var j = await r.json();
      var px  = (j && j.px  != null) ? j.px  : null;
      var chg = (j && j.chg != null) ? j.chg : 0;

      if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[], times:[] };
      if(px != null){
        var slot = state.data[sym];
        slot.px  = px;
        slot.chg = chg;

        var s  = slot.series;
        var ts = slot.times;
        var now = Date.now();

        // leve ruído visual quando o preço repete (para dar “vida” ao gráfico)
        var v = px;
        var last = s.length ? s[s.length - 1] : null;
        if (last !== null && Math.abs(px - last) < 1e-8) {
          var noise = (Math.random() - 0.5) * 0.0016; // ±0.16%
          v = px * (1 + noise);
        }
        s.push(v);
        ts.push(now);

        // primeira amostra: semente (10 pts) com timestamps no passado
        if (s.length === 1) {
          for (var k=9;k>=1;k--) { s.unshift(v); ts.unshift(now - k*REFRESH_MS); }
        }

        // mantém buffers sincronizados
        while (s.length > HISTORY_LEN)  s.shift();
        while (ts.length > HISTORY_LEN) ts.shift();

        // re-clampa offset
        getViewport(s);
      }
    } catch (e) {
      // silencioso
    }
  }

  // atualização periódica
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

  /* ===================== UI Principal ===================== */
  function refresh(forceDraw){
    var sym = state.active;
    var d = state.data[sym] || { px:null, chg:0, series:[] };
    var symEl=$("sym"), priceEl=$("price"), chgEl=$("chg");
    if(symEl)   symEl.textContent = sym;
    if(priceEl) priceEl.textContent = (d.px==null) ? (isBR(sym) ? "R$ —" : "$ —") : moneyOf(sym, d.px);
    if(chgEl){ chgEl.textContent = fmtPct(d.chg||0); chgEl.className = "pill " + ((d.chg||0)>=0 ? "up" : "down"); }

    if(forceDraw) resizeCanvas();
    drawChart(sym);
    drawPositions();
    highlightTF();
  }

  /* ===================== Posições (paper) ===================== */
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

  /* ===================== Notícias rápidas ===================== */
  function pushNews(txt){
    var box = document.createElement("div");
    box.className = "news-item";
    box.innerHTML = "<div>"+txt+"</div>"+
      '<div class="muted small">'+new Date().toLocaleTimeString()+"</div>";
    var news=$("news"); if(news) news.prepend(box);
  }

  /* ===================== Trades (paper) ===================== */
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

  /* ===================== Alertas ===================== */
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

  /* ===================== Timeframes & Zoom ===================== */
  function setTimeframe(tf){
    state.viewN = Math.max(2, TF_POINTS[tf] || HISTORY_LEN);
    state.offset = 0; // ao trocar timeframe, volta ao fim
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
      var match = (Math.max(2, TF_POINTS[tf]||HISTORY_LEN) === Math.max(2, state.viewN)) && state.offset===0;
      b.classList.toggle("active", match);
    });
  }
  function zoom(delta){ // delta > 0 => in, < 0 => out
    var v = state.viewN;
    if (delta > 0) v = Math.max(5, Math.floor(v * 0.8));
    else           v = Math.min(HISTORY_LEN, Math.ceil(v * 1.25));
    state.viewN = v;
    // manter janela colada no fim se já estava no fim
    state.offset = clamp(state.offset, 0, Math.max(0, (state.data[state.active]?.series.length||0) - state.viewN));
    drawChart(state.active);
    highlightTF();
  }
  function resetZoom(){
    state.viewN = 60;
    state.offset = 0;
    drawChart(state.active);
    highlightTF();
  }

  // binds de timeframes
  var tfbar = $("tfbar");
  if (tfbar){
    tfbar.querySelectorAll(".tf[data-tf]").forEach(function(btn){
      on(btn, "click", function(){
        var tf = btn.getAttribute("data-tf");
        if(tf) setTimeframe(tf);
      });
    });
  }
  // botões de zoom
  onClick("zoomIn",  function(){ zoom(1);  });
  onClick("zoomOut", function(){ zoom(-1); });
  onClick("resetZoom", resetZoom);

  // zoom via scroll do mouse
  if (canvas){
    on(canvas, "wheel", function(e){
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1 : -1);
    }, { passive:false });
  }

  // pan (arrastar) persistindo em state.offset
  if (canvas){
    on(canvas, "mousedown", function(e){
      var rect = canvas.getBoundingClientRect();
      state.pan = { x: e.clientX - rect.left, startOffset: state.offset };
    });
    on(window, "mouseup", function(){ state.pan = null; });
    on(window, "mousemove", function(e){
      if(!state.pan) return;
      var series = state.data[state.active]?.series || [];
      var n = series.length; if (n < 2) return;

      var rect = canvas.getBoundingClientRect();
      var dx = (e.clientX - rect.left) - state.pan.x;

      var vp = getViewport(series);
      var perPx = vp.view / (canvas._cssW || 1);
      var shift = Math.round(dx * perPx); // arrastar p/ direita => offset aumenta

      var maxOffset = Math.max(0, n - vp.view);
      state.offset = clamp(state.pan.startOffset + shift, 0, maxOffset);
      drawChart(state.active);
      // ao pan, não marcamos nenhum timeframe como active
    });
  }

  /* ===================== Modais / Ações ===================== */
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

  // primeira render
  drawList("");
  refresh(true);
})();
