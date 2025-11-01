/* public/assets/app.js — SmartTrader AI (tempo real + séries estáveis) */
(function () {
  "use strict";

  /* ===== Config ===== */
  var REFRESH_MS  = 6000;
  var HISTORY_LEN = 120;
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];
  var TF_POINTS   = { "1m":10, "1h":60, "5h":90, "12h":110, "24h":120, "1w":120, "1mo":120, "2mo":120, "3mo":120, "ytd":120 };
  var DEFAULT_TF  = "24h";

  /* ===== Estado ===== */
  var state = {
    active:"TSLA", data:{}, positions:{}, alerts:[],
    viewN:60, offset:0, pan:null, tf:DEFAULT_TF, hover:null
  };

  /* ===== Helpers ===== */
  function $(id){ return document.getElementById(id); }
  function on(el,ev,fn,o){ if(el) el.addEventListener(ev,fn,o||false); }
  function onClick(id,fn){ var el=$(id); if(el) el.onclick=fn; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function fmtPct(v){ return (v>=0?"+":"") + ((v||0)*100).toFixed(2) + "%"; }
  function isBR(sym){ return /\d$/.test(sym); }
  function moneyOf(sym,v){
    var fmt = isBR(sym) ? new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"})
                        : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
    var s = fmt.format(Math.abs(v||0)); return (v<0?"-":"")+s.replace("-","");
  }
  function fmtClock(d){ return String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0")+"Z"; }

  /* ===== Relógio ===== */
  function tickClock(){ var c=$("clock"); if(c) c.textContent="UTC — "+new Date().toISOString().slice(11,19)+"Z"; }
  tickClock(); setInterval(tickClock,1000);

  /* ===== Sementes ===== */
  DEFAULTS.forEach(function(s){ state.data[s]={px:null, chg:0, series:[], times:[]}; });

  /* ===== Lista (com preço) ===== */
  var list=$("list");
  function drawList(q){
    if(!list) return; list.innerHTML="";
    var query=(q||"").toLowerCase();
    Object.keys(state.data).filter(function(s){ return !query || s.toLowerCase().includes(query); })
      .forEach(function(sym){
        var d=state.data[sym]||{};
        var row=document.createElement("div");
        row.className="ticker"+(sym===state.active?" active":"");
        var flag=isBR(sym)?' <span title="Brasil">🇧🇷</span>':'';
        var pxTxt = d.px==null ? (isBR(sym)?"R$ —":"$ —") : moneyOf(sym,d.px);
        row.innerHTML =
          '<div class="lhs"><span class="sym">'+sym+'</span>'+flag+'</div>'+
          '<div class="px">'+pxTxt+'</div>'+
          '<div class="pct '+((d.chg||0)>=0?'up':'down')+'">'+fmtPct(d.chg||0)+'</div>';
        row.onclick=function(){ state.active=sym; state.offset=0; drawList($("q")?.value); setTimeframe(state.tf); };
        list.appendChild(row);
      });
  }
  var qEl=$("q");
  if(qEl){
    on(qEl,"input", e=>drawList(e.target.value));
    on(qEl,"keydown", function(e){
      if(e.key==="Enter"){
        var sym=e.target.value.trim().toUpperCase();
        if(sym){
          if(!state.data[sym]) state.data[sym]={px:null,chg:0,series:[],times:[]};
          state.active=sym; state.offset=0; e.target.blur(); drawList(sym); setTimeframe(state.tf);
        }
      }
    });
  }

  /* ===== Canvas / Gráfico ===== */
  var canvas=$("chart"), ctx=canvas?canvas.getContext("2d"):null;
  function resizeCanvas(){ if(!canvas||!ctx) return; var r=canvas.getBoundingClientRect();
    var cssW=Math.max(1,Math.floor(r.width||canvas.clientWidth||600));
    var cssH=Math.max(1,Math.floor(r.height||260)); var dpr=(window.devicePixelRatio||1);
    canvas.width=cssW*dpr; canvas.height=cssH*dpr; ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
    canvas._cssW=cssW; canvas._cssH=cssH;
  }
  on(window,"resize", function(){ resizeCanvas(); drawChart(state.active); }); resizeCanvas();

  function getViewport(series){
    var n=series.length; if(n===0) return {start:0,end:0,view:0};
    var view=clamp(state.viewN,2,n), maxOffset=Math.max(0,n-view);
    state.offset=clamp(state.offset,0,maxOffset);
    var end=n-1-state.offset, start=end-(view-1); if(start<0){ start=0; end=start+view-1; }
    return {start:start,end:end,view:view};
  }
  function drawAxesAndLabels(W,H,ts){
    var divisions=4, step=Math.max(1,Math.floor((ts.length-1)/divisions));
    ctx.font="12px Inter, ui-sans-serif"; ctx.fillStyle="#94a0b8"; ctx.strokeStyle="#1e2330"; ctx.lineWidth=1;
    for(var i=0;i<ts.length;i+=step){
      var x=(i/Math.max(1,ts.length-1))*W; ctx.beginPath(); ctx.moveTo(Math.floor(x)+0.5,0); ctx.lineTo(Math.floor(x)+0.5,H-22); ctx.stroke();
      var t=new Date(ts[i]); var txt=fmtClock(t); var tw=ctx.measureText(txt).width; var tx=clamp(x-tw/2,0,W-tw); ctx.fillText(txt,tx,H-6);
    }
  }
  function drawChart(sym){
    if(!canvas||!ctx) return;
    var d=state.data[sym]||{series:[],times:[]}; var W=canvas._cssW||600, H=canvas._cssH||260;
    ctx.clearRect(0,0,W,H); var s=d.series||[], ts=d.times||[]; if(!s.length) return;
    var vp=getViewport(s), slice=s.slice(vp.start,vp.end+1), tsel=ts.slice(vp.start,vp.end+1);
    if(slice.length<=1){ var y=Math.floor((H-22)/2); ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle="#00ffa3"; ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); return; }
    drawAxesAndLabels(W,H,tsel);
    var Hplot=H-22, min=Math.min.apply(null,slice), max=Math.max.apply(null,slice);
    if(!isFinite(min)||!isFinite(max)||min===max){ min=(d.px||0)-1; max=(d.px||0)+1; }
    var xstep=W/Math.max(1,slice.length-1); ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle="#00ffa3";
    for(var i=0;i<slice.length;i++){ var v=slice[i], x=i*xstep, y=Hplot-((v-min)/(max-min+1e-9))*(Hplot-10)-5; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.stroke();

    if(state.hover){
      var idx=clamp(state.hover.idx,0,slice.length-1), hvx=idx*xstep;
      var v=slice[idx], y=Hplot-((v-min)/(max-min+1e-9))*(Hplot-10)-5;
      ctx.strokeStyle="#24304a"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(Math.floor(hvx)+0.5,0); ctx.lineTo(Math.floor(hvx)+0.5,Hplot); ctx.stroke();
      ctx.fillStyle="#00ffa3"; ctx.beginPath(); ctx.arc(hvx,y,3,0,Math.PI*2); ctx.fill();
      var txt=moneyOf(sym,v)+"  •  "+fmtClock(new Date(tsel[idx])); ctx.font="12px Inter, ui-sans-serif";
      var pad=6, tw=ctx.measureText(txt).width, bx=clamp(hvx-tw/2-pad,0,W-(tw+pad*2)), by=8;
      ctx.fillStyle="#0f1420"; ctx.strokeStyle="#273b55"; ctx.beginPath(); ctx.rect(bx,by,tw+pad*2,22); ctx.fill(); ctx.stroke();
      ctx.fillStyle="#dce7ff"; ctx.fillText(txt,bx+pad,by+15);
    }
  }

  /* ===== Dados ===== */
  async function loadSeries(sym, tf, forceRedraw){
    try{
      const r  = await fetch('/api/series?symbol='+encodeURIComponent(sym)+'&tf='+encodeURIComponent(tf)+'&_='+Date.now(), { cache:'no-store' });
      const j  = await r.json(); // { t:[], c:[] }
      if(Array.isArray(j?.t) && Array.isArray(j?.c) && j.t.length && j.c.length){
        const ds = state.data[sym] || (state.data[sym]={px:null,chg:0,series:[],times:[]});
        ds.series = j.c.slice(-HISTORY_LEN);
        ds.times  = j.t.slice(-HISTORY_LEN).map(x => (typeof x==="number" && x<1e12) ? x*1000 : x);

        // ancora no último quote
        const qr = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_='+Date.now(), { cache:'no-store' });
        const qj = await qr.json();
        if (qj && qj.px != null){
          ds.px  = Number(qj.px);
          ds.chg = Number(qj.chg||0);
          const now = Date.now();
          if (ds.times.length && now - ds.times[ds.times.length-1] > 2000){
            ds.series.push(ds.px); ds.times.push(now);
          } else {
            ds.series[ds.series.length-1] = ds.px;
            ds.times [ds.times.length -1] = now;
          }
        }

        state.viewN = Math.max(2, TF_POINTS[tf] || state.viewN);
        state.offset = 0;
        if(forceRedraw) refresh(true); else drawChart(sym);
      }
    } catch(e){ /* keep last */ }
  }

  async function fetchQuote(sym){
    try{
      const r  = await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_='+Date.now(), { cache:'no-store' });
      const j  = await r.json();
      const ds = state.data[sym] || (state.data[sym]={px:null,chg:0,series:[],times:[]});
      if(j && j.px != null){
        ds.px  = Number(j.px);
        ds.chg = Number(j.chg||0);
        if (ds.series.length){
          const now = Date.now();
          ds.series.push(ds.px); ds.times.push(now);
          while(ds.series.length>HISTORY_LEN) ds.series.shift();
          while(ds.times.length >HISTORY_LEN) ds.times.shift();
        }
      }
    } catch(e){ /* silencioso */ }
  }

  var ticking=false;
  async function periodic(){
    if(ticking) return; ticking=true;
    await fetchQuote(state.active);
    const others = Object.keys(state.data).filter(s=>s!==state.active);
    for(let i=0;i<others.length;i++){ await fetchQuote(others[i]); }
    drawList($("q")?.value);
    refresh(false);
    checkAlerts();
    ticking=false;
  }

  setInterval(periodic, REFRESH_MS);
  (async function boot(){ drawList(""); await loadSeries(state.active, state.tf, true); await periodic(); })();

  /* ===== UI ===== */
  function refresh(forceDraw){
    var sym=state.active, d=state.data[sym]||{px:null,chg:0,series:[]};
    var symEl=$("sym"), priceEl=$("price"), chgEl=$("chg");
    if(symEl) symEl.textContent=sym;
    if(priceEl) priceEl.textContent = (d.px==null) ? (isBR(sym)?"R$ —":"$ —") : moneyOf(sym,d.px);
    if(chgEl){ chgEl.textContent=fmtPct(d.chg||0); chgEl.className="pill "+((d.chg||0)>=0?"up":"down"); }
    if(forceDraw) resizeCanvas();
    drawChart(sym); drawPositions(); highlightTF();
  }

  function drawPositions(){ var table=$("pos"); if(!table) return;
    var tb=table.getElementsByTagName("tbody")[0]; if(!tb) return; tb.innerHTML="";
    Object.keys(state.positions).forEach(function(sym){
      var pos=state.positions[sym]; var px=(state.data[sym]&&state.data[sym].px!=null)?state.data[sym].px:pos.avg;
      var pl=(px-pos.avg)*pos.qty; var tr=document.createElement("tr");
      tr.innerHTML="<td>"+sym+"</td><td>"+pos.qty+"</td><td>"+moneyOf(sym,pos.avg)+"</td>"+
                   '<td class="'+(pl>=0?"ok":"danger")+'">'+moneyOf(sym,pl)+"</td>";
      tb.appendChild(tr);
    });
  }
  function pushNews(txt){ var box=document.createElement("div"); box.className="news-item";
    box.innerHTML="<div>"+txt+"</div>"+'<div class="muted small">'+new Date().toLocaleTimeString()+"</div>";
    var news=$("news"); if(news) news.prepend(box);
  }
  function trade(side,sym,qty,px){
    var p=state.positions[sym]||{qty:0,avg:px};
    if(side==="buy"){ var nq=p.qty+qty; p.avg=(p.avg*p.qty+px*qty)/(nq||1); p.qty=nq; }
    else{ p.qty=Math.max(0,p.qty-qty); if(p.qty===0) p.avg=px; }
    state.positions[sym]=p; pushNews((side==="buy"?"🟢 Comprado":"🔴 Vendido")+": "+qty+" "+sym+" @ "+moneyOf(sym,px)+" (paper)");
    drawPositions();
  }
  function checkAlerts(){
    state.alerts.forEach(a=>a._hit=false);
    state.alerts.forEach(function(a){ var d=state.data[a.sym]; if(!d) return; var px=d.px, ch=(d.chg||0)*100;
      if(a.cond==="above"&&px>=a.val) a._hit=true;
      if(a.cond==="below"&&px<=a.val) a._hit=true;
      if(a.cond==="changeUp"&&ch>=a.val) a._hit=true;
      if(a.cond==="changeDown"&&ch<=a.val) a._hit=true;
    });
    var keep=[]; state.alerts.forEach(a=>{ if(a._hit) pushNews("🔔 Alerta: "+a.sym+" atingiu "+a.cond+" "+a.val); else keep.push(a); });
    state.alerts=keep;
  }

  /* ===== Timeframes / Zoom / Pan ===== */

  // (1) Marca botão ativo em TODAS as barras
  function highlightTF(){
    document.querySelectorAll('.tf[data-tf]').forEach(function(b){
      var tf=b.getAttribute('data-tf');
      b.classList.toggle('active', tf===state.tf && state.offset===0);
    });
  }

  function setTimeframe(tf){
    state.tf=tf;
    state.viewN=Math.max(2,TF_POINTS[tf]||HISTORY_LEN);
    state.offset=0;
    highlightTF();
    loadSeries(state.active,tf,true);
  }

  // (2) Ligar TODOS os botões de timeframe existentes (topo e rodapé)
  (function wireTFButtons(){
    document.querySelectorAll('.tf[data-tf]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var tf = btn.getAttribute('data-tf');
        if(tf) setTimeframe(tf);
      });
    });
  })();

  function zoom(delta){
    var v=state.viewN;
    v = delta>0 ? Math.max(5,Math.floor(v*0.8)) : Math.min(HISTORY_LEN,Math.ceil(v*1.25));
    state.viewN=v;
    state.offset=clamp(state.offset,0,Math.max(0,(state.data[state.active]?.series.length||0)-state.viewN));
    drawChart(state.active); highlightTF();
  }
  function resetZoom(){ state.viewN=TF_POINTS[state.tf]||60; state.offset=0; drawChart(state.active); highlightTF(); }

  onClick("zoomIn", function(){ zoom(1);  });
  onClick("zoomOut",function(){ zoom(-1); });
  onClick("resetZoom", resetZoom);

  if(canvas){
    on(canvas,"wheel", function(e){ e.preventDefault(); zoom(e.deltaY<0?1:-1); }, {passive:false});
    on(canvas,"mousedown", function(e){ var r=canvas.getBoundingClientRect(); state.pan={x:e.clientX-r.left, startOffset:state.offset}; });
    on(window,"mouseup", function(){ state.pan=null; });
    on(window,"mousemove", function(e){
      var r=canvas.getBoundingClientRect(), d=state.data[state.active]; if(d&&d.series.length){
        var vp=getViewport(d.series), view=vp.end-vp.start+1, x=(e.clientX-r.left), idx=Math.round((x/(canvas._cssW||1))*(view-1));
        state.hover={x:x, idx:idx}; drawChart(state.active);
      }
      if(!state.pan) return; var s=state.data[state.active]?.series||[]; if(s.length<2) return;
      var dx=(e.clientX-r.left)-state.pan.x, vp2=getViewport(s), perPx=vp2.view/(canvas._cssW||1), shift=Math.round(dx*perPx);
      var maxOffset=Math.max(0,s.length-vp2.view); state.offset=clamp(state.pan.startOffset+shift,0,maxOffset); drawChart(state.active);
    });
    on(canvas,"mouseleave", function(){ state.hover=null; drawChart(state.active); });
  }

  /* ===== Modais (alert) ===== */
  onClick("alertBtn",function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) openAlert(s,"above",(px*1.02).toFixed(2)); });
  function openAlert(sym,cond,val){ var m=$("alertModal"); if(!m) return; var as=$("aSym"),ac=$("aCond"),av=$("aVal"); if(as) as.value=sym; if(ac) ac.value=cond; if(av) av.value=val; m.classList.add("open"); }
  function closeAlert(){ var m=$("alertModal"); if(m) m.classList.remove("open"); }
  onClick("cancelAlert", closeAlert); onClick("closeAlert", closeAlert);

  // buy/sell mantidos
  onClick("buyBtn",  function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) trade("buy", s, 10, px); });
  onClick("sellBtn", function(){ var s=state.active, px=state.data[s]?.px; if(px!=null) trade("sell",s,10,px); });

})();
