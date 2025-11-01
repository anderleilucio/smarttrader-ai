/* public/assets/app.js — SmartTrader AI (tempo real + séries) */
(function () {
  "use strict";

  /* ========== Config ==========\ */
  var REFRESH_MS  = 6000;
  var HISTORY_LEN = 120;
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];

  // pontos visíveis por timeframe (~6s entre pontos para demo)
  var TF_POINTS = {
    "1m": 10,  "1h": 60,  "5h": 90, "12h":110,
    "24h":120, "1w":120,  "1mo":120,"2mo":120,"3mo":120,"ytd":120
  };
  var DEFAULT_TF = "24h";

  /* ========== Estado ==========\ */
  var state = {
    active: "TSLA",
    data: {},          // data[SYM] = { px, chg, series:number[], times:number[] }
    positions: {},
    alerts: [],
    viewN: 60,
    offset: 0,
    pan: null,
    tf: DEFAULT_TF,
    hover: null        // {x, idx} para tooltip/crosshair
  };

  /* ========== Helpers ==========\ */
  function $(id){ return document.getElementById(id); }
  function on(el, ev, fn, opts){ if(el) el.addEventListener(ev, fn, opts||false); }
  function onClick(id, fn){ var el=$(id); if(el) el.onclick = fn; }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function fmtPct(v){ return (v>=0?"+":"") + ((v||0)*100).toFixed(2) + "%"; }
  function isBR(sym){ return /\d$/.test(sym); }
  function moneyOf(sym, v){
    var fmt = isBR(sym)
      ? new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" })
      : new Intl.NumberFormat("en-US",  { style:"currency", currency:"USD" });
    var s = fmt.format(Math.abs(v||0));
    return (v<0?"-":"") + s.replace("-", "");
  }
  function fmtClock(d){ // HH:MMZ UTC
    var hh = String(d.getUTCHours()).padStart(2,"0");
    var mm = String(d.getUTCMinutes()).padStart(2,"0");
    return hh+":"+mm+"Z";
  }

  document.title = "SmartTrader AI";

  /* ========== Relógio topo ==========\ */
  function tickClock(){ var c=$("clock"); if(c) c.textContent = "UTC — " + new Date().toISOString().slice(11,19) + "Z"; }
  tickClock(); setInterval(tickClock, 1000);

  /* ========== Sementes ==========\ */
  DEFAULTS.forEach(function(s){
    state.data[s] = { px:null, chg:0, series:[], times:[] };
  });

  /* ========== Lista ==========\ */
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
          loadSeries(sym, state.tf, true);  // carrega série real ao trocar
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
          e.target.blur(); drawList(sym); loadSeries(sym, state.tf, true);
        }
      }
    });
  }

  /* ========== Canvas / Gráfico ==========\ */
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
    var divisions = 4;
    var step = Math.max(1, Math.floor((sliceTimes.length-1)/divisions));
    ctx.font = "12px Inter, ui-sans-serif";
    ctx.fillStyle = "#94a0b8";       // muted
    ctx.strokeStyle = "#1e2330";     // grid line
    ctx.lineWidth = 1;

    for (var i = 0; i < sliceTimes.length; i += step){
      var x = (i / Math.max(1, sliceTimes.length-1)) * W;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x)+0.5, 0);
      ctx.lineTo(Math.floor(x)+0.5, H-22);
      ctx.stroke();

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
      var y = Math.floor((H-22)/2);
      ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
      ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      return;
    }

    drawAxesAndLabels(W, H, ts);

    var bottomPad = 22, Hplot = H - bottomPad;
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

    // crosshair/tooltip
    if (state.hover){
      var idx = clamp(state.hover.idx, 0, slice.length-1);
      var hvx = idx * xstep;
      var hvy = (function(){
        var v = slice[idx];
        return Hplot - ((v - min) / (max - min + 1e-9)) * (Hplot - 10) - 5;
      })();

      // crosshair
      ctx.strokeStyle="#24304a"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(Math.floor(hvx)+0.5, 0); ctx.lineTo(Math.floor(hvx)+0.5, Hplot); ctx.stroke();

      // ponto
      ctx.fillStyle="#00ffa3"; ctx.beginPath(); ctx.arc(hvx, hvy, 3, 0, Math.PI*2); ctx.fill();

      // tooltip
      var priceTxt = moneyOf(sym, slice[idx]);
      var timeTxt  = fmtClock(new Date(ts[idx]));
      var txt = priceTxt + "  •  " + timeTxt;

      ctx.font="12px Inter, ui-sans-serif";
      var pad=6, tw=ctx.measureText(txt).width;
      var bx = clamp(hvx - tw/2 - pad, 0, W - (tw + pad*2));
      var by = 8;
      ctx.fillStyle="#0f1420"; ctx.strokeStyle="#273b55";
      ctx.lineWidth=1; ctx.beginPath(); ctx.rect(bx, by, tw+pad*2, 22); ctx.fill(); ctx.stroke();
      ctx.fillStyle="#dce7ff"; ctx.fillText(txt, bx+pad, by+15);
    }
  }

  /* ========== Dados ==========\ */
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

        // se estamos colados no fim, append ponto novo
        var s  = slot.series;
        var ts = slot.times;
        if (s.length){
          s.push(px);
          ts.push(Date.now());
          while (s.length  > HISTORY_LEN) s.shift();
          while (ts.length > HISTORY_LEN) ts.shift();
        }
      }
    } catch (e) { /* silencioso */ }
  }

  async function loadSeries(sym, tf, forceRedraw){
    try{
      var r = await fetch('/api/series?symbol='+encodeURIComponent(sym)+'&tf='+encodeURIComponent(tf)+'&_=' + Date.now(), { cache:'no-store' });
      var j = await r.json(); // { t:[], c:[] }
      if (Array.isArray(j?.t) && Array.isArray(j?.c) && j.t.length && j.c.length){
        state.data[sym].series = j.c.slice(-HISTORY_LEN);
        state.data[sym].times  = j.t.slice(-HISTORY_LEN).map(function(x){ return (typeof x==="number" && x<1e12) ? x*1000 : x; });
        // ajusta janela ao TF escolhido
        state.viewN = Math.max(2, TF_POINTS[tf] || state.viewN);
        state.offset = 0;
        if (forceRedraw) refresh(true); else drawChart(sym);
      }
    } catch(e){ /* mantém o que já tem */ }
  }

  // loop periódico: atualiza ativo + demais
  var ticking = false;
  async function periodic(){
    if(ticking) return; ticking = true;

    // ativo primeiro (garante gráfico mais “vivo”)
    await fetchQuote(state.active);

    // demais símbolos
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
  (async function boot(){
    drawList("");
    await loadSeries(state.active, state.tf, true);
    await periodic();
  })();

  /* ========== UI Principal ==========\ */
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

  /* ========== Posições / News ==========\ */
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
  function pushNews(txt){
    var box = document.createElement("div");
    box.className = "news-item";
    box.innerHTML = "<div>"+txt+"</div>"+
      '<div class="muted small">'+new Date().toLocaleTimeString()+"</div>";
    var news=$("news"); if(news) news.prepend(box);
  }
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
  function checkAlerts(){
    state.alerts.forEach(function(a){ a._hit = false; });
    state.alerts.forEach(function(a){
      var d = state.data[a.sym]; if(!d) return;
      var px = d.px, chg = (d.chg||0)*100;
      if(a.cond==="above" && px>=a.val) a._hit = true;
      if(a.cond==="below" && px<=a.val) a._hit = true;
      if(a.cond==="changeUp"   && chg>=a.val) a._hit = true;
      if(a.cond==="changeDown" && chg<=a.val) a._hit = true;
    });
    var keep = [];
    state.alerts.forEach(function(a){ if(a._hit) pushNews("🔔 Alerta: "+a.sym+" atingiu "+a.cond+" "+a.val); else keep.push(a); });
    state.alerts = keep;
  }

  /* ========== Timeframes / Zoom / Pan ==========\ */
  function setTimeframe(tf){
    state.tf = tf;
    state.viewN = Math.max(2, TF_POINTS[tf] || HISTORY_LEN);
    state.offset = 0;
    highlightTF();
    loadSeries(state.active, tf, true);
  }
  function highlightTF(){
    var bar = $("tfbar");
    if(!bar) return;
    var btns = bar.querySelectorAll(".tf");
    btns.forEach(function(b){
      var tf = b.getAttribute("data-tf");
      var match = (tf === state.tf) && state.offset===0;
      b.classList.toggle("active", !!match);
    });
  }
  function zoom(delta){
    var v = state.viewN;
    if (delta > 0) v = Math.max(5, Math.floor(v * 0.8));
    else           v = Math.min(HISTORY_LEN, Math.ceil(v * 1.25));
    state.viewN = v;
    state.offset = clamp(state.offset, 0, Math.max(0, (state.data[state.active]?.series.length||0) - state.viewN));
    drawChart(state.active);
    highlightTF();
  }
  function resetZoom(){ state.viewN = TF_POINTS[state.tf] || 60; state.offset = 0; drawChart(state.active); highlightTF(); }

  var tfbar = $("tfbar");
  if (tfbar){
    tfbar.querySelectorAll(".tf[data-tf]").forEach(function(btn){
      on(btn, "click", function(){ var tf = btn.getAttribute("data-tf"); if(tf) setTimeframe(tf); });
    });
  }
  onClick("zoomIn",  function(){ zoom(1);  });
  onClick("zoomOut", function(){ zoom(-1); });
  onClick("resetZoom", resetZoom);

  if (canvas){
    // scroll = zoom
    on(canvas, "wheel", function(e){ e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive:false });

    // pan
    on(canvas, "mousedown", function(e){
      var rect = canvas.getBoundingClientRect();
      state.pan = { x: e.clientX - rect.left, startOffset: state.offset };
    });
    on(window, "mouseup", function(){ state.pan = null; });
    on(window, "mousemove", function(e){
      var rect = canvas.getBoundingClientRect();
      // hover p/ tooltip
      var d = state.data[state.active]; if(d && d.series.length){
        var vp = getViewport(d.series);
        var view = vp.end - vp.start + 1;
        var x = (e.clientX - rect.left);
        var idx = Math.round( (x / (canvas._cssW||1)) * (view - 1) );
        state.hover = { x:x, idx: idx };
        drawChart(state.active);
      }
      // pan (se pressionado)
      if(!state.pan) return;
      var series = state.data[state.active]?.series || [];
      var n = series.length; if (n < 2) return;
      var dx = (e.clientX - rect.left) - state.pan.x;
      var vp = getViewport(series);
      var perPx = vp.view / (canvas._cssW || 1);
      var shift = Math.round(dx * perPx);
      var maxOffset = Math.max(0, n - vp.view);
      state.offset = clamp(state.pan.startOffset + shift, 0, maxOffset);
      drawChart(state.active);
    });
    // sair do canvas limpa tooltip
    on(canvas, "mouseleave", function(){ state.hover=null; drawChart(state.active); });
  }

  /* ========== Modais / Ações ==========\ */
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

})();
