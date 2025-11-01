export default function Home() {
  return (
    <>
      <head>
        <title>SmartTrader AI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/assets/logo.svg" />
        <link rel="stylesheet" href="/assets/styles.css" />
      </head>

      <body>
        <div className="topbar">
          <div className="brand">
            <img src="/assets/logo.svg" alt="logo" width="22" height="22" />
            <span>SmartTrader AI</span>
          </div>
          <div id="clock" className="clock">UTC — --:--:--</div>
        </div>

        <div className="layout">
          {/* LEFT */}
          <div className="left">
            <input id="q" className="search" placeholder="Buscar (ex.: TSLA, AAPL, VALE3)" />
            <div id="list" className="list"></div>
          </div>

          {/* CENTER */}
          <div className="center">
            <div className="title-row">
              <h1 id="sym">TSLA</h1>
              <div id="chg" className="pill">+0.00%</div>
            </div>
            <div className="row">
              <div id="price" className="price">$ —</div>
              <span className="muted">Atualização automática a cada 6 s</span>
              <button id="buyBtn" className="btn">Comprar</button>
              <button id="sellBtn" className="btn sell">Vender</button>
              <button id="alertBtn" className="btn alert">Criar alerta</button>
            </div>
            <canvas id="chart"></canvas>
            <div className="caption">
              Protótipo com dados em tempo real via <code>/api/quote</code> (Finnhub/Brapi).
            </div>
          </div>

          {/* RIGHT */}
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

        <footer className="footer">
          © 2025 SmartTrader AI — página estática de demonstração
        </footer>

        {/* Modais */}
        <div id="orderModal" className="modal">
          <div className="sheet">
            <div className="sheet-head">
              <h3 id="orderTitle">Ordem</h3>
              <button id="closeOrder" className="x">✕</button>
            </div>
            <div className="grid2">
              <label>Símbolo <input id="mSym" /></label>
              <label>Lado
                <select id="mSide">
                  <option value="buy">Comprar</option>
                  <option value="sell">Vender</option>
                </select>
              </label>
              <label>Quantidade <input id="mQty" type="number" defaultValue="10" /></label>
              <label>Preço <input id="mPx" type="number" step="0.01" /></label>
            </div>
            <div className="end">
              <button id="cancelOrder" className="x">Cancelar</button>
              <button id="confirmOrder" className="btn">Confirmar</button>
            </div>
          </div>
        </div>

        <div id="alertModal" className="modal">
          <div className="sheet">
            <div className="sheet-head">
              <h3>Novo alerta</h3>
              <button id="closeAlert" className="x">✕</button>
            </div>
            <div className="grid2">
              <label>Símbolo <input id="aSym" /></label>
              <label>Condição
                <select id="aCond">
                  <option value="above">Preço ≥</option>
                  <option value="below">Preço ≤</option>
                  <option value="changeUp">Variação % ≥</option>
                  <option value="changeDown">Variação % ≤</option>
                </select>
              </label>
              <label>Valor <input id="aVal" type="number" step="0.01" /></label>
            </div>
            <div className="end">
              <button id="cancelAlert" className="x">Cancelar</button>
              <button id="confirmAlert" className="btn">Salvar</button>
            </div>
          </div>
        </div>

        <script src="/assets/app.js"></script>
      </body>
    </>
  );
}
