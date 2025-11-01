/* assets/app.js — SmartTrader AI (tempo real via /api/quote) */
(function () {
  var REFRESH_MS  = 6000;
  var HISTORY_LEN = 120;
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];

  var state = {
    active: "TSLA",
    data: {},        // {SYM:{px, chg, series:[]}}
    positions: {},   // {SYM:{qty, avg}}
    alerts: []       // [{sym, cond, val, _hit?}]
  };

  // ---------- helpers ----------
  function $(id){ return document.getElementById(id); }
  function onClick(id, fn){ var el=$(id); if(el) el.onclick = fn; }
  function onDblClick(id, fn){ var el=$(id); if(el) el.addEventListener("dblclick", fn); }
  function fmtPct(v){ return (v>=0?"+":"") + ((v||0)*100).toFixed(2) + "%"; }
  function isBR(sym){ return /\d$/.test(sym); }
  function moneyOf(sym, v){
    var fmt = isBR(sym)
      ? new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" })
      : new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" });
    var s = fmt.format(Math.abs(v||0));
    return (v<0?"-":"") + s.replace("-", "");
  }

  document.title = "SmartTrader AI";

  function tickClock(){ var c=$("clock"); if(c) c.textContent = "UTC — " + new Date().toISOString().slice(11,19) + "Z"; }
  tickClock(); setInterval(tickClock, 1000);

  DEFAULTS.forEach(function(s){ state.data[s] = { px:null, chg:0, series:[] }; });

  var list = $("list");
  function drawList(q){
    if(!list) return;
    list.innerHTML = "";
    var query = (q||"").toLowerCase();
    Object.keys(state.data)
      .filter(function(s){ return !query || s.toLowerCase().indexOf(query)>-1; })
      .forEach(function(sym){
        var d = state.data[sym] || {};
        var row = document.createElement("div");
        row.className = "ticker" + (sym===state.active ? " active" : "");
        var flag = isBR(sym) ? ' <span title="Brasil">🇧🇷</span>' : '';
        row.innerHTML =
          '<div><strong>'+sym+'</strong>'+flag+'</div>'+
          '<div class="pct '+((d.chg||0)>=0?'up':'down')+'">'+fmtPct(d.chg||0)+'</div>';
        row.onclick = function(){
          state.active = sym; drawList($("q")?.value); refresh(true);
        };
        list.appendChild(row);
      });
  }
  var qEl = $("q");
  if (qEl){
    qEl.addEventListener("input", function(e){ drawList(e.target.value); });
    qEl.addEventListener("keydown", function(e){
      if(e.key==="Enter"){
        var sym = e.target.value.trim().toUpperCase();
        if(sym){
          if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[] };
          state.active = sym; e.target.blur(); drawList(sym); refresh(true);
        }
      }
    });
  }

  // ---------- gráfico ----------
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

  function drawChart(sym) {
    if(!canvas || !ctx) return;
    var d = state.data[sym] || { series: [] };
    var W = canvas._cssW || 600, H = canvas._cssH || 260;
    ctx.clearRect(0, 0, W, H);

    var series = d.series || [];
    if (!series.length) return;

    if (series.length === 1) {
      var y = Math.floor(H/2);
      ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
      ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      return;
    }

    var min = Math.min.apply(null, series);
    var max = Math.max.apply(null, series);
    if (!isFinite(min) || !isFinite(max) || min === max) { min=(d.px||0)-1; max=(d.px||0)+1; }

    var xstep = W / Math.max(1, series.length - 1);
    ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = "#00ffa3";
    series.forEach(function (v, i) {
      var x = i * xstep;
      var y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ---------- dados ----------
 async function fetchQuote(sym){
  try{
    const r = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_=' + Date.now(), { cache:'no-store' });
    const j = await r.json();
    const px  = (j && j.px  != null) ? j.px  : null;
    const chg = (j && j.chg != null) ? j.chg : 0;

    if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[] };
    if(px != null){
      const slot = state.data[sym];
      slot.px  = px;
      slot.chg = chg;

      // --- série para o gráfico ---
      const s = slot.series;
      // valor “visual” para série: se não mudou, aplica micro-ruído
      let v = px;
      const last = s.length ? s[s.length - 1] : null;

      if (last !== null && Math.abs(px - last) < 1e-8) {
        // desvio de ±0,08% (somente visual no gráfico)
        const noise = (Math.random() - 0.5) * 0.0016; // ±0.16% no total do range
        v = px * (1 + noise);
      }

      s.push(v);

      // primeira vez: sem “linha morta” (semente com 10 pontos)
      if (s.length === 1) { for (let k = 0; k < 9; k++) s.unshift(v); }

      if (s.length > HISTORY_LEN) s.shift();
    }
  } catch (e) {
    // silencioso
  }
}

  var ticking = false;
  async function periodic(){
    if(ticking) return; ticking = true;
    await fetchQuote(state.active);
    var others = Object.keys(state.data).filter(function(s){ return s !== state.active; });
    for(var i=0;i<others.length;i++){
      await fetchQuote(others[i]); await new Promise(function(res){ setTimeout(res, 120); });
    }
    refresh(false); checkAlerts(); ticking = false;
  }

  setInterval(periodic, REFRESH_MS);
  (async function boot(){ await fetchQuote(state.active); refresh(true); periodic(); })();

  // ---------- UI ----------
  function refresh(forceDraw){
    var sym = state.active;
    var d = state.data[sym] || { px:null, chg:0, series:[] };
    var symEl=$("sym"), priceEl=$("price"), chgEl=$("chg");
    if(symEl) symEl.textContent = sym;
    if(priceEl) priceEl.textContent = (d.px==null) ? (isBR(sym) ? "R$ —" : "$ —") : moneyOf(sym, d.px);
    if(chgEl){ chgEl.textContent = fmtPct(d.chg||0); chgEl.className = "pill " + ((d.chg||0)>=0 ? "up" : "down"); }
    if(forceDraw) resizeCanvas(); drawChart(sym); drawPositions();
  }

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
      if(a.cond==="changeUp" && chg>=a.val) a._hit = true;
      if(a.cond==="changeDown" && chg<=a.val) a._hit = true;
    });
    var keep = [];
    state.alerts.forEach(function(a){ if(a._hit) pushNews("🔔 Alerta: "+a.sym+" atingiu "+a.cond+" "+a.val); else keep.push(a); });
    state.alerts = keep;
  }

  // --------- binds com proteção (evita null) ---------
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

  onDblClick("buyBtn",  function(){ openOrder("buy"); });
  onDblClick("sellBtn", function(){ openOrder("sell"); });

  drawList(""); refresh(true);
})();
