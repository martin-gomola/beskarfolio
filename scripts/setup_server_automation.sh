#!/bin/bash
#
# Server Automation Setup Script
# Run this ONCE on your production server to set up automated price updates
#
# Usage:
#   SSH into server, then run:
#   cd /path/to/beskarfolio
#   ./scripts/setup_server_automation.sh
#

set -e

echo "=========================================="
echo "🚀 BeskarFolio - Server Automation Setup"
echo "=========================================="
echo ""
echo "This will configure automated daily price updates for"
echo "ALL tickers in your portfolio using yfinance (reliable)."
echo ""

# Detect project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Verify we're in a beskarfolio project
if [ ! -f "$PROJECT_ROOT/Makefile" ] || [ ! -d "$PROJECT_ROOT/backend" ]; then
    echo "⚠️  Warning: This doesn't look like a beskarfolio project at $PROJECT_ROOT"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled"
        exit 1
    fi
fi

# Step 1: Check Python
echo "1️⃣  Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.8+ first."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
YFINANCE_VERSION="1.2.2"
echo "   ✓ Python $PYTHON_VERSION found"

# Step 2: Check/install dependencies
echo ""
echo "2️⃣  Checking Python dependencies..."
INSTALLED_YFINANCE_VERSION=$(python3 - <<'PY' 2>/dev/null
try:
    import requests  # noqa: F401
    import pandas  # noqa: F401
    import yfinance
    print(getattr(yfinance, "__version__", "unknown"))
except Exception:
    pass
PY
)

if [ "$INSTALLED_YFINANCE_VERSION" = "$YFINANCE_VERSION" ]; then
    echo "   ✓ yfinance $YFINANCE_VERSION, pandas, and requests already installed"
else
    if [ -n "$INSTALLED_YFINANCE_VERSION" ]; then
        echo "   ⚠️  Found yfinance $INSTALLED_YFINANCE_VERSION, upgrading to $YFINANCE_VERSION..."
    else
        echo "   ⚠️  Missing dependencies. Installing..."
    fi
    
    # Try with --user first (works on most systems)
    if pip3 install "yfinance==$YFINANCE_VERSION" pandas requests --user 2>/dev/null; then
        echo "   ✓ Dependencies installed (user scope)"
    # If that fails due to externally-managed-environment, use --break-system-packages
    elif pip3 install "yfinance==$YFINANCE_VERSION" pandas requests --break-system-packages 2>/dev/null; then
        echo "   ✓ Dependencies installed (system-wide)"
        echo "   ℹ️  Used --break-system-packages (safe for dedicated server)"
    else
        echo "   ❌ Failed to install dependencies"
        echo "   Please install manually:"
        echo "      pip3 install yfinance==$YFINANCE_VERSION pandas requests --break-system-packages"
        exit 1
    fi
fi

# Step 3: Create directories and fix permissions
echo ""
echo "3️⃣  Setting up directories and permissions..."
mkdir -p "$PROJECT_ROOT/logs"
mkdir -p "$PROJECT_ROOT/backend/data/historical_prices"
echo "   ✓ Logs directory created: $PROJECT_ROOT/logs"

# Fix permissions on historical_prices directory (Docker needs write access)
if [ -d "$PROJECT_ROOT/backend/data/historical_prices" ]; then
    chmod -R 777 "$PROJECT_ROOT/backend/data/historical_prices"
    echo "   ✓ Fixed permissions on historical_prices/ (Docker can now write)"
fi

# Step 4: Make scripts executable
echo ""
echo "4️⃣  Making scripts executable..."
chmod +x "$PROJECT_ROOT/scripts/daily_price_update.sh"
chmod +x "$PROJECT_ROOT/scripts/update_portfolio_data.py"
echo "   ✓ Scripts are now executable"

# Step 5: Test the update script
echo ""
echo "5️⃣  Testing price update script..."
cd "$PROJECT_ROOT"
if python3 scripts/update_portfolio_data.py; then
    echo "   ✓ Price update test successful!"
else
    echo "   ⚠️  Price update test had some errors (check above)"
    echo "   This might be okay if some tickers failed temporarily."
fi

# Step 6: Set up cron job
echo ""
echo "6️⃣  Setting up cron job..."

CRON_CMD="30 8 * * * /bin/bash $PROJECT_ROOT/scripts/daily_price_update.sh >> $PROJECT_ROOT/logs/price_update.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "daily_price_update.sh"; then
    echo "   ℹ️  Cron job already exists:"
    crontab -l | grep "daily_price_update.sh"
    echo ""
    read -p "   Replace it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove old, add new
        (crontab -l 2>/dev/null | grep -v "daily_price_update.sh"; echo "$CRON_CMD") | crontab -
        echo "   ✓ Cron job updated"
    else
        echo "   ⊘ Keeping existing cron job"
    fi
else
    # Add new cron job
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    echo "   ✓ Cron job added"
fi

# Summary
echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "📋 Summary:"
echo "   • Python $PYTHON_VERSION with yfinance & pandas"
echo "   • Logs directory: $PROJECT_ROOT/logs"
echo "   • Scripts are executable"
echo "   • Cron job runs daily at 8:30 AM (after markets open)"
echo ""
echo "📝 Cron job details:"
crontab -l | grep "daily_price_update.sh"
echo ""
echo "🔍 Verify with:"
echo "   crontab -l                    # List all cron jobs"
echo "   tail -f logs/price_update.log # Watch logs (after first run)"
echo ""
echo "🧪 Test manually:"
echo "   cd $PROJECT_ROOT"
echo "   make update-prices"
echo ""
echo "🎉 All set! Prices will update automatically every morning at 8:30 AM."
echo ""
echo "ℹ️  Note: Backend auto-reloads when CSV files change (no restart needed)"
