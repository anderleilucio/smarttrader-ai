/* public/assets/app.js — SmartTrader AI (TFs + Zoom/Pan, robusto) */
(function () {
  "use strict";

  // ===== Config =====
  var REFRESH_MS  = 6000;
  var HISTORY_LEN = 1200; // suporta 1D em 1m e 1W em 5m
  var DEFAULTS    = ["TSLA","NVDA","AAPL","AMZN","MSFT","ITUB4","VALE3","PETR4"];

  // Pontos-alvo por janela
  var TF_POINTS = {
    // rótulos tipo Robinhood
    "1D": 300, "1W": 300, "1M": 300, "3M": 300, "1Y": 300, "5Y": 300, "MAX": 300,
    // tokens da API (fallback)
    "1m": 120, "1h": 300, "5h": 300, "12h": 300, "24h": 300, "1w": 300, "1mo": 300, "2mo": 300, "3mo": 300, "ytd": 300
  };
  var DEFAULT_TF_LABEL = "1D"; // visto pelo usuário
  var DEFAULT_API_TF   = "24h"; // enviado ao backend

  // ===== Estado =====
  var state = {
    active: "TSLA",
    data: {},                 // data[SYM] = { px, chg, series:number[], times:number[] }
    positions: {},
    alerts: [],
    viewN: TF_POINTS[DEFAULT_TF_LABEL],
    offset: 0,                // 0 = ancorado na ponta direita
    tf: DEFAULT_API_TF,
    tfLabel: DEFAULT_TF_LABEL,
    hover: null,              // { x, idx }
    pan: null                 // { startX, startOffset }
  };

  // ===== Helpers =====
  function $(idOrEl){ return typeof idOrEl==="string" ? document.getElementById(idOrEl) : (idOrEl||null); }
  function on(target, ev, fn, opts){
    if (!target) return;
    const add = (el)=> el && el.addEventListener && el.addEventListener(ev, fn, opts||false);
    if (typeof target==="string") return add($(target));
    if (target===window || target===document || target instanceof Element) return add(target);
    if (NodeList.prototype.isPrototypeOf(target) || Array.isArray(target)) target.forEach(add);
  }
  function clamp(v,a,b){ if(a>b){var t=a;a=b;b=t;} return Math.max(a, Math.min(b, v)); }
  function fmtPct(v,dig){ var n=Number(v); if(!isFinite(n)) n=0; return (n>=0?"+":"")+ (n*100).toFixed(dig??2) + "%"; }
  function isBR(sym){ return /\d{1,2}$/.test(String(sym||"")); }
  function moneyOf(sym,v){
    var n=Number(v); if(!isFinite(n)) return isBR(sym)?"R$ —":"$ —";
    var neg=n<0; n=Math.abs(n);
    var fmt = isBR(sym)
      ? new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2})
      : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
    return (neg?"-":"")+fmt.format(n);
  }
  function fmtClock(d){
    var dt = d instanceof Date ? d : new Date(Number(d));
    if(isNaN(dt)) return "--:--Z";
    return String(dt.getUTCHours()).padStart(2,"0")+":"+String(dt.getUTCMinutes()).padStart(2,"0")+"Z";
  }

  // Mapas TF (rótulo <-> token API)
  function mapTf(labelOrToken){
    var L=String(labelOrToken||"").trim(); var U=L.toUpperCase(); var low=L.toLowerCase();
    if (U==="1D") return "24h";
    if (U==="1W") return "1w";
    if (U==="1M") return "1mo";
    if (U==="2M") return "2mo";
    if (U==="3M") return "3mo";
    if (U==="YTD"||U==="1Y"||U==="5Y"||U==="MAX") return "ytd"; // simplificado
    if (["1m","1h","5h","12h","24h","1w","1mo","2mo","3mo","ytd"].includes(low)) return low;
    return "24h";
  }
  function labelFromToken(token){
    var t=String(token||"").toLowerCase();
    if (t==="24h") return "1D";
    if (t==="1w")  return "1W";
    if (t==="1mo") return "1M";
    if (t==="2mo") return "2M";
    if (t==="3mo") return "3M";
    if (t==="ytd") return "YTD";
    return t.toUpperCase();
  }

  // relógio topo
  function tickClock(){ var c=$("clock"); if(c) c.textContent="UTC — "+new Date().toISOString().slice(11,19)+"Z"; }
  tickClock(); setInterval(tickClock,1000);

  // sementes
  DEFAULTS.forEach(function(s){ state.data[s]={px:null, chg:0, series:[], times:[]}; });

  // ===== Lista =====
  var list=$("list");
  function drawList(q){
    if(!list) return;
    list.innerHTML="";
    var query=(q||"").toLowerCase();
    Object.keys(state.data).filter(s=>!query||s.toLowerCase().includes(query)).forEach(function(sym){
      var d=state.data[sym]||{};
      var row=document.createElement("div");
      row.className="ticker"+(sym===state.active?" active":"");
      var flag=isBR(sym)?' <span title="Brasil">🇧🇷</span>':'';
      var pxTxt=d.px==null?(isBR(sym)?"R$ —":"$ —"):moneyOf(sym,d.px);
      row.innerHTML='<div><strong>'+sym+'</strong>'+flag+'</div>'+
                    '<div class="px">'+pxTxt+'</div>'+
                    '<div class="pct '+((d.chg||0)>=0?'up':'down')+'">'+fmtPct(d.chg||0)+'</div>';
      row.onclick=function(){ state.active=sym; state.offset=0; drawList($("q")?.value); setTimeframe(state.tfLabel); };
      list.appendChild(row);
    });
  }
  var qEl=$("q");
  if(qEl){
    on(qEl,"input",e=>drawList(e.target.value));
    on(qEl,"keydown",function(e){
      if(e.key==="Enter"){
        var sym=e.target.value.trim().toUpperCase();
        if(sym){
          if(!state.data[sym]) state.data[sym]={px:null,chg:0,series:[],times:[]};
          state.active=sym; state.offset=0; e.target.blur(); drawList(sym); setTimeframe(state.tfLabel);
        }
      }
    });
  }

  // ===== Canvas / chart =====
  var canvas=$("chart"), ctx=canvas?canvas.getContext("2d"):null;
  function resizeCanvas(){
    if(!canvas||!ctx) return;
    var r=canvas.getBoundingClientRect();
    var cssW=Math.max(1,Math.floor(r.width||canvas.clientWidth||600));
    var cssH=Math.max(1,Math.floor(r.height||260));
    var dpr=(window.devicePixelRatio||1);
    canvas.width=cssW*dpr; canvas.height=cssH*dpr;
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
    canvas._cssW=cssW; canvas._cssH=cssH;
  }
  on(window,"resize",function(){ resizeCanvas(); drawChart(state.active); });
  resizeCanvas();

  function getViewport(series){
    var n=series.length; if(!n) return {start:0,end:0,view:0};
    var view=clamp(state.viewN,2,n);
    var maxOffset=Math.max(0,n-view);
    state.offset=clamp(state.offset,0,maxOffset);
    var end=n-1-state.offset, start=end-(view-1); if(start<0){ start=0; end=start+view-1; }
    return {start:start,end:end,view:view};
  }

  function drawAxesAndLabels(W,H,ts){
    var divisions=4, step=Math.max(1,Math.floor((ts.length-1)/divisions));
    ctx.font="12px Inter, ui-sans-serif"; ctx.fillStyle="#94a0b8"; ctx.strokeStyle="#1e2330"; ctx.lineWidth=1;
    for(var i=0;i<ts.length;i+=step){
      var x=(i/Math.max(1,ts.length-1))*W;
      ctx.beginPath(); ctx.moveTo(Math.floor(x)+0.5,0); ctx.lineTo(Math.floor(x)+0.5,H-22); ctx.stroke();
      var txt=fmtClock(new Date(ts[i])); var tw=ctx.measureText(txt).width; var tx=clamp(x-tw/2,0,W-tw);
      ctx.fillText(txt,tx,H-6);
    }
  }

  function drawChart(sym){
    if(!canvas||!ctx) return;
    var d=state.data[sym]||{series:[],times:[]};
    var W=canvas._cssW||600, H=canvas._cssH||260;
    ctx.clearRect(0,0,W,H);

    var s=d.series||[], ts=d.times||[]; if(!s.length) return;

    var vp=getViewport(s), slice=s.slice(vp.start,vp.end+1), tsel=ts.slice(vp.start,vp.end+1);
    if(slice.length<=1){ var y=Math.floor((H-22)/2); ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle="#00ffa3"; ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); return; }

    drawAxesAndLabels(W,H,tsel);

    var Hpad=22, Hplot=H-Hpad;
    var min=Math.min.apply(null,slice), max=Math.max.apply(null,slice);
    if(!isFinite(min)||!isFinite(max)||min===max){ min=(d.px||0)-1; max=(d.px||0)+1; }

    var xstep=W/Math.max(1,slice.length-1);
    ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle="#00ffa3";
    for(var i=0;i<slice.length;i++){
      var v=slice[i], x=i*xstep, y=Hplot-((v-min)/(max-min+1e-9))*(Hplot-10)-5;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    if(state.hover){
      var idx=clamp(state.hover.idx,0,slice.length-1), hvx=idx*xstep, v2=slice[idx];
      var y2=Hplot-((v2-min)/(max-min+1e-9))*(Hplot-10)-5;
      ctx.strokeStyle="#24304a"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(Math.floor(hvx)+0.5,0); ctx.lineTo(Math.floor(hvx)+0.5,Hplot); ctx.stroke();
      ctx.fillStyle="#00ffa3"; ctx.beginPath(); ctx.arc(hvx,y2,3,0,Math.PI*2); ctx.fill();

      var txt=moneyOf(sym,v2)+"  •  "+fmtClock(new Date(tsel[idx]));
      ctx.font="12px Inter, ui-sans-serif";
      var pad=6, tw=ctx.measureText(txt).width, bx=clamp(hvx-tw/2-pad,0,W-(tw+pad*2)), by=8;
      ctx.fillStyle="#0f1420"; ctx.strokeStyle="#273b55"; ctx.beginPath(); ctx.rect(bx,by,tw+pad*2,22); ctx.fill(); ctx.stroke();
      ctx.fillStyle="#dce7ff"; ctx.fillText(txt,bx+pad,by+15);
    }
  }

  // ===== Dados =====
  async function loadSeries(sym, apiTf, force){
    try{
      var r=await fetch('/api/series?symbol='+encodeURIComponent(sym)+'&tf='+encodeURIComponent(apiTf)+'&_='+Date.now(),{cache:'no-store'});
      var j=await r.json(); // {t:[], c:[]}
      if(Array.isArray(j?.t)&&Array.isArray(j?.c)&&j.t.length&&j.c.length){
        var ds=state.data[sym]||(state.data[sym]={px:null,chg:0,series:[],times:[]});
        ds.series=j.c.slice(-HISTORY_LEN).map(Number);
        ds.times =j.t.slice(-HISTORY_LEN).map(x=>{var n=Number(x); return n<1e12?n*1000:n;});

        // ancora ultimo preço
        try{
          var qr=await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_='+Date.now(),{cache:'no-store'});
          var qj=await qr.json();
          if(qj&&qj.px!=null){
            ds.px=Number(qj.px); ds.chg=Number(qj.chg||0);
            var now=Date.now();
            if(ds.times.length){
              var k=ds.times.length-1;
              if(now-ds.times[k]>90_000){ ds.series.push(ds.px); ds.times.push(now); }
              else { ds.series[k]=ds.px; ds.times[k]=now; }
              while(ds.series.length>HISTORY_LEN) ds.series.shift();
              while(ds.times.length>HISTORY_LEN)  ds.times.shift();
            } else { ds.series=[ds.px]; ds.times=[now]; }
          }
        }catch{}

        state.viewN=TF_POINTS[state.tfLabel]||TF_POINTS[apiTf]||state.viewN;
        state.offset=0;
        if(force) refresh(true); else drawChart(sym);
      }
    }catch{}
  }

  async function fetchQuote(sym){
    try{
      var r=await fetch('/api/quote?symbol='+encodeURIComponent(sym)+'&_='+Date.now(),{cache:'no-store'});
      var j=await r.json();
      var ds=state.data[sym]||(state.data[sym]={px:null,chg:0,series:[],times:[]});
      if(j&&j.px!=null){
        ds.px=Number(j.px); ds.chg=Number(j.chg||0);
        if(ds.series.length){
          var now=Date.now(); ds.series.push(ds.px); ds.times.push(now);
          while(ds.series.length>HISTORY_LEN) ds.series.shift();
          while(ds.times.length>HISTORY_LEN)  ds.times.shift();
        }
      }
    }catch{}
  }

  // ===== Loop periódico =====
  var ticking=false;
  async function periodic(){
    if(ticking) return; ticking=true;

    await fetchQuote(state.active);
    var others=Object.keys(state.data).filter(s=>s!==state.active);
    for(let i=0;i<others.length;i++) await fetchQuote(others[i]);

    refresh(false); drawList($("q")?.value);
    ticking=false;
  }
  setInterval(periodic,REFRESH_MS);

  (async function boot(){
    drawList("");
    await loadSeries(state.active, state.tf, true);
    await periodic();
    wireTfBars();
  })();

  // ===== UI principal =====
  function refresh(forceDraw){
    var sym=state.active, d=state.data[sym]||{px:null,chg:0,series:[]};
    var symEl=$("sym"), priceEl=$("price"), chgEl=$("chg");
    if(symEl) symEl.textContent=sym;
    if(priceEl) priceEl.textContent=(d.px==null)?(isBR(sym)?"R$ —":"$ —"):moneyOf(sym,d.px);
    if(chgEl){ chgEl.textContent=fmtPct(d.chg||0); chgEl.className="pill "+((d.chg||0)>=0?"up":"down"); }
    if(forceDraw) resizeCanvas();
    drawChart(sym); highlightTF();
  }

  // ===== Timeframes =====
  function setTimeframe(labelOrToken){
    var label=String(labelOrToken||DEFAULT_TF_LABEL).trim();
    var apiTf=mapTf(label);
    state.tf=apiTf; state.tfLabel=labelFromToken(apiTf);
    state.viewN=TF_POINTS[state.tfLabel]||TF_POINTS[apiTf]||300;
    state.offset=0;
    highlightTF();
    loadSeries(state.active, apiTf, true);
  }
  function highlightTF(){
    var current=state.tfLabel;
    document.querySelectorAll(".tfbar .tf").forEach(function(btn){
      var l=(btn.getAttribute("data-tf")||btn.textContent||"").trim();
      var isActive=(labelFromToken(mapTf(l))===current && state.offset===0);
      btn.classList.toggle("active", isActive);
    });
  }
  function wireTfBars(){
    document.querySelectorAll(".tfbar .tf").forEach(function(btn){
      btn.addEventListener("click", function(){
        var label=(btn.getAttribute("data-tf")||btn.textContent||"").trim();
        setTimeframe(label);
      });
    });
  }

  // ===== Zoom / Pan =====
  function zoom(delta, anchorX){
    var d=state.data[state.active]; if(!d||!d.series.length) return;
    var vp=getViewport(d.series); var oldView=vp.view;

    // fator de zoom (suave)
    var factor = (delta<0) ? 0.8 : 1.25; // roda p/ cima aproxima
    var newView = clamp(Math.round(oldView*factor), 10, Math.min(HISTORY_LEN, d.series.length));

    // âncora no cursor
    var anchorIdx;
    if (typeof anchorX==="number" && canvas && canvas._cssW){
      var xRatio = clamp(anchorX / canvas._cssW, 0, 1);
      anchorIdx = vp.start + Math.round(xRatio * (oldView-1));
    } else {
      anchorIdx = vp.end; // ancorar à direita
    }

    // tenta manter a âncora visível
    var newStart = clamp(anchorIdx - Math.floor((anchorIdx - vp.start) * (newView/oldView)), 0, Math.max(0, d.series.length - newView));
    var newEnd = newStart + newView - 1;
    state.viewN = newView;
    state.offset = Math.max(0, d.series.length - 1 - newEnd);

    drawChart(state.active); highlightTF();
  }
  function resetZoom(){
    state.viewN = TF_POINTS[state.tfLabel] || TF_POINTS[state.tf] || 300;
    state.offset = 0;
    drawChart(state.active); highlightTF();
  }

  if (canvas){
    // Zoom no scroll (ancorado no cursor)
    on(canvas,"wheel",function(e){
      e.preventDefault();
      zoom(e.deltaY<0 ? -1 : 1, e.offsetX);
    },{passive:false});

    // Pan com arraste
    on(canvas,"mousedown",function(e){
      var r=canvas.getBoundingClientRect();
      state.pan={ startX: e.clientX - r.left, startOffset: state.offset };
    });
    on(window,"mouseup", function(){ state.pan=null; });
    on(window,"mousemove", function(e){
      var d=state.data[state.active]; if(!d||!d.series.length) return;
      var r=canvas.getBoundingClientRect();

      // crosshair/tooltip
      var vp=getViewport(d.series), view=vp.end-vp.start+1, x=e.clientX-r.left;
      if (x>=0 && x<=canvas._cssW){
        var idx=Math.round((x/(canvas._cssW||1))*(view-1));
        state.hover={x:x, idx:idx}; drawChart(state.active);
      }

      // pan
      if(!state.pan) return;
      var perPx = vp.view / (canvas._cssW||1);
      var dx = (e.clientX - r.left) - state.pan.startX;
      var shift = Math.round(dx * perPx);
      var maxOffset=Math.max(0, d.series.length - vp.view);
      state.offset = clamp(state.pan.startOffset - shift, 0, maxOffset);
      drawChart(state.active);
    });
    on(canvas,"mouseleave",function(){ state.hover=null; drawChart(state.active); });
  }

  // Botões (se existirem no DOM)
  on("#zoomIn","click",  ()=>zoom(-1, canvas?canvas._cssW:undefined));
  on("#zoomOut","click", ()=>zoom( 1, canvas?canvas._cssW:undefined));
  on("#resetZoom","click", resetZoom);

})();
