#!/usr/bin/env python3
"""
Portfolio price updater.

Runs outside Docker to avoid yfinance container blocking and maintains two
separate data layers:

- `latest_prices.json`: mutable intraday snapshots for UI freshness
- `historical_prices/*.csv`: immutable daily-close history (`Date,Close` only)

The job always attempts to finalize the latest completed daily close for every
ticker. It only refreshes intraday snapshots for markets that are currently open.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Dict, Optional

import pandas as pd
import requests
import yfinance as yf

# Path to data directories (script is in scripts/ folder, data is in backend/data/)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "backend" / "data"
CSV_DIR = DATA_DIR / "historical_prices"
RATES_FILE = DATA_DIR / "exchange_rates.json"

# Reuse backend modules so the host cron and API stay aligned.
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
from logic.prices.orchestrator import PriceOrchestrator  # noqa: E402
from logic.prices.providers import YFinanceProvider  # noqa: E402
from logic.prices.shared import (  # noqa: E402
    MarketRule,
    get_market_rule,
    get_market_state,
)
from logic.prices.storage import CSVStorageManager  # noqa: E402


def update_exchange_rates() -> bool:
    """
    Fetch current EUR/USD exchange rate and save to file.
    Uses exchangerate-api.com (free tier, 1500 requests/month).
    """
    try:
        print("\n💱 Fetching EUR/USD exchange rate...")

        response = requests.get("https://api.exchangerate-api.com/v4/latest/EUR", timeout=10)
        response.raise_for_status()

        data = response.json()
        eur_usd = data["rates"].get("USD")
        usd_eur = 1 / eur_usd if eur_usd else None

        if not eur_usd or not usd_eur:
            print("   ❌ Failed to get exchange rates")
            return False

        rates_data = {
            "EUR_USD": round(eur_usd, 4),
            "USD_EUR": round(usd_eur, 4),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "source": "exchangerate-api.com",
        }

        RATES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(RATES_FILE, "w", encoding="utf-8") as handle:
            json.dump(rates_data, handle, indent=2)
            handle.write("\n")

        print(f"   ✓ EUR/USD: ${eur_usd:.4f}")
        print(f"   ✓ USD/EUR: €{usd_eur:.4f}")
        print(f"   ✅ Saved to {RATES_FILE.name}")
        return True
    except Exception as exc:
        print(f"   ❌ Error: {exc}")
        return False


def get_all_tickers_from_csv() -> Dict[str, str]:
    """
    Discover all tickers from existing CSV files in historical_prices/.
    Returns dict of {ticker: description}.
    """
    if not CSV_DIR.exists():
        print(f"❌ CSV directory not found: {CSV_DIR}")
        return {}

    tickers: Dict[str, str] = {}
    for csv_file in CSV_DIR.glob("*_prices.csv"):
        ticker = csv_file.stem.replace("_prices", "").replace("_", ".")
        tickers[ticker] = ticker

    return dict(sorted(tickers.items()))


def get_latest_completed_close(ticker: str, market_state: Dict[str, object]) -> Optional[tuple[date, float]]:
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="10d", interval="1d", auto_adjust=False)
    except Exception as exc:
        print(f"   ❌ Daily close fetch failed for {ticker}: {exc}")
        return None

    hist = hist.dropna(subset=["Close"])
    if hist.empty:
        return None

    rows = [(pd.Timestamp(idx).date(), float(row["Close"])) for idx, row in hist.iterrows()]
    if not rows:
        return None

    market_date = market_state["market_date"]
    if rows[-1][0] >= market_date and not market_state["is_after_close"] and len(rows) > 1:
        return rows[-2]
    return rows[-1]


def fetch_intraday_price(ticker: str) -> tuple[Optional[float], str]:
    price = YFinanceProvider.fetch_current_price(ticker)
    if price:
        return price, "yfinance"

    price, source = PriceOrchestrator.fetch_current_price_with_fallback(ticker)
    if price:
        return price, source
    return None, "unavailable"


def finalize_daily_close(ticker: str, description: Optional[str] = None) -> bool:
    display_name = f"{ticker} ({description})" if description and description != ticker else ticker
    print(f"\n📚 Finalizing daily close for {display_name}...")

    market_state = get_market_state(ticker)
    close_data = get_latest_completed_close(ticker, market_state)
    if close_data is None:
        print("   ⚠️  No completed daily close available")
        return False

    close_date, close_price = close_data
    CSVStorageManager.save_price_to_csv(ticker, close_price, datetime.combine(close_date, time(0, 0), tzinfo=timezone.utc))
    CSVStorageManager.save_latest_snapshot(
        ticker,
        close_price,
        updated_at=datetime.now(timezone.utc),
        source="daily_close",
        market_date=close_date.isoformat(),
    )
    print(f"   ✅ Daily close: ${close_price:.2f} ({close_date.isoformat()})")
    return True


def update_intraday_snapshot(ticker: str, description: Optional[str] = None) -> bool:
    display_name = f"{ticker} ({description})" if description and description != ticker else ticker
    market_state = get_market_state(ticker)
    rule: MarketRule = market_state["rule"]

    if not market_state["is_trading_day"]:
        print(f"\n⏭️  Skipping {display_name}: {rule.label} closed today")
        return False

    if not market_state["is_open"]:
        local_now = market_state["local_now"].strftime("%H:%M")
        print(f"\n⏭️  Skipping {display_name}: outside {rule.label} trading hours ({local_now} local)")
        return False

    print(f"\n📊 Refreshing intraday snapshot for {display_name}...")
    price, source = fetch_intraday_price(ticker)
    if price is None:
        print("   ❌ Failed to fetch intraday price")
        return False

    updated_at = datetime.now(timezone.utc)
    market_date = market_state["market_date"].isoformat()
    CSVStorageManager.save_latest_snapshot(
        ticker,
        price,
        updated_at=updated_at,
        source=f"{source}_snapshot",
        market_date=market_date,
    )
    print(f"   ✅ Intraday snapshot: ${price:.2f} ({market_date}, {source})")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Update BeskarFolio price data")
    parser.add_argument(
        "--mode",
        choices=("auto", "snapshots", "closes"),
        default="auto",
        help="auto: finalize daily closes and refresh open-market snapshots; snapshots: open-market snapshots only; closes: daily closes only",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("💰 Portfolio Price Updater")
    print("=" * 60)
    print(f"\nData Directory: {DATA_DIR}")

    if not CSV_DIR.exists():
        print(f"\n❌ CSV directory not found: {CSV_DIR}")
        print("   Make sure you're running this from the project root.")
        return

    print("\n" + "=" * 60)
    print("Step 1: Currency Exchange Rates")
    print("=" * 60)
    update_exchange_rates()

    all_tickers = get_all_tickers_from_csv()
    if not all_tickers:
        print(f"\n⚠️  No ticker CSV files found in {CSV_DIR}")
        print("   Import transactions first to generate CSV files.")
        return

    print("\n" + "=" * 60)
    print("Step 2: Price Data")
    print("=" * 60)
    print(f"\nTickers found: {len(all_tickers)}")
    print(f"Mode: {args.mode}")
    print("(runs outside Docker where yfinance works reliably)")

    close_results: Dict[str, bool] = {}
    snapshot_results: Dict[str, bool] = {}

    if args.mode in {"auto", "closes"}:
        for ticker, description in all_tickers.items():
            close_results[ticker] = finalize_daily_close(ticker, description)

    if args.mode in {"auto", "snapshots"}:
        for ticker, description in all_tickers.items():
            snapshot_results[ticker] = update_intraday_snapshot(ticker, description)

    print("\n" + "=" * 60)
    print("📈 Summary")
    print("=" * 60)

    if close_results:
        close_successful = sum(1 for success in close_results.values() if success)
        print(f"\n📚 Daily closes finalized: {close_successful}/{len(close_results)}")

    if snapshot_results:
        snapshot_successful = sum(1 for success in snapshot_results.values() if success)
        print(f"📊 Intraday snapshots refreshed: {snapshot_successful}/{len(snapshot_results)}")

        failed_snapshots = [ticker for ticker, success in snapshot_results.items() if not success]
        if failed_snapshots:
            print("\nSnapshot skips/failures:")
            for ticker in failed_snapshots:
                print(f"   - {ticker}")

    print("\n✅ Price data update complete!")
    print("💡 Backend will auto-reload on next request (cache invalidation)")


if __name__ == "__main__":
    main()
