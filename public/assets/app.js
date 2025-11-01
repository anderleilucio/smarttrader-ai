/* public/assets/app.js — SmartTrader AI (Robinhood-like TFs) */
(function () {
  "use strict";

  // ===== Config =====
  var REFRESH_MS  = 6000;
  var HISTORY_LEN = 1200; // suporta 1D em 1m e 1W em 5m com folga
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];

  // Mesmos rótulos do Robinhood
  var TF_POINTS = { "1D": 300, "1W": 300, "1M": 300, "3M": 300, "1Y": 300, "5Y": 300, "MAX": 300 };
  var DEFAULT_TF = "1D";

  // ===== Estado =====
  var state = {
    active: "TSLA",
    data: {},           // data[SYM] = { px, chg, series:number[], times:number[] }
    positions: {},
    alerts: [],
    viewN: TF_POINTS[DEFAULT_TF],
    offset: 0,
    pan: null,
    tf: DEFAULT_TF,
    hover: null        // {x, idx} para tooltip/crosshair
  };

  // ===== Helpers =====
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
  function fmtClock(d){
    var hh = String(d.getUTCHours()).padStart(2,"0");
    var mm = String(d.getUTCMinutes()).padStart(2,"0");
    return hh+":"+mm+"Z";
  }

  // relógio do topo
  function tickClock(){ var c=$("clock"); if(c) c.textContent = "UTC — " + new Date().toISOString().slice(11,19) + "Z"; }
  tickClock(); setInterval(tickClock, 1000);

  // sementes
  DEFAULTS.forEach(function(s){
    state.data[s] = { px:null, chg:0, series:[], times:[] };
  });

  // ===== Lista com preço e % =====
  var list = $("list");
  function drawList(q){
    if(!list) return;
    list.innerHTML = "";
    var query = (q||"").toLowerCase();
    Object.keys(state.data)
      .filter(function(s){ return !query || s.toLowerCase().includes(query); })
      .forEach(function (sym) {
        var d = state.data[sym] || {};
        var row = document.createElement("div");
        row.className = "ticker" + (sym===state.active ? " active" : "");
        var flag = isBR(sym) ? ' <span title="Brasil">🇧🇷</span>' : '';
        var pxTxt = d.px==null ? (isBR(sym)?"R$ —":"$ —") : moneyOf(sym, d.px);
        row.innerHTML =
          '<div><strong>'+sym+'</strong>'+flag+'</div>'+
          '<div class="px">'+pxTxt+'</div>'+
          '<div class="pct '+((d.chg||0)>=0?'up':'down')+'">'+fmtPct(d.chg||0)+'</div>';
        row.onclick = function () {
          state.active = sym;
          state.offset = 0;
          drawList($("q")?.value);
          setTimeframe(state.tf);
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
          e.target.blur(); drawList(sym); setTimeframe(state.tf);
        }
      }
    });
  }

  // ===== Canvas / gráfico =====
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
    ctx.fillStyle = "#94a0b8";
    ctx.strokeStyle = "#1e2330";
    ctx.lineWidth = 1;

    for (var i = 0; i < sliceTimes.length; i += step){
      var x = (i / Math.max(1, sliceTimes.length-1)) * W;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x)+0.5, 0);
      ctx.lineTo(Math.floor(x)+0.5, H-22);
      ctx.stroke();

      var txt = fmtClock(new Date(sliceTimes[i]));
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

    if (state.hover){
      var idx = clamp(state.hover.idx, 0, slice.length-1);
      var hvx = idx * xstep;
      var v = slice[idx];
      var hvy = Hplot - ((v - min) / (max - min + 1e-9)) * (Hplot - 10) - 5;

      ctx.strokeStyle="#24304a"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(Math.floor(hvx)+0.5, 0); ctx.lineTo(Math.floor(hvx)+0.5, Hplot); ctx.stroke();
      ctx.fillStyle="#00ffa3"; ctx.beginPath(); ctx.arc(hvx, hvy, 3, 0, Math.PI*2); ctx.fill();

      var txt = moneyOf(sym, v) + "  •  " + fmtClock(new Date(ts[idx]));
      ctx.font="12px Inter, ui-sans-serif";
      var pad=6, tw=ctx.measureText(txt).width;
      var bx = clamp(hvx - tw/2 - pad, 0, W - (tw + pad*2));
      var by = 8;
      ctx.fillStyle="#0f1420"; ctx.strokeStyle="#273b55"; ctx.lineWidth=1; ctx.beginPath(); ctx.rect(bx, by, tw+pad*2, 22); ctx.fill(); ctx.stroke();
      ctx.fillStyle="#dce7ff"; ctx.fillText(txt, bx+pad, by+15);
    }
  }

  // ===== Dados =====

  async function loadSeries(sym, tf, force) {
    try{
      var r = await fetch('/api/series?symbol='+encodeURIComponent(sym)+'&tf='+encodeURIComponent(tf)+'&_='+Date.now(), { cache:'no-store' });
      var j = await r.json(); // { t:[], c:[] }
      if (Array.isArray(j?.t) && Array.isArray(j?.c) && j.t.length && j.c.length){
        var ds = state.data[sym] || (state.data[sym]={px:null, chg:0, series:[], times:[]});

        // (2.1) Conversão robusta
        ds.series = j.c.slice(-HISTORY_LEN).map(Number);
        ds.times  = j.t.slice(-HISTORY_LEN).map(function(x){
          var n = Number(x);
          return n < 1e12 ? n * 1000 : n; // segundos -> ms
        });

        // (2.2) Ancorar no último preço atual
        try{
          var qr = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_='+Date.now(), { cache:'no-store' });
          var qj = await qr.json();
          if (qj && qj.px != null){
            ds.px  = Number(qj.px);
            ds.chg = Number(qj.chg || 0);
            var now = Date.now();

            if (ds.times.length) {
              var lastIdx = ds.times.length - 1;
              if (now - ds.times[lastIdx] > 90_000) {
                ds.series.push(ds.px);
                ds.times.push(now);
                while (ds.series.length > HISTORY_LEN) ds.series.shift();
                while (ds.times.length  > HISTORY_LEN) ds.times.shift();
              } else {
                ds.series[lastIdx] = ds.px;
                ds.times [lastIdx] = now;
              }
            } else {
              ds.series = [ds.px];
              ds.times  = [now];
            }
          }
        }catch{/* silencioso */}

        state.viewN = TF_POINTS[tf] || state.viewN;
        state.offset = 0;
        if (force) refresh(true); else drawChart(sym);
      }
    }catch{/* silencioso */}
  }

  async function fetchQuote(sym){
    try{
      var r = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_='+Date.now(), { cache:'no-store' });
      var j = await r.json();
      var ds = state.data[sym] || (state.data[sym]={px:null, chg:0, series:[], times:[]});
      if (j && j.px != null){
        ds.px  = Number(j.px);
        ds.chg = Number(j.chg||0);
        if (ds.series.length){
          var now = Date.now();
          ds.series.push(ds.px); ds.times.push(now);
          while (ds.series.length>HISTORY_LEN) ds.series.shift();
          while (ds.times.length >HISTORY_LEN) ds.times.shift();
        }
      }
    }catch{/* silencioso */}
  }

  // loop periódico
  var ticking=false;
  async function periodic(){
    if(ticking) return; ticking=true;

    await fetchQuote(state.active);
    var others = Object.keys(state.data).filter(function(s){ return s !== state.active; });
    for (var i=0;i<others.length;i++){ await fetchQuote(others[i]); }

    refresh(false);             // redesenha e destaca TF
    drawList($("q")?.value);    // atualiza preços da lista

    ticking=false;
  }

  setInterval(periodic, REFRESH_MS);
  (async function boot(){
    drawList("");
    await loadSeries(state.active, state.tf, true);
    await periodic();
  })();

  // ===== UI principal =====
  function refresh(forceDraw){
    var sym = state.active;
    var d = state.data[sym] || { px:null, chg:0, series:[] };
    var symEl=$("sym"), priceEl=$("price"), chgEl=$("chg");
    if(symEl)   symEl.textContent = sym;
    if(priceEl) priceEl.textContent = (d.px==null) ? (isBR(sym) ? "R$ —" : "$ —") : moneyOf(sym, d.px);
    if(chgEl){ chgEl.textContent = fmtPct(d.chg||0); chgEl.className = "pill " + ((d.chg||0)>=0 ? "up" : "down"); }

    if(forceDraw) resizeCanvas();
    drawChart(sym);
    highlightTF();              // (2.3) manter botão ativo pintado
    drawList($("q")?.value);    // manter lista sincronizada
  }

  // ===== Timeframes =====
  function setTimeframe(tf){
    state.tf = tf;
    state.viewN = TF_POINTS[tf] || 300;
    state.offset = 0;
    highlightTF();
    loadSeries(state.active, tf, true);
  }
  function highlightTF(){
    var bar = $("tfbar");
    if(!bar) return;
    bar.querySelectorAll(".tf").forEach(function(b){
      var tf = b.getAttribute("data-tf");
      b.classList.toggle("active", tf === state.tf && state.offset===0);
    });
  }

  // ===== Interações do canvas (tooltip) =====
  if (canvas){
    on(canvas, "wheel", function(e){ e.preventDefault(); /* zoom opcional */ }, { passive:false });
    on(canvas, "mousemove", function(e){
      var rect = canvas.getBoundingClientRect();
      var d = state.data[state.active];
      if(!(d && d.series.length)) return;
      var vp = getViewport(d.series);
      var view = vp.end - vp.start + 1;
      var x = (e.clientX - rect.left);
      var idx = Math.round( (x / (canvas._cssW||1)) * (view - 1) );
      state.hover = { x:x, idx: idx };
      drawChart(state.active);
    });
    on(canvas, "mouseleave", function(){ state.hover=null; drawChart(state.active); });
  }

  // ===== Botões do TF (rodapé) =====
  var tfbar = $("tfbar");
  if (tfbar){
    tfbar.querySelectorAll(".tf[data-tf]").forEach(function(btn){
      on(btn, "click", function(){ var tf = btn.getAttribute("data-tf"); if(tf) setTimeframe(tf); });
    });
  }

  // (Se tiver botões de zoom/reset, pode ligar aqui)
  onClick("resetZoom", function(){
    state.viewN = TF_POINTS[state.tf] || 300;
    state.offset = 0;
    drawChart(state.active);
    highlightTF();
  });
})();
