# Backend Data Directory

This directory contains runtime-generated data files used by BeskarFolio.

## Files

### `exchange_rates.json`
- **Purpose**: EUR/USD currency exchange rates
- **Updated**: Daily at 2 AM (via cron job)
- **Source**: exchangerate-api.com
- **Format**:
  ```json
  {
    "EUR_USD": 1.09,
    "USD_EUR": 0.92,
    "updated_at": "2025-12-16T00:00:00",
    "source": "exchangerate-api.com"
  }
  ```
- **Git**: Initial version is tracked, daily updates are local only
- **Fallback**: If file is missing or API fails, hardcoded rates are used

### `latest_prices.json`
- **Purpose**: Intraday snapshot layer for the UI
- **Updated**: Up to every 4 hours during market hours
- **Source**: yfinance on the host machine, with backend provider fallback
- **Format**:
  ```json
  {
    "updated_at": "2026-04-16T12:00:00+00:00",
    "prices": {
      "AAPL": {
        "price": 187.42,
        "updated_at": "2026-04-16T12:00:00+00:00",
        "market_date": "2026-04-16",
        "source": "yfinance_snapshot"
      }
    }
  }
  ```
- **Git**: Generated runtime data, not source of truth for historical calculations

### `historical_prices/`
- **Purpose**: Daily-close history for all portfolio tickers
- **Updated**: Whenever the updater finalizes the latest completed market close
- **Format**: CSV files named `{TICKER}_prices.csv`
- **Source**: yfinance daily candles (runs outside Docker on host machine)
- **Invariant**: Exactly one `Date,Close` row per market day
- **Git**: Demo tickers (`AAPL`, `MSFT`, `GOOGL`, `VWCE.DE`, `SXR8.DE`) are tracked so the "Load Demo Data" button works on fresh clones and the public demo without burning price-provider API limits. All other tickers are gitignored runtime data.

## Automated Updates

Exchange rates, intraday snapshots, and daily closes are updated automatically by:
- **Script**: `scripts/update_portfolio_data.py`
- **Cron job**: Every 4 hours (script skips closed markets)
- **Setup**: Run `./scripts/setup_server_automation.sh`

## Manual Updates

Update anytime with:
```bash
make update-prices
```

Or directly:
```bash
python3 scripts/update_portfolio_data.py
```

## Cache Invalidation

Backend automatically detects when these files change (via mtime check) and reloads data on the next request. No restart needed!
