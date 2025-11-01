// pages/index.js
import Head from "next/head";
import Script from "next/script";

export default function Home() {
  return (
    <>
      <Head>
        <title>SmartTrader AI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Topo */}
      <div className="topbar">
        <div className="brand">SmartTrader AI</div>
        {/* suppressHydrationWarning evita mismatch no relógio inicial */}
        <div className="clock"><span id="clock" suppressHydrationWarning>UTC — --:--:--Z</span></div>
      </div>

      {/* Layout principal */}
      <div className="layout">
        <div className="left">
          <input id="q" className="search" placeholder="Buscar (ex.: TSLA, AAPL, VALE3)" />
          <div id="list" className="list"></div>
        </div>

      <div className="center">
  <div className="title-row">
    <h1 id="sym">TSLA</h1>
    <div id="chg" className="pill">+0.00%</div>
  </div>

  <div className="row">
    <div className="price" id="price">$ —</div>
    <button id="buyBtn"  className="btn">Comprar</button>
    <button id="sellBtn" className="btn sell">Vender</button>
    <button id="alertBtn" className="btn alert">Criar alerta</button>
  </div>

  {/* 🔽 NOVO: container que o JS vai preencher com timeframes e zoom */}
  <div id="controls" className="row" aria-label="Timeframes e zoom"></div>

  <canvas id="chart"></canvas>
  <div className="caption">Atualização automática a cada 6 s</div>
</div>
        <div className="right">
          <div className="panel">
            <h3>Alertas & Notícias</h3>
            <div id="news"></div>
          </div>

          <div className="panel">
            <h3>Posições (Paper)</h3>
            <table id="pos" className="pos-table">
              <thead>
                <tr><th>Símbolo</th><th>Qtde</th><th>PM</th><th>P/L</th></tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="footer">© 2025 SmartTrader AI — página estática de demonstração</footer>

      {/* CSS sempre estático */}
      <link rel="stylesheet" href="/assets/styles.css" />

      {/* Scripts só no cliente, após a hidratação */}
      <Script src="/assets/app.js" strategy="afterInteractive" />
    </>
  );
}
