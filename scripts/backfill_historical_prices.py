#!/usr/bin/env python3
"""
Backfill Historical Prices Script
Fetches historical price data from 2020-01-01 to today for all tickers.
Uses yfinance - run on host machine (not in Docker) for best results.

Usage:
    python scripts/backfill_historical_prices.py
    
    # Or for specific tickers:
    python scripts/backfill_historical_prices.py AAPL MSFT NVDA
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    import yfinance as yf
    import pandas as pd
except ImportError:
    print("❌ Missing dependencies. Install with:")
    print("   pip install yfinance==1.2.2 pandas")
    sys.exit(1)

# Configuration
PRICES_DIR = Path(__file__).parent.parent / "backend" / "data" / "historical_prices"
START_DATE = "2020-01-01"
END_DATE = datetime.now().strftime("%Y-%m-%d")

def get_existing_tickers():
    """Get list of tickers from existing CSV files."""
    tickers = []
    for f in PRICES_DIR.glob("*_prices.csv"):
        ticker = f.stem.replace("_prices", "")
        # Convert filename format to yfinance format
        # e.g., VWCE_DE -> VWCE.DE
        ticker = ticker.replace("_", ".")
        tickers.append(ticker)
    return sorted(tickers)

def get_csv_path(ticker: str) -> Path:
    """Convert ticker to CSV path."""
    # Convert yfinance format to filename format
    # e.g., VWCE.DE -> VWCE_DE_prices.csv
    filename = ticker.replace(".", "_") + "_prices.csv"
    return PRICES_DIR / filename

def load_existing_dates(csv_path: Path) -> set:
    """Load existing dates from CSV."""
    if not csv_path.exists():
        return set()
    try:
        df = pd.read_csv(csv_path)
        return set(df['Date'].tolist())
    except Exception:
        return set()

def fetch_and_save(ticker: str):
    """Fetch historical data and save to CSV."""
    csv_path = get_csv_path(ticker)
    existing_dates = load_existing_dates(csv_path)
    
    print(f"\n📊 {ticker}")
    print(f"   CSV: {csv_path.name}")
    print(f"   Existing rows: {len(existing_dates)}")
    
    try:
        # Fetch from yfinance
        stock = yf.Ticker(ticker)
        df = stock.history(start=START_DATE, end=END_DATE)
        
        if df.empty:
            print(f"   ⚠️  No data returned from yfinance")
            return False
        
        # Prepare data - only Date and Close
        df = df.reset_index()
        df['Date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
        df = df[['Date', 'Close']]
        df['Close'] = df['Close'].round(2)
        
        # Filter out dates we already have
        new_rows = df[~df['Date'].isin(existing_dates)]
        
        if new_rows.empty:
            print(f"   ✓ Already up to date ({len(existing_dates)} rows)")
            return True
        
        # If CSV exists, append. Otherwise create new.
        if csv_path.exists() and len(existing_dates) > 0:
            # Load existing and merge
            existing_df = pd.read_csv(csv_path)
            combined = pd.concat([existing_df, new_rows], ignore_index=True)
            combined = combined.drop_duplicates(subset=['Date'])
            combined = combined.sort_values('Date')
            combined.to_csv(csv_path, index=False)
            print(f"   ✓ Added {len(new_rows)} new rows (total: {len(combined)})")
        else:
            # Create new file
            new_rows = new_rows.sort_values('Date')
            new_rows.to_csv(csv_path, index=False)
            print(f"   ✓ Created with {len(new_rows)} rows")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def main():
    print("=" * 60)
    print("📈 BeskarFolio Historical Price Backfill")
    print("=" * 60)
    print(f"Date range: {START_DATE} → {END_DATE}")
    print(f"Prices dir: {PRICES_DIR}")
    
    # Get tickers - from args or existing files
    if len(sys.argv) > 1:
        tickers = sys.argv[1:]
        print(f"Tickers (from args): {', '.join(tickers)}")
    else:
        tickers = get_existing_tickers()
        print(f"Tickers (from CSVs): {', '.join(tickers)}")
    
    if not tickers:
        print("\n❌ No tickers found!")
        print("   Either pass tickers as arguments or ensure CSV files exist.")
        sys.exit(1)
    
    print(f"\nProcessing {len(tickers)} tickers...")
    
    success = 0
    failed = []
    
    for ticker in tickers:
        if fetch_and_save(ticker):
            success += 1
        else:
            failed.append(ticker)
    
    print("\n" + "=" * 60)
    print("📊 Summary")
    print("=" * 60)
    print(f"✓ Success: {success}/{len(tickers)}")
    
    if failed:
        print(f"✗ Failed: {', '.join(failed)}")
    
    print("\nDone! 🎉")

if __name__ == "__main__":
    main()
