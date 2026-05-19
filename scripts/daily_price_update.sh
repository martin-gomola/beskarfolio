#!/bin/bash
#
# Market-Aware Price Update Script
# Runs OUTSIDE Docker to bypass yfinance IP blocking
# Finalizes the latest daily close for every ticker and refreshes intraday
# snapshots for markets that are currently open.
# Should be scheduled via cron on the host machine
#
# Setup cron:
#   crontab -e
#   # Add this line (runs every 4 hours; script skips closed markets):
#   0 */4 * * * /path/to/beskarfolio/scripts/daily_price_update.sh >> /path/to/beskarfolio/logs/price_update.log 2>&1
#

set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export PYTHONUNBUFFERED=1
umask 022

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || true)}"
LOCK_FILE="$PROJECT_ROOT/logs/price_update.lock"

echo "=========================================="
echo "Price Update - $(date)"
echo "=========================================="
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

mkdir -p "$PROJECT_ROOT/logs" "$PROJECT_ROOT/backend/data/historical_prices"

if [ -z "$PYTHON_BIN" ]; then
  echo "❌ python3 not found in PATH: $PATH"
  exit 1
fi

echo "Python: $PYTHON_BIN"
echo ""

# Avoid overlapping cron runs if a previous update is still in progress.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "⚠️  Another price update is already running, skipping."
    exit 0
  fi
fi

# Run the Python update script
cd "$PROJECT_ROOT"
"$PYTHON_BIN" scripts/update_portfolio_data.py

# No backend restart needed - cache auto-invalidates on file changes!
echo ""
echo "✅ Price files updated. Backend will auto-reload on next request."

echo ""
echo "=========================================="
echo "✅ Price update complete - $(date)"
echo "=========================================="
