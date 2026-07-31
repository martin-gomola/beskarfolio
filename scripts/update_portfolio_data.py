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
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import requests

# Path to data directories (script is in scripts/ folder, data is in backend/data/)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "backend" / "data"
CSV_DIR = DATA_DIR / "historical_prices"
RATES_FILE = DATA_DIR / "exchange_rates.json"

# Reuse backend modules so the host cron and API stay aligned.
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
from logic.prices.refresh import PriceRefreshMode, refresh_prices  # noqa: E402


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

    refresh_mode = {
        "auto": PriceRefreshMode.SCHEDULED,
        "snapshots": PriceRefreshMode.SNAPSHOTS,
        "closes": PriceRefreshMode.CLOSES,
    }[args.mode]
    report = refresh_prices(all_tickers, mode=refresh_mode)

    print("\n" + "=" * 60)
    print("📈 Summary")
    print("=" * 60)
    print(f"\n📚 Daily closes finalized: {report.closes_finalized}/{len(report.results)}")
    if args.mode in {"auto", "snapshots"}:
        print(f"📊 Intraday snapshots refreshed: {report.updated_count}/{len(report.results)}")
        skipped_or_failed = [
            result
            for result in report.results
            if result.snapshot_status not in {"updated", "not_requested"}
        ]
        if skipped_or_failed:
            print("\nSnapshot skips/failures:")
            for result in skipped_or_failed:
                print(f"   - {result.ticker}: {result.snapshot_status}")

    print("\n✅ Price data update complete!")
    print("💡 Backend will auto-reload on next request (cache invalidation)")


if __name__ == "__main__":
    main()
