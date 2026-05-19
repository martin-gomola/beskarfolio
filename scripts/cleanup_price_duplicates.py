#!/usr/bin/env python3
"""
Cleanup duplicate dates in historical price CSV files.

For each ticker CSV:
- Removes duplicate dates (keeps only one entry per date)
- Keeps the LAST value for each date (most recent price update)
- Sorts by date ascending
- Preserves Date,Close format

Usage:
    python scripts/cleanup_price_duplicates.py           # Dry run (shows what would change)
    python scripts/cleanup_price_duplicates.py --apply   # Actually apply changes
"""
import os
import sys
import argparse
from pathlib import Path

import pandas as pd

# Add backend to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT / 'backend'))

from config import settings


def cleanup_csv_file(csv_path: Path, dry_run: bool = True) -> dict:
    """
    Clean up a single CSV file by removing duplicate dates.

    Returns dict with stats about what was done.
    """
    ticker = csv_path.stem.replace('_prices', '')

    try:
        df = pd.read_csv(csv_path)
        original_count = len(df)

        if 'Date' not in df.columns or 'Close' not in df.columns:
            return {
                'ticker': ticker,
                'status': 'skipped',
                'reason': 'Missing Date or Close column',
                'original': original_count,
                'final': original_count,
                'removed': 0
            }

        # Parse dates
        df['Date'] = pd.to_datetime(df['Date'], format='mixed', utc=True, errors='coerce')
        df = df.dropna(subset=['Date', 'Close'])

        # Sort by date ascending
        df = df.sort_values('Date')

        # Remove duplicates, keeping LAST value for each date (most recent update)
        df['date_only'] = df['Date'].dt.strftime('%Y-%m-%d')
        df_clean = df.drop_duplicates(subset='date_only', keep='last').copy()

        final_count = len(df_clean)
        removed = original_count - final_count

        if removed > 0:
            if not dry_run:
                # Save cleaned file with clean date format
                output_df = pd.DataFrame({
                    'Date': df_clean['date_only'],
                    'Close': df_clean['Close']
                })
                output_df.to_csv(csv_path, index=False)

            return {
                'ticker': ticker,
                'status': 'cleaned' if not dry_run else 'would_clean',
                'original': original_count,
                'final': final_count,
                'removed': removed
            }
        else:
            return {
                'ticker': ticker,
                'status': 'ok',
                'original': original_count,
                'final': final_count,
                'removed': 0
            }

    except Exception as e:
        return {
            'ticker': ticker,
            'status': 'error',
            'error': str(e),
            'original': 0,
            'final': 0,
            'removed': 0
        }


def main():
    parser = argparse.ArgumentParser(description='Cleanup duplicate dates in price CSV files')
    parser.add_argument('--apply', action='store_true', help='Actually apply changes (default is dry run)')
    parser.add_argument('--ticker', type=str, help='Only process specific ticker')
    args = parser.parse_args()

    dry_run = not args.apply

    # Get historical prices directory
    prices_dir = Path(settings.HISTORICAL_PRICES_DIR)

    if not prices_dir.exists():
        print(f"Error: Directory not found: {prices_dir}")
        sys.exit(1)

    # Find all CSV files
    csv_files = list(prices_dir.glob('*_prices.csv'))

    if args.ticker:
        csv_files = [f for f in csv_files if args.ticker.upper() in f.stem.upper()]

    if not csv_files:
        print("No price CSV files found")
        sys.exit(0)

    print(f"{'DRY RUN - ' if dry_run else ''}Processing {len(csv_files)} CSV files...\n")

    results = []
    total_removed = 0
    files_with_duplicates = 0

    for csv_path in sorted(csv_files):
        result = cleanup_csv_file(csv_path, dry_run=dry_run)
        results.append(result)

        if result['removed'] > 0:
            files_with_duplicates += 1
            total_removed += result['removed']
            status = "WOULD REMOVE" if dry_run else "REMOVED"
            print(f"  {result['ticker']}: {status} {result['removed']} duplicates ({result['original']} -> {result['final']} rows)")
        elif result['status'] == 'error':
            print(f"  {result['ticker']}: ERROR - {result.get('error', 'Unknown')}")
        elif result['status'] == 'skipped':
            print(f"  {result['ticker']}: SKIPPED - {result.get('reason', 'Unknown')}")

    # Summary
    print(f"\n{'=' * 50}")
    print(f"Summary:")
    print(f"  Files processed: {len(results)}")
    print(f"  Files with duplicates: {files_with_duplicates}")
    print(f"  Total duplicate rows {'to remove' if dry_run else 'removed'}: {total_removed}")

    if dry_run and total_removed > 0:
        print(f"\n  Run with --apply to actually remove duplicates")


if __name__ == '__main__':
    main()
