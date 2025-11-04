// pages/index.js
import Head from "next/head";
import Script from "next/script";

export default function Home() {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SmartTrader AI — Radar de Mercado Inteligente</title>
        <meta
          name="description"
          content="SmartTrader AI — painel de monitoramento de ações com IA e alertas em tempo quase real (protótipo)."
        />
        <link rel="icon" href="/assets/logo.svg" />
        <link rel="stylesheet" href="/assets/styles.css" />
      </Head>

      <header className="topbar">
        <div className="brand">
          <img src="/assets/logo.svg" alt="SmartTrader AI" width="22" height="22" />
          <span>SmartTrader AI</span>
        </div>
        <div className="clock" id="clock" aria-live="polite">
          UTC — --:--:--
        </div>
      </header>

      <main className="layout">
        {/* Lista / busca */}
        <aside className="left" aria-label="Ativos">
          <input
            id="q"
            className="search"
            placeholder="Buscar (ex.: TSLA, AAPL, VALE3)"
          />
          <div id="list" className="list" />
        </aside>

        {/* Centro / gráfico */}
        <section className="center" aria-label="Detalhes do ativo">
          <div className="row">
            <div style={{ flex: 1 }}>
              <div className="title-row">
                <h1 id="sym">TSLA</h1>
              </div>

              <div className="row" aria-live="polite">
                <div className="price" id="price">
                  $ —
                </div>
                <div id="chg" className="pill">
                  —
                </div>
              </div>
            </div>

            <div className="row buttons">
              <button className="btn" id="buyBtn" type="button">
                Comprar
              </button>
              <button className="btn sell" id="sellBtn" type="button">
                Vender
              </button>
              <button className="btn alert" id="alertBtn" type="button">
                Criar alerta
              </button>
            </div>
          </div>

          <canvas
            id="chart"
            height="260"
            aria-label="Gráfico de preço"
            role="img"
          ></canvas>

          {/* Rodapé do gráfico: seleção de períodos + zoom */}
          <div className="chart-footer">
            <div className="tfbar">
              {/* Timeframes (tokens da API) */}
              <div className="tf-group">
                <button className="tf" data-tf="1m">1m</button>
                <button className="tf" data-tf="1h">1h</button>
                <button className="tf" data-tf="5h">5h</button>
                <button className="tf" data-tf="12h">12h</button>
                <button className="tf" data-tf="24h">1D</button>
                <button className="tf" data-tf="1w">1S</button>
                <button className="tf" data-tf="1mo">1M</button>
                <button className="tf" data-tf="2mo">2M</button>
                <button className="tf" data-tf="3mo">3M</button>
                <button className="tf" data-tf="ytd">YTD</button>
              </div>

              {/* Zoom in / out (apenas acrescentado) */}
              <div className="zoom-group">
                <button id="zoomOutBtn" className="tf" type="button">
                  −
                </button>
                <button id="zoomInBtn" className="tf" type="button">
                  +
                </button>
              </div>
            </div>
          </div>

          <p className="caption">Atualização automática a cada 6 s.</p>
        </section>

        {/* Coluna direita */}
        <aside className="right" aria-label="Alertas e posições">
          <section className="panel" aria-labelledby="news-title">
            <h3 id="news-title">Alertas & Notícias</h3>
            <div id="news" className="news">
              <div className="news-item">
                <div>
                  <strong>Bem-vindo</strong> ao SmartTrader AI (protótipo).
                </div>
                <div className="muted small">
                  Crie um alerta para ver como aparece aqui.
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="pos-title">
            <h3 id="pos-title">Posições (paper)</h3>
            <table className="pos-table" id="pos">
              <thead>
                <tr>
                  <th>Símbolo</th>
                  <th>Qtde</th>
                  <th>PM</th>
                  <th>P/L</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </section>
        </aside>
      </main>

      <footer className="footer">
        © 2025 SmartTrader AI — página estática de demonstração
      </footer>

      {/* carrega JS depois que a página estiver interativa */}
      <Script src="/assets/app.js?v=3" strategy="afterInteractive" />
    </>
  );
}
