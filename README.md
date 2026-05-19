# BeskarFolio

Personal stock portfolio tracker. Your data lives in your browser. The backend fetches prices and runs math. Nothing else.

## Why BeskarFolio

Your portfolio data belongs to you. BeskarFolio stores transactions in browser localStorage, never on a server. No accounts, no database, no cloud sync. You own the beskar, you forge the armor.

**This is the Way:**

- **Ib'tuur jatne tuur ash'ad kyr'amur.** (One day at a time.) Track buys and sells. See returns. Move on.
- **Aliit ori'shya tal'din.** (Family is more than blood.) Supports EUR and USD tickers across US and European exchanges.
- **Ke barjurir gar dar'manda.** (Don't lose your identity.) Your data never leaves your browser. Export a CSV backup whenever you want.
- **Beskar'gam.** (Armor.) Four price providers with automatic fallback. Twelve Data, FMP, Finnhub, yfinance. If one fails, the next picks up.

<p align="center">
  <img src="docs/screenshot-mobile.png" alt="Dashboard" width="240" />
  <img src="docs/screenshot-performance.png" alt="Performance" width="240" />
  <img src="docs/screenshot-transaction.png" alt="Add transaction" width="240" />
</p>

## Setup

Three commands. You need Docker installed.

```bash
git clone https://github.com/martin-gomola/beskarfolio.git
cd beskarfolio
make dev
```

Open `http://localhost:3000`. Add a transaction or import a CSV.

### Production

```bash
cp config/env.example config/.env   # Edit with your API keys
make deploy                          # Builds and starts containers
```

Price API keys go in `config/.env`. Free tiers cover a personal portfolio:

| Provider | Free Tier | Coverage |
|----------|-----------|----------|
| Twelve Data | 800 calls/day | US + EU tickers, historical |
| FMP | 250 calls/day | US tickers, batch quotes |
| Finnhub | 60 calls/min | US tickers, current only |
| yfinance | Unlimited | All tickers (blocks Docker IPs) |

### Daily Price Updates

Run the setup script once on your server:

```bash
./scripts/setup_server_automation.sh
```

Cron updates all prices and exchange rates at 8:30 AM. You can also click "Update Prices" in the UI or run `make update-prices`.

## Features

- Buy/sell transaction tracking with CSV import
- Holdings table with live prices and return calculations
- Time-Weighted Return (TWR) for true portfolio performance
- Tax-free share tracking (Slovak 365-day FIFO rule)
- Annual performance reports
- Multi-currency support (EUR/USD with daily exchange rates)
- Asset allocation charts and target rebalancing
- AI analysis (bring your own OpenAI key)
- Auto-refresh prices every 30 minutes in the browser
- Dark theme with green-tinted glass UI

## Stack

FastAPI (Python) / React + TypeScript + Vite / Tailwind CSS / Docker

## Commands

```bash
make dev            # Development with hot reload
make deploy         # Production build and deploy
make deploy-front   # Frontend only (~10s, needs Node on server)
make deploy-back    # Backend only (~20s)
make logs           # Container logs
make status         # Health check
make update-prices  # Manual price refresh
make help           # Full command list
```

## Troubleshooting

Check [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md) first.

| Symptom | Fix |
|---------|-----|
| Slow builds (10+ min) | Add `.dockerignore`, remove `node_modules` from server |
| API 404 errors | Frontend calls need `/api` prefix |
| Stale UI after deploy | Hard refresh or clear browser cache |
| Prices not updating | Check `make logs` for provider errors |

```bash
make status    # Backend health
make logs      # Error details
make rebuild   # Nuclear option
```

## Docs

- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Troubleshooting & Lessons](docs/LESSONS_LEARNED.md)
- [MCP Integration](docs/MCP_SETUP.md)
- [Architecture & AI Guide](CLAUDE.md)

## Legal

For informational purposes only. Not financial advice. See [docs/LEGAL.md](docs/LEGAL.md) for privacy policy and terms. Licensed under [MIT](LICENSE).
