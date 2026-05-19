#!/usr/bin/env python3
"""
Migrate historical price CSVs to git-friendly format.

Before: Date,Open,High,Low,Close,Volume,Dividends,Stock Splits
After:  Date,Close

Benefits:
- ~70% smaller files
- Git-friendly (append-only, minimal diffs)
- No merge conflicts
"""

import os
import sys
from pathlib import Path

import pandas as pd

# Path to historical prices directory
PRICES_DIR = Path(__file__).parent.parent / "backend" / "data" / "historical_prices"


def migrate_csv(csv_path: Path) -> dict:
    """
    Migrate a single CSV file to git-friendly format.
    
    Returns dict with migration stats.
    """
    stats = {
        "file": csv_path.name,
        "status": "skipped",
        "rows": 0,
        "size_before": 0,
        "size_after": 0,
    }
    
    try:
        stats["size_before"] = csv_path.stat().st_size
        
        # Read CSV
        df = pd.read_csv(csv_path)
        
        # Check if already migrated (only Date,Close columns)
        if list(df.columns) == ["Date", "Close"]:
            stats["status"] = "already_migrated"
            stats["rows"] = len(df)
            return stats
        
        # Check for required columns
        if "Date" not in df.columns or "Close" not in df.columns:
            stats["status"] = "error_missing_columns"
            return stats
        
        # Extract only Date and Close
        df_clean = df[["Date", "Close"]].copy()
        
        # Parse and clean dates
        df_clean["Date"] = pd.to_datetime(df_clean["Date"], format="mixed", utc=True, errors="coerce")
        df_clean = df_clean.dropna(subset=["Date", "Close"])
        df_clean = df_clean.drop_duplicates(subset=["Date"]).sort_values("Date")
        
        # Format dates as YYYY-MM-DD (clean, no timezone)
        df_clean["Date"] = df_clean["Date"].dt.strftime("%Y-%m-%d")
        
        # Save
        df_clean.to_csv(csv_path, index=False)
        
        stats["status"] = "migrated"
        stats["rows"] = len(df_clean)
        stats["size_after"] = csv_path.stat().st_size
        
        return stats
        
    except Exception as e:
        stats["status"] = f"error: {e}"
        return stats


def main():
    """Migrate all CSV files in historical_prices directory."""
    
    if not PRICES_DIR.exists():
        print(f"❌ Directory not found: {PRICES_DIR}")
        sys.exit(1)
    
    csv_files = list(PRICES_DIR.glob("*_prices.csv"))
    
    if not csv_files:
        print(f"❌ No CSV files found in {PRICES_DIR}")
        sys.exit(1)
    
    print(f"🔄 Migrating {len(csv_files)} CSV files to git-friendly format...")
    print(f"   Directory: {PRICES_DIR}")
    print()
    
    total_before = 0
    total_after = 0
    migrated = 0
    already_done = 0
    errors = 0
    
    for csv_file in sorted(csv_files):
        stats = migrate_csv(csv_file)
        
        total_before += stats["size_before"]
        total_after += stats.get("size_after", stats["size_before"])
        
        if stats["status"] == "migrated":
            migrated += 1
            reduction = (1 - stats["size_after"] / stats["size_before"]) * 100 if stats["size_before"] > 0 else 0
            print(f"  ✅ {stats['file']}: {stats['rows']} rows, -{reduction:.0f}% size")
        elif stats["status"] == "already_migrated":
            already_done += 1
            print(f"  ⏭️  {stats['file']}: already migrated ({stats['rows']} rows)")
        else:
            errors += 1
            print(f"  ❌ {stats['file']}: {stats['status']}")
    
    print()
    print("=" * 50)
    print(f"📊 Migration Summary:")
    print(f"   Migrated:        {migrated}")
    print(f"   Already done:    {already_done}")
    print(f"   Errors:          {errors}")
    print()
    
    if total_before > 0:
        reduction = (1 - total_after / total_before) * 100
        print(f"   Size before:     {total_before / 1024:.1f} KB")
        print(f"   Size after:      {total_after / 1024:.1f} KB")
        print(f"   Reduction:       {reduction:.0f}%")
    
    print()
    print("✅ Done! Your CSVs are now git-friendly.")
    print("   Future updates will only append: +2026-01-10,243.69")


if __name__ == "__main__":
    main()
