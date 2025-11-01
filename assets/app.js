/* assets/app.js — SmartTrader AI (dados reais via /api/quote) */
(function () {
  // ===== Config =====
  var REFRESH_MS  = 6000;   // atualiza quote a cada 6s (respeita limites)
  var HISTORY_LEN = 120;    // pontos no gráfico
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];

  // ===== Estado =====
  var state = {
    active: "TSLA",
    data: {},        // {SYM:{px, chg, series:[]}}
    positions: {},   // {SYM:{qty, avg}}
    alerts: []       // [{sym, cond, val, _hit?}]
  };

  // ===== Utils =====
  function $(id){ return document.getElementById(id); }
  function fmtPct(v){ return (v>=0?"+":"") + ( (v||0)*100 ).toFixed(2) + "%"; }
  function isBR(sym){ return /\d$/.test(sym); } // termina com dígito → B3
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
  function tickClock(){
    $("clock").textContent = "UTC — " + new Date().toISOString().slice(11,19) + "Z";
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ===== Lista inicial =====
  DEFAULTS.forEach(function(s){ state.data[s] = { px:null, chg:0, series:[] }; });

  // ===== Render da lista =====
  var list = $("list");
  function drawList(q){
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
          state.active = sym;
          drawList($("q").value);
          refresh(true);
        };
        list.appendChild(row);
      });
  }
  $("q").addEventListener("input", function(e){ drawList(e.target.value); });
  $("q").addEventListener("keydown", function(e){
    if(e.key==="Enter"){
      var sym = e.target.value.trim().toUpperCase();
      if(sym){
        if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[] };
        state.active = sym;
        e.target.blur();
        drawList(sym);
        refresh(true);
      }
    }
  });

  // ===== Canvas (gráfico responsivo) =====
  var canvas = $("chart"), ctx = canvas.getContext("2d");

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.floor(rect.width || canvas.clientWidth || 600));
    var cssH = Math.max(1, Math.floor(rect.height || 260));
    var dpr  = (window.devicePixelRatio || 1);

    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;

    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);

    canvas._cssW = cssW;
    canvas._cssH = cssH;
  }
  window.addEventListener("resize", function () { resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  function drawChart(sym) {
    var d = state.data[sym] || { series: [] };
    var W = canvas._cssW || 600;
    var H = canvas._cssH || 260;

    ctx.clearRect(0, 0, W, H);

    var series = d.series || [];
    if (!series.length) return;

    var min = Math.min.apply(null, series);
    var max = Math.max.apply(null, series);
    if (!isFinite(min) || !isFinite(max) || min === max) {
      min = (d.px || 0) - 1;
      max = (d.px || 0) + 1;
    }

    var xstep = W / Math.max(1, series.length - 1);
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#00ffa3";
    series.forEach(function (v, i) {
      var x = i * xstep;
      var y = H - ((v - min) / (max - min + 1e-9)) * (H - 10) - 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ===== Semeia série com 2 pontos (linha visível já no 1º tick) =====
  function seedSeries(sym, px){
    var d = state.data[sym];
    if(!d.series || d.series.length === 0){
      d.series = [px, px]; // 2 pontos idênticos => linha visível
    } else if(d.series.length === 1){
      d.series.push(d.series[0]); // garante >=2
    }
  }

  // ===== Quote remoto (com anti-cache) =====
  async function fetchQuote(sym){
    try{
      var r = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_='+Date.now(), { cache:'no-store' });
      var j = await r.json();
      var px  = (j && j.px  != null) ? Number(j.px)  : null;
      var chg = (j && j.chg != null) ? Number(j.chg) : 0;

      if(!state.data[sym]) state.data[sym] = { px:null, chg:0, series:[] };
      if(px != null && isFinite(px)){
        var slot = state.data[sym];
        slot.px  = px;
        slot.chg = (isFinite(chg) ? chg : slot.chg);

        seedSeries(sym, px);              // <<<<<<<<<<<<<< chave para aparecer
        var s = slot.series;
        s.push(px);
        if(s.length > HISTORY_LEN) s.shift();
      }
    }catch(e){
      // silencioso
    }
  }

  // ===== Atualização periódica =====
  var ticking = false;
  async function periodic(){
    if(ticking) return;
    ticking = true;

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

  // primeira carga imediata
  (async function boot(){
    await fetchQuote(state.active); // 1º ponto
    resizeCanvas();                 // garante buffer correto
    refresh(true);                  // já desenha
    periodic();                     // inicia loop
  })();

  // ===== UI refresh =====
  function refresh(forceDraw){
    var sym = state.active;
    var d = state.data[sym] || { px:null, chg:0, series:[] };

    $("sym").textContent = sym;
    $("price").textContent = (d.px==null) ? (isBR(sym) ? "R$ —" : "$ —") : moneyOf(sym, d.px);

    var chgEl = $("chg");
    chgEl.textContent = fmtPct(d.chg||0);
    chgEl.className = "chg " + ((d.chg||0)>=0 ? "up" : "down");

    if(forceDraw) resizeCanvas();
    drawChart(sym);
    drawPositions();
  }

  // ===== Posições (paper) =====
  function drawPositions(){
    var tb = $("pos").getElementsByTagName("tbody")[0];
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
    $("news").prepend(box);
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

  // ===== Alertas =====
  function checkAlerts(){
    state.alerts.forEach(function(a){ a._hit = false; });
    state.alerts.forEach(function(a){
      var d = state.data[a.sym]; if(!d) return;
      var px = d.px, chg = (d.chg||0)*100;
      if(a.cond==="above"      && px  >= a.val) a._hit = true;
      if(a.cond==="below"      && px  <= a.val) a._hit = true;
      if(a.cond==="changeUp"   && chg >= a.val) a._hit = true;
      if(a.cond==="changeDown" && chg <= a.val) a._hit = true;
    });
    var keep = [];
    state.alerts.forEach(function(a){
      if(a._hit) pushNews("🔔 Alerta: "+a.sym+" atingiu "+a.cond+" "+a.val);
      else keep.push(a);
    });
    state.alerts = keep;
  }

  // Botões rápidos
  $("buyBtn").onclick  = function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) trade("buy",  s, 10, px); };
  $("sellBtn").onclick = function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) trade("sell", s, 10, px); };
  $("alertBtn").onclick = function(){
    var s=state.active, px=state.data[s]?.px;
    if(px!=null) openAlert(s, "above", (px*1.02).toFixed(2));
  };

  // Modais
  function openOrder(side){
    $("orderTitle").textContent = side==="buy" ? "Comprar" : "Vender";
    $("mSym").value = state.active;
    $("mSide").value = side;
    $("mQty").value = 10;
    $("mPx").value  = (state.data[state.active]?.px ?? 0).toFixed(2);
    $("orderModal").classList.add("open");
  }
  function closeOrder(){ $("orderModal").classList.remove("open"); }
  function openAlert(sym, cond, val){
    $("aSym").value = sym; $("aCond").value = cond; $("aVal").value = val;
    $("alertModal").classList.add("open");
  }
  function closeAlert(){ $("alertModal").classList.remove("open"); }

  $("cancelOrder").onclick = closeOrder;
  $("closeOrder").onclick  = closeOrder;
  $("confirmOrder").onclick = function(){
    var sym  = $("mSym").value.trim().toUpperCase();
    var side = $("mSide").value;
    var qty  = Math.max(1, parseInt($("mQty").value || "1", 10));
    var px   = state.data[sym]?.px ?? parseFloat($("mPx").value);
    if(isFinite(px)) trade(side, sym, qty, px);
    closeOrder();
  };

  $("cancelAlert").onclick = closeAlert;
  $("closeAlert").onclick  = closeAlert;
  $("confirmAlert").onclick = function(){
    var sym  = $("aSym").value.trim().toUpperCase();
    var cond = $("aCond").value;
    var val  = parseFloat($("aVal").value);
    if(isFinite(val)){
      state.alerts.push({ sym:sym, cond:cond, val:val });
      pushNews("✅ Alerta criado: "+sym+" "+cond+" "+val);
    }
    closeAlert();
  };

  // Atalhos (duplo clique abre modal completo)
  $("buyBtn").addEventListener("dblclick", function(){ openOrder("buy"); });
  $("sellBtn").addEventListener("dblclick", function(){ openOrder("sell"); });

  // Primeira render
  drawList("");
  refresh(true);
})();
