export default function Home() {
  return (
    <html lang="pt-BR">
      <head>
        <title>SmartTrader AI</title>
        <meta name="description" content="Painel SmartTrader AI — monitor de mercado e IA de alertas financeiros" />
        <link rel="stylesheet" href="/assets/styles.css" />
      </head>
      <body>
        <div className="topbar">
          <div className="brand">
            <img src="/assets/logo.svg" alt="SmartTrader AI" width="26" height="26" />
            SmartTrader AI
          </div>
          <div id="clock" className="clock"></div>
        </div>

        <div className="layout">
          <div className="left">
            <input id="q" className="search" placeholder="Buscar (ex: TSLA, AAPL, VALE3)" />
            <div id="list" className="list"></div>
          </div>

          <div className="center">
            <div className="title-row">
              <h1 id="sym">TSLA</h1>
              <div id="chg" className="chg up">+0.00%</div>
            </div>
            <div className="price" id="price">$ —</div>
            <canvas id="chart"></canvas>
            <div className="caption">Atualização automática a cada 6 s</div>
            <div className="row">
              <button id="buyBtn" className="btn">Comprar</button>
              <button id="sellBtn" className="btn sell">Vender</button>
              <button id="alertBtn" className="btn alert">Criar Alerta</button>
            </div>
          </div>

          <div className="right">
            <div className="panel">
              <h3>Alertas & Notícias</h3>
              <div id="news"></div>
            </div>
            <div className="panel">
              <h3>Posições (Paper)</h3>
              <table id="pos" className="pos-table">
                <thead><tr><th>Símbolo</th><th>Qtde</th><th>PM</th><th>P/L</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>

        <footer className="footer">
          © 2025 SmartTrader AI — página estática de demonstração
        </footer>

        <script src="/assets/app.js"></script>
      </body>
    </html>
  );
}
