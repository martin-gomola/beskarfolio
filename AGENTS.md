# BeskarFolio - AI Assistant Guide

> **⚠️ IMPORTANT FOR AI ASSISTANTS**: Before suggesting solutions, check `LESSONS_LEARNED.md` for documented solutions to common issues. This prevents repeating solved problems and applies battle-tested fixes.

## Project Overview

BeskarFolio is a **minimal portfolio tracking application** that was simplified from an over-engineered system. It focuses on core functionality: tracking stock transactions, calculating returns, and displaying portfolio performance.

### Tech Stack

- **Backend**: FastAPI (Python 3.11) - stateless API
- **Frontend**: React + TypeScript + Vite
- **Storage**: Browser localStorage (transactions) + CSV files (prices)
- **Styling**: Tailwind CSS (dark mode only)
- **Containerization**: Docker + Docker Compose
- **Price Data**: yfinance/Finnhub/FMP (with historical CSV fallback)
- **Deployment**: Docker (self-hosted)

## Development Philosophy

**Core Principle**: **SHIP FIRST, OPTIMIZE LATER**

BeskarFolio follows anti-perfectionism principles learned from industry experience:

1. ✅ **Good Enough is Perfect** - Ship working features, not perfect code
2. ✅ **User Value Over Code Beauty** - Prioritize features users need
3. ✅ **Time-Box Perfectionism** - Limit refactoring to 20% of development time
4. ✅ **No Premature Optimization** - Optimize only when needed, not "just in case"
5. ✅ **"Is This a Launch Blocker?"** - Critical question for every feature/refactor

**Key Decision Framework**:
- ✅ Does this add user value? → If NO, skip it
- ✅ Can we ship without this? → If YES, ship without it
- ✅ Is this the 3rd refactor? → If YES, it's done, move on

**Why This Matters**:
- Similar projects took **12 years** due to endless refactoring and perfectionism
- BeskarFolio shipped in **months** by simplifying early and shipping incrementally
- Refactor when it provides value, not for "code beauty"

**📖 See**: `PERFECTIONISM_LESSONS.md` for detailed case studies and anti-patterns to avoid.

## Architecture

```
beskarfolio/
├── backend/              # FastAPI application
│   ├── main.py          # Entry point - registers all route modules
│   ├── api/             # API route modules (REFACTORED 2025-12-13)
│   │   ├── routes.py         # Health check endpoints only
│   │   ├── transactions.py   # Transaction CRUD + CSV import
│   │   ├── portfolio.py      # Holdings & portfolio summary
│   │   ├── prices.py         # Price fetching & validation
│   │   ├── analytics.py      # Performance analytics (gains, annual, tax-free)
│   │   ├── imports.py        # Broker imports (IBKR)
│   │   └── admin.py          # Admin tools (logs)
│   ├── logic/           # Business logic modules
│   │   ├── models.py         # Pydantic models (centralized)
│   │   ├── prices/           # Price subsystem (service, storage, providers, history)
│   │   ├── currency_service.py  # Currency conversion
│   │   ├── tax_free.py       # Tax-free calculations (FIFO)
│   │   ├── annual_performance.py  # Year-over-year performance
│   │   ├── realized_gains.py # Realized gains tracking
│   │   └── allocation.py     # Portfolio allocation logic
│   ├── data/
│   │   └── historical_prices/  # CSV files with historical prices
│   ├── config/
│   │   └── settings.py       # Centralized configuration
│   ├── importers/
│   │   └── ibkr.py           # IBKR CSV parser
│   └── Dockerfile
├── frontend/            # React application
│   ├── src/
│   │   ├── App.tsx          # Main application component
│   │   ├── components/      # UI components (holdings, transactions, etc.)
│   │   ├── hooks/           # Custom React hooks (usePortfolio, useGuestMode, etc.)
│   │   ├── services/        # API services
│   │   ├── types/           # TypeScript type definitions
│   │   └── utils/           # Utility functions
│   └── Dockerfile
├── docker-compose.yml   # Production configuration
├── docker-compose.dev.yml  # Development overrides
└── Makefile            # All commands
```

## Key Design Decisions

### 1. Simplicity First
- **Single-file backend** (`main.py`) - no complex service layers
- **Modular frontend** - Organized into hooks, components, and utilities (refactored from single-file)
- **No authentication** - personal use only (secure guest mode available)
- **Guest Mode** - LocalStorage-only (no backend, secure per-browser isolation)
- **No advanced features** - removed rebalancing, benchmarking, AI analysis

### 2. No Database - localStorage + CSV Only

**BeskarFolio uses NO database**. All data is stored in:

1. **Browser localStorage** - User transactions (JSON in browser)
2. **CSV files** - Historical prices (`backend/data/historical_prices/*.csv`)
3. **JSON file** - Exchange rates (`backend/data/exchange_rates.json`)

**Why no database?**
- Simplicity: No PostgreSQL setup, no migrations
- Privacy: User data never leaves their browser
- Portability: Export/import via CSV
- Stateless backend: Easier to scale and deploy

**Data Flow:**
```
Browser localStorage → API request → Backend calculates → Response
     (transactions)                    (stateless)        (holdings, returns)
```

### 3. Price Fetching Strategy

**Single Source of Truth**: `data/historical_prices/{TICKER}_prices.csv`

**Dual Update System**:
1. **Daily Automated** (8:30 AM, outside Docker) - 100% success rate
   - Updates ALL tickers via yfinance (no IP blocking)
   - Updates EUR/USD exchange rates
   - Primary/reliable method

2. **Manual UI Button** (on-demand, inside Docker) - 80% success rate
   - Updates US tickers via Finnhub (works in Docker)
   - EU tickers fail (wait for next cron run)
   - Optional/immediate updates

See `DEPLOYMENT_GUIDE.md` for complete deployment and price update details.

**Multi-Provider Fallback Chain** (for UI button):
- **Current Prices**: Finnhub → FMP → yfinance → stale cache
- **Historical Data**: FMP → yfinance (Finnhub free tier doesn't support historical)

**Priority Logic**:
- Finnhub used first for current prices (60 calls/min = 86,400/day - most generous)
- FMP as fallback (250 calls/day but limited to ~500 popular tickers)
- yfinance as last resort (unlimited but often blocks Docker IPs)

**Provider Capabilities** (Free Tiers):
1. **FMP**: 250 calls/day, ~500 popular US tickers only (AAPL ✓, DELL ✗)
2. **Finnhub**: 60 calls/min, all US tickers for current prices only
3. **yfinance**: Unlimited but often blocks Docker IPs

**How it works**:
- Each ticker has ONE CSV file: `{TICKER}_prices.csv`
- Latest row = current price
- Smart caching with 4-hour TTL
- New prices are appended (preserves history)
- Automatic fallback when providers fail
- In-memory cache for fast lookups (mtime-based invalidation)

**Provider Strategy by Portfolio**:
- **Popular US stocks** (S&P 500): FMP + Finnhub sufficient (99% reliability)
- **All US stocks**: Finnhub (current) + yfinance (historical)
- **European/International**: yfinance only (may have gaps)
- **Mixed portfolio**: All three configured (recommended)

**Detailed Documentation**: See `backend/PRICE_PROVIDERS.md` for:
- Complete free tier comparison
- Troubleshooting common errors
- When to upgrade to paid plans
- Cost estimates and recommendations

**Ticker Validation**:
- API endpoint: `GET /api/prices/validate/:ticker`
- Validates ticker format before adding transactions
- Returns: ticker info (name, currency, exchange) or error message
- Common formats: `AAPL` (US), `TSLA.DE` (Germany - Xetra), `AIR.PA` (France - Euronext)
- Uses lightweight yfinance query

**Historical Price Optimization** (v1.3+):
- **Smart Date Calculation**: Only fetches dates needed for calculations
- **Required Dates**:
  - Transaction dates (when you bought/sold)
  - Year boundaries (Jan 1, Dec 31) for annual performance
  - Today's date for current valuations
- **Impact**: Reduces API calls by ~95% (fetch ~10 dates instead of 365 days)
- **Example**: For 2024-2025 portfolio:
  - Old: Fetch 2025-11-24 to 2025-12-14 (21 days) = wasteful
  - New: Fetch only 2024-01-01, 2024-12-31, 2025-01-01, transaction dates, today
- **Implementation**: `get_required_dates_for_transactions()` in `backend/logic/prices/history.py`
- **Still Efficient**: Date ranges saved to CSV, lookups use O(log n) binary search
- **No Daily Charts**: We don't show daily price charts, so daily prices not needed

### 4. Currency Handling

- Each ticker has a native currency (USD or EUR)
- Prices are stored and displayed in the ticker's native currency
- Multi-currency portfolio with conversion support
- Currency symbols: `$` for USD, `€` for EUR
- **Exchange rates**: Updated daily via automated cron job
  - Source: exchangerate-api.com (free tier, 1500 requests/month)
  - Stored in: `backend/data/exchange_rates.json`
  - Backend reads rates from file (cache + daily update = reliable)
  - Fallback rates available if API fails

### 5. Performance Measurement: Time-Weighted Return (TWR)

**Primary Metric**: Time-Weighted Return (TWR) - Industry standard for measuring portfolio performance.

**What TWR Does**:
- Eliminates impact of cash flows (deposits/withdrawals)
- Measures true investment performance independent of timing
- Allows fair comparison with benchmarks and other portfolios
- Used by professional fund managers globally

**TWR Formula**:
```python
# Split portfolio into periods between cash flows
# For each period:
period_return = (value_end - value_start - net_flow) / value_start

# Chain periods geometrically:
total_twr = [(1 + r1) × (1 + r2) × ... × (1 + rn)] - 1
```

**Implementation**:
- API: `GET /api/portfolio/twr` (authenticated) & `POST /api/portfolio/twr` (guest mode)
- Uses historical prices from CSV files for accurate period valuations

**Additional Metrics** (per holding):
```python
# Weighted average buy price
avg_buy_price = SUM(shares * price) / SUM(shares)

# Current position value
current_value = current_price * total_shares

# Unrealized gain/loss
gain_loss = (current_price - avg_buy_price) * total_shares
```

### 6. Tax-Free Shares (Slovak Rules)

**Slovak Tax Law**: Shares held > 365 days are tax-exempt from capital gains.

- **FIFO Accounting**: Uses First-In-First-Out to track share lots
- **Automatic Calculation**: Analyzes all transactions to determine tax status
- **Per-Ticker Tracking**: Shows exactly which shares are tax-free
- **Next Tax-Free Date**: Indicates when more shares become tax-free

**Implementation**:
- Backend: `backend/logic/tax_free.py` - FIFO calculation engine
- API: `GET /api/tax-free` - Returns tax-free status for all holdings
- Frontend: Collapsible "Tax-Free Holdings" card with detailed breakdown
- See `TAX_FREE_FEATURE.md` for full documentation

### 7. LocalStorage Architecture

**Design**: User data in localStorage, stateless backend for calculations

**How it Works**:
1. **Storage**: Transactions, allocations, settings stored in browser's localStorage
2. **Calculations**: Sent to backend API for portfolio calculations (backend is stateless)
3. **Prices**: Fetched from backend API (cached in CSV files on server)
4. **Persistence**: Data survives page reloads, lost only if browser cache cleared

**Security Model**:
- **Data Isolation** - Each browser has separate data
- **Stateless Backend** - Backend processes data but doesn't store user transactions
- **No Authentication** - Personal use, no user accounts needed

**Implementation Files**:
- `frontend/src/utils/guestStorage.ts` - LocalStorage management
- `frontend/src/hooks/usePortfolio.ts` - Sends transactions to backend for calculation
- `frontend/src/services/transactionService.ts` - Manages localStorage transactions

**Trade-offs**:
- Lost if user clears browser data (use export/backup feature)
- Can't sync across devices (use export/import)
- ~5-10MB localStorage limit (plenty for transaction data)
- Data sent to server for calculations (but never stored)

**Previous Architecture** (removed for security):
- ❌ Backend in-memory storage (`backend/logic/guest_storage.py`)
- ❌ Shared state between users (security issue)
- ❌ LocalStorage deleted on page load (data loss)

## API Endpoints

### Transactions
- `GET /api/transactions` - List all transactions
- `POST /api/transactions` - Add new transaction
- `POST /api/transactions/import` - Import CSV file

### Holdings
- `GET /api/holdings` - Current holdings with returns

### Prices
- `POST /api/prices/update` - Fetch current prices
- `GET /api/prices/status` - Get cached prices with timestamps

### Portfolio
- `GET /api/portfolio/summary` - Portfolio summary (total value, returns)
- `POST /api/portfolio/recalculate` - Recalculate portfolio with fresh prices
- `GET /api/portfolio/twr` - Time-Weighted Return (authenticated mode)
- `POST /api/portfolio/twr` - Time-Weighted Return (guest mode with transactions in body)

### Tax
- `GET /api/tax-free` - Get tax-free shares (Slovak 365-day rule, FIFO accounting)

## Development Workflow

```bash
# Start development (with live reload)
make dev

# Start production
make up

# View logs
make logs

# Rebuild from scratch
make rebuild

# Stop everything
make down

# Deploy to server (localStorage-only architecture)
make deploy              # Full rebuild (~2 minutes with .dockerignore)
make deploy-front        # Frontend only (~10 seconds, requires Node.js on server)
make deploy-back         # Backend only (~20 seconds)
```

**⚠️ CRITICAL**: Before first deployment, ensure `.dockerignore` files exist:
- `frontend/.dockerignore` - Must exclude `node_modules`, `dist`
- `backend/.dockerignore` - Must exclude `venv`, `__pycache__`

Without these files, builds will be **8x slower** (16+ minutes instead of 2 minutes)!

## Common Tasks

### Adding a New Transaction
1. Use "Add Transaction" tab in UI
2. Fill in: date, ticker, shares, price, type (buy/sell)
3. Currency is auto-detected from existing transactions

### Importing CSV
Format: `date,ticker,shares,price,type,currency`
- Column names: `type` or `transaction_type` both work
- Date format: `YYYY-MM-DD`
- Type: `buy` or `sell`

### Updating Prices
1. Click "Update Prices" button in UI
2. Takes ~30 seconds for 12 tickers (0.5s delay between requests)
3. Falls back to historical CSV if yfinance fails
4. Status shows last update time

### Adding Historical Prices
1. Add CSV file to `backend/data/historical_prices/`
2. Format: `{TICKER}_prices.csv`
3. Columns: `Date,Open,High,Low,Close,Volume`
4. Used as fallback when yfinance fails

## UI Features

### Dark Mode Theme
- Inspired by Simply Wall St
- Colors defined in `frontend/src/index.css`
- No light mode toggle (dark only)

### Holdings Table
- Shows: Ticker, Shares, Avg Price, Current Price, Total Value, Return
- Currency symbol based on ticker's native currency
- Three-dot menu per row: View Transactions, Edit, Remove

### Price Status
- Shows exact timestamp of last price check
- "(stale)" warning if > 1 hour old
- Auto-refreshes every 10 seconds

## Known Issues & Limitations

### Yahoo Finance Rate Limiting
- **Problem**: Yahoo Finance blocks requests from Docker containers
- **Solution**: Falls back to historical CSV prices
- **Impact**: Prices may be from July 2025 (still functional)
- **Alternative**: Implement different price provider (Alpha Vantage, IEX Cloud)

### No Currency Conversion
- **Design**: Each ticker displays in its native currency
- **Rationale**: Simplicity over complexity
- **Impact**: Total portfolio value not calculated across currencies

### No Historical Performance
- **Removed**: Complex historical tracking was over-engineered
- **Current**: Only current holdings and returns
- **Rationale**: Core functionality only

## Port Configuration

- **Frontend**: `http://localhost:3000` (dev) / `http://localhost:8080` (prod)
- **Backend**: `http://localhost:8060`

## Docker Best Practices & Build Optimization

### Critical: Always Use `.dockerignore`

**Problem**: Without `.dockerignore`, Docker copies unnecessary files (like `node_modules`, `dist`, etc.) into the build context, causing:
- ❌ Slow builds (16+ minutes instead of 2 minutes)
- ❌ Large image sizes
- ❌ Wasted bandwidth transferring 100+ MB of unnecessary files

**Solution**: Every Dockerfile directory MUST have a `.dockerignore` file.

**Required `.dockerignore` for Frontend** (`frontend/.dockerignore`):
```
# Build dependencies (installed by npm ci in Docker)
node_modules

# Build output (created during Docker build)
dist
build

# Development files
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode
.idea
*.swp
*.swo

# Test coverage
coverage
```

**Required `.dockerignore` for Backend** (`backend/.dockerignore`):
```
# Virtual environment (created in Docker)
venv
__pycache__
*.pyc
*.pyo
*.pyd

# Build output
*.egg-info
dist
build

# Development files
.env
.env.local

# Test files
.pytest_cache
.coverage

# Logs
*.log

# Data files (handled separately)
data/portfolio.db
```

### Local Build Commands: Trade-offs

**`make deploy-front` (fast local build)**:
- ⚡ Builds in ~10 seconds (vs ~10 minutes in Docker)
- ⚠️ Creates `node_modules` on server
- ⚠️ Requires `.dockerignore` or future Docker builds will copy `node_modules` (16+ minute builds!)
- ⚠️ Requires Node.js installed on server

**`make deploy` (Docker build)**:
- ✅ No server dependencies needed
- ✅ Consistent builds
- 🐌 Slower (~2 minutes with `.dockerignore`, 16+ minutes without)

**Best Practice**:
1. ✅ Always have `.dockerignore` files
2. ✅ Use `make deploy-front` for quick iterations
3. ✅ Remove `node_modules` from server if switching back to `make deploy`
4. ✅ Run `docker system prune -af` periodically to clean up

### Deployment Speed Comparison

| Method | Time | Requirements | Notes |
|--------|------|--------------|-------|
| `make deploy-front` | ~10s | Node.js on server | Fast, but creates `node_modules` |
| `make deploy-back` | ~20s | None | Backend only |
| `make deploy` (with `.dockerignore`) | ~2m | None | Full rebuild |
| `make deploy` (without `.dockerignore`) | ~16m | None | ❌ SLOW - missing `.dockerignore` |

### When Builds Are Slow

If `make deploy` suddenly becomes slow (10+ minutes):

1. **Check for `node_modules` on server**:
   ```bash
   ls -lh frontend/node_modules  # Should not exist
   ```

2. **Verify `.dockerignore` exists**:
   ```bash
   cat frontend/.dockerignore  # Must exclude node_modules
   ```

3. **Remove server `node_modules`**:
   ```bash
   rm -rf frontend/node_modules
   ```

4. **Clean Docker cache**:
   ```bash
   docker system prune -af
   ```

5. **Rebuild**:
   ```bash
   make deploy
   ```

### Backend Docker Optimization Risk

- The backend Docker image currently assumes all Python dependencies install from prebuilt wheels.
- This is why the Dockerfile no longer installs build tools or runtime packages like `curl`/`libpq`.
- If a future dependency needs native compilation or system libraries, Docker builds may start failing with compiler or missing-library errors.
- In that case, update `backend/Dockerfile` to reintroduce only the required `apt-get` packages instead of reverting to a broad toolchain by default.

## Troubleshooting

### Port Already in Use
- Check `docker-compose.yml` for port mappings
- **Important**: Port 3000 conflicts may be caused by containers running in other terminal windows
- Use `docker ps` to check all running containers before assuming port is truly free
- Use `lsof -i :3000` to find what process is using the port

### TypeScript Compilation Errors
- **TS6133**: "Variable is declared but its value is never read"
  - Remove unused functions, variables, or imports
  - Example: `syncGuestTransactions` function was declared but never called - solution was to remove it
- Run `npm run build` in frontend directory to check for TypeScript errors before Docker build
- TypeScript uses strict mode - all declared code must be used

### Frontend Build Errors
- Removed `tailwindcss-animate` plugin (caused errors)
- Removed `clsx` and `tailwind-merge` dependencies
- Simplified `cn()` utility function

### CSV Import Not Working
- Check column names: accepts both `type` and `transaction_type`
- Verify date format: `YYYY-MM-DD`
- Check file encoding: UTF-8

### Prices Not Updating
- Check backend logs: `make logs`
- Verify yfinance is working or falling back to historical
- Ensure historical CSV files exist for tickers

## File Locations

### Important Backend Files (Refactored)
- **Entry point**: `backend/main.py` (registers all route modules)
- **API modules**: `backend/api/` (7 focused modules)
  - `routes.py` - Health checks
  - `transactions.py` - Transaction CRUD
  - `portfolio.py` - Holdings & summary
  - `prices.py` - Price operations
  - `analytics.py` - Performance analytics
  - `imports.py` - Broker imports
  - `admin.py` - Admin tools
- **Logic modules**: `backend/logic/`
  - `models.py` - Pydantic models (centralized)
  - `prices/service.py` - Public price-service facade
  - `prices/history.py` - Historical backfill and required-date logic
  - `prices/storage.py` - CSV storage and file metadata
  - `currency_service.py` - Currency conversion
  - `tax_free.py` - Tax-free calculations (FIFO)
  - `annual_performance.py` - Year-over-year performance
  - `realized_gains.py` - Realized gains tracking
- **Configuration**: `backend/config/settings.py` (all env vars)

### Automation Scripts (Root Level)
- **`scripts/`**:
  - `update_portfolio_data.py` - Daily price & exchange rate updates (runs on host)
  - `daily_price_update.sh` - Cron job wrapper
  - `setup_server_automation.sh` - One-command server setup

### Important Frontend Files
- **Main frontend**: `frontend/src/App.tsx`
- **Portfolio hook**: `frontend/src/hooks/usePortfolio.ts` (portfolio state, guest mode routing)
- **Guest mode hook**: `frontend/src/hooks/useGuestMode.ts`
- **Guest storage utils**: `frontend/src/utils/guestStorage.ts` (localStorage management)
- **Portfolio calculations**: `frontend/src/utils/portfolioCalculations.ts`
- **Transaction service**: `frontend/src/services/transactionService.ts`

### Data Files
- **Historical prices**: `backend/data/historical_prices/*.csv`
- **Exchange rates**: `backend/data/exchange_rates.json`
- **User transactions**: Browser localStorage (not on server)

### Configuration
- **Docker Compose**: `docker-compose.yml` (production)
- **Dev overrides**: `docker-compose.dev.yml` (live reload)
- **Commands**: `Makefile` (all make commands)
- **Tailwind**: `frontend/tailwind.config.js`

## Code Style

### Backend (Refactored 2025-12-13)
- **Modular API structure**: 7 focused route modules in `api/` directory
  - `routes.py` (61 lines) - Health checks only
  - `transactions.py` (446 lines) - Transaction CRUD + CSV import
  - `portfolio.py` (354 lines) - Holdings & portfolio summary
  - `prices.py` (270 lines) - Price fetching & validation
  - `analytics.py` (225 lines) - Performance analytics
  - `imports.py` (277 lines) - Broker imports
  - `admin.py` (53 lines) - Admin tools
- **Single Responsibility Principle**: Each module has one clear purpose
- **DRY (Don't Repeat Yourself)**: No code duplication
- **Clean imports**: All Pydantic models centralized in `logic/models.py`
- Type hints and comprehensive docstrings
- Minimal error handling (fail fast)
- Logging for debugging

**Module Guidelines:**
- Keep modules focused (~200-450 lines ideal)
- Related endpoints grouped together
- Clear, descriptive module names
- Easy to find specific functionality

### Frontend
- Modular component structure organized by feature
- Custom React hooks for state management (`usePortfolio`, `useGuestMode`, etc.)
- Direct API calls via Axios (no Redux or complex state management)
- Inline styles with Tailwind CSS
- TypeScript for type safety with strict compilation
- **Important**: Remove unused variables/functions to avoid TS6133 compilation errors

## Future Enhancements (If Needed)

⚠️ **Before building any enhancement, ask**: "Is this a launch blocker?" and "Does this add user value?"
See `PERFECTIONISM_LESSONS.md` for the complete decision framework.

1. **Alternative price provider** - Replace yfinance with Alpha Vantage/IEX Cloud
2. **Transaction editing** - Currently only add/view
3. **Currency conversion** - Add EUR/USD conversion for total portfolio value
4. **Export functionality** - Export transactions to CSV
5. **Dividend tracking** - Add dividend transactions
6. **Multi-user support** - Add authentication (major change)

**Low-Effort Wins** (if user value is proven):
- Enhanced API documentation with examples (1-2 hours)
- Basic endpoint testing for regressions (4-6 hours setup)
- Simple usage statistics endpoint (30 minutes)

## Testing

### Manual Testing with MCP Tools

**BeskarFolio includes MCP (Model Context Protocol) integration** for testing:

```bash
# MCP tools available for testing:
- fetchLocalhost      - Get page content, localStorage, console logs
- screenshotLocalhost - Take full-page screenshots
- getLocalStorage     - Read browser localStorage data
- importCsv           - Import CSV transactions directly
```

**Testing Workflow:**

1. **Start the app:**
   ```bash
   make dev  # Starts on localhost:3000
   ```

2. **Test with MCP tools:**
   ```
   # Check if app is running
   "Fetch localhost:3000 and show me what's on the page"

   # View localStorage data (guest mode)
   "Get localStorage from localhost:3000"

   # Take screenshot
   "Take a screenshot of localhost:3000"

   # Import test data
   "Import this CSV: date,ticker,shares,price,type,currency
   2024-01-15,AAPL,10,150.00,buy,USD"
   ```

3. **Test backend endpoints directly:**
   ```bash
   curl http://localhost:8060/health
   curl http://localhost:8060/api/transactions
   curl http://localhost:8060/api/prices/status
   ```

4. **Verify functionality:**
   - Import CSV with test data
   - Verify holdings display correctly
   - Update prices and check status
   - Add manual transaction
   - Check returns calculation

### Automated Testing (Future)
- Unit tests for each `api/` module
- Integration tests for API endpoints
- End-to-end tests with frontend

## Deployment

**Production Server**: Deploy to any Linux host (e.g., `/home/user/beskarfolio`)

### Docker Deployment (Self-Hosted)

```bash
# On server:
cd ~/beskarfolio
git pull
make deploy

# First time only:
# - Ensure Docker and Docker Compose installed
# - Ensure ports 8080, 8060 available
# - Set up automated price updates (see below)
```

### Automated Price Updates (Server)

**One-time setup** (run once after first deployment):

```bash
cd ~/beskarfolio
./scripts/setup_server_automation.sh
```

This script:
- ✅ Installs Python dependencies (yfinance, pandas, requests)
- ✅ Creates logs directory
- ✅ **Fixes CSV file permissions** (Docker needs write access)
- ✅ Makes scripts executable
- ✅ Sets up cron job for daily updates at 8:30 AM:
  - **EUR/USD exchange rates** (from exchangerate-api.com)
  - **ALL portfolio ticker prices** (using yfinance - runs outside Docker where it works reliably)
- ✅ Tests the update immediately

**Manual update** anytime:
```bash
cd ~/beskarfolio
make update-prices
```

See `DEPLOYMENT_GUIDE.md` for complete deployment, automation, and troubleshooting guide.

### Guest Mode Deployment (public demo, no database)

For public demos or testing without database setup:

```bash
# On server:
git pull
make deploy-guest
```

**Guest Mode Features:**
- ✅ Transaction data stored in browser localStorage only
- ✅ No database required (stateless backend)
- ✅ Each browser has completely isolated data (secure for multi-user demos)
- ✅ Backend only handles calculations and price fetching
- ⚠️ Data lost when browser cache cleared (use export for backup)

**Use Cases:**
- Public portfolio tracking demos
- Testing without database setup
- Secure multi-user environments (no shared state)
- Presentations and showcases

**Switching Between Modes:**
```bash
# Switch to guest mode
make deploy-guest

# Switch back to normal mode
make deploy
```

### Server Maintenance (External)

**⚠️ IMPORTANT:** Server maintenance is infrastructure-level, not BeskarFolio-specific.

**Maintenance scripts location:** Your infrastructure management repo (if applicable)

**Why external?**
- Server maintenance affects ALL services (AFFiNE, AdGuard, Portainer, etc.)
- Not specific to BeskarFolio
- Managed in infrastructure repository

**Health Check Before Deployment:**
```bash
# Always check server health before blaming slow deploys
top  # Load < 4, zombies = 0, CPU idle > 80%
free -h  # Memory < 70%, swap < 20%
docker ps  # Check running containers
```

**Healthy Server Indicators (4-core system):**
- ✅ Load average: < 4
- ✅ Zombie processes: 0
- ✅ CPU idle: > 80%
- ✅ Memory used: < 70%
- ✅ Swap used: < 20%

**If server is unhealthy:**
1. Check running services: `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Size}}"`
2. Find resource hogs: `top` (look for processes using > 100% CPU)
3. Stop unnecessary services: `docker-compose down` in the relevant service directory
4. Set up automated maintenance (daily cleanup, weekly reboot) via cron

**Automated Maintenance (Recommended):**
- Daily cleanup: Caches, zombies, Docker prune (00:00)
- Weekly reboot: Sunday 3 AM
- Service monitoring: Every 15 minutes

**See:** `LESSONS_LEARNED.md` → "Server Resource Management" for case study on ClickHouse overload (load 17 → 1.24 after stopping unnecessary service)

## Performance

- **Build time**: ~30 seconds (with cache)
- **Startup time**: ~10 seconds
- **Price update**: ~30 seconds for 12 tickers
- **Page load**: Instant (static frontend)

## Dependencies

### Backend (requirements.txt)
- fastapi
- uvicorn
- pandas
- yfinance
- python-multipart
- finnhub-python (optional)
- requests

### Frontend (package.json)
- react
- typescript
- vite
- tailwindcss
- lucide-react (icons)

## Environment Variables

None required for local development. Docker Compose handles all configuration.

For production, see Security section below.

## Security

BeskarFolio includes basic security for public deployments:

### How It Works

1. **CORS Protection**: Only requests from allowed origins can access the API
   - Default: `your-domain.com`, `localhost:3000`, `localhost:8080`
   - Browser requests from your app work automatically

2. **API Key Protection** (optional but recommended):
   - External requests (curl, scripts) require `X-API-Key` header
   - Browser requests from trusted origins bypass the key check
   - Always allows `/health` endpoint for monitoring

### Setup for Production

1. Copy the example config:
   ```bash
   cp config/env.example config/.env
   ```

2. Generate an API key and edit `.env`:
   ```bash
   openssl rand -hex 32
   # Add the key to config/.env
   ```

3. Configure your domains/IPs in `config/.env`:
   ```bash
   # Your production values
   BESKARFOLIO_API_KEY=your-generated-key-here
   CORS_ORIGINS=https://your-domain.com,http://192.168.x.x:8080,http://localhost:3000
   TRUSTED_HOSTS=your-domain.com,192.168.x.x,localhost,127.0.0.1
   ```

4. Deploy:
   ```bash
   make deploy
   ```

### Using the API Key

External requests must include the key:
```bash
# With API key
curl -H "X-API-Key: your-key" https://your-domain.com/api/prices/status

# Without key (will fail with 401)
curl https://your-domain.com/api/prices/status
```

### Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `BESKARFOLIO_API_KEY` | API key for external requests | None (disabled) |
| `CORS_ORIGINS` | Allowed browser origins (comma-separated) | localhost:3000, localhost:8080 |
| `TRUSTED_HOSTS` | Hosts that bypass API key (comma-separated) | localhost, 127.0.0.1 |

### Security Notes

- **Browser requests**: Work automatically from your app (CORS + trusted host check)
- **Health endpoint**: Always accessible (for monitoring tools)
- **Docs endpoint**: Always accessible (`/docs`, `/openapi.json`)
- **Scripts/cron**: Need the API key if configured

### Local Development

Security is relaxed in dev mode:
- All CORS origins allowed when `RELOAD=true`
- API key optional (set if you want to test auth)

## Backup & Data

### Backup Transactions
Since transactions are stored in browser localStorage:

1. **Use Export feature** in the UI (Settings → Export)
2. **Manual**: Open DevTools → Application → localStorage → copy `beskarfolio_guest_transactions`

### Restore Transactions
1. **Use Import feature** in the UI (Import → CSV)
2. **Manual**: Paste JSON into localStorage key `beskarfolio_guest_transactions`

### Backup Prices (optional)
```bash
# Copy CSV files
cp -r backend/data/historical_prices/ ~/backup/
```

## Historical Context

This project was **heavily simplified** from an over-engineered system that included:
- Complex service layers
- Multiple database classes
- Advanced rebalancing algorithms
- Benchmark comparisons
- AI-powered analysis
- Historical performance tracking
- Multiple Docker Compose files
- Complex frontend routing

**Philosophy**: Start minimal, add complexity only when needed.

**Lessons Learned**: After studying a similar project that took 12 years due to perfectionism traps (endless refactoring, tool optimization, architecture debates), BeskarFolio deliberately chose:
- ✅ Ship working features, iterate later
- ✅ Simplify early, add complexity only when proven necessary
- ✅ Time-boxed refactoring (Dec 2025 modularization completed in one session)
- ✅ Pragmatic technical decisions (SQL over ORM debates, CSV over complex storage)

**📖 See**: `PERFECTIONISM_LESSONS.md` for detailed anti-patterns and the decision framework used in this project.

## MCP Integration (Codex)

BeskarFolio includes a local development MCP server for seamless Codex integration.

### BeskarFolio MCP Server
**Location**: `mcp-server/index.ts`

**Tools**:
- `fetchLocalhost` - Get page content, localStorage, metadata
- `screenshotLocalhost` - Take full-page screenshots
- `getLocalStorage` - Read localStorage data
- `importCsv` - Import CSV transactions

**Configuration**: See `.mcp.json.sample` for the admin-first local template

### Setup

```bash
# Copy template
cp .mcp.json.sample .mcp.json

# Edit for your machine
# - Update absolute path for the beskarfolio server

# .mcp.json is in .gitignore for security
```

**See**: `MCP_SETUP.md` for complete configuration guide

### Usage Examples

```
# Browser automation
"Take a screenshot of localhost:3000"
"Check localStorage on localhost:3000"
"Import this CSV into the app: date,ticker,shares..."

# AFFiNE integration
"List all documents in AFFiNE"
"Create a new document titled 'Meeting Notes'"
"Search for 'docker' in my AFFiNE workspace"
```

## Getting Help

1. Check `README.md` for quick start
2. Check `docs/LESSONS_LEARNED.md` for solutions to common issues
3. Check `Makefile` for available commands
4. Check backend logs: `make logs`
5. Check this file for architecture details
6. Check `docs/MCP_SETUP.md` for MCP server configuration
7. Check `docs/DEPLOYMENT_GUIDE.md` for Docker server deployment

**🆘 Troubleshooting Priority:**
1. **Check `LESSONS_LEARNED.md` first** - Contains documented solutions to recurring issues
2. Search for error message in `LESSONS_LEARNED.md` Quick Reference table
3. Check relevant symptom (slow builds, API errors, cache issues)
4. Follow the documented solution before trying new approaches

---

**Last Updated**: January 30, 2026
**Version**: 1.5.1 (Documentation Cleanup)

## Recent Changes

### Version 1.5.1 (2026-01-30) - Documentation Cleanup
- ✅ **Clarified Architecture**: Updated to reflect no-database reality (localStorage + CSV only)
- ✅ **Removed PostgreSQL references**: Tech stack, schema, ports updated
- ✅ **Fixed outdated docs**: Removed references to non-existent database.py

### Version 1.5 (2026-01-08) - LocalStorage-Only + Docker Optimization
- ✅ **Simplified Architecture**: Removed all "guest mode" detection - single localStorage-only architecture
- ✅ **Fixed API Endpoints**: All frontend API calls now use `/api` prefix
- ✅ **Docker Best Practices**: Added `.dockerignore` files to prevent slow builds
- ✅ **Build Speed**: Reduced build time from 16+ minutes to ~2 minutes with proper `.dockerignore`
- ✅ **Fast Deployment**: Added `make deploy-front` (~10s) and `make deploy-back` (~20s) commands
- ✅ **Updated Documentation**: Added "Docker Best Practices & Build Optimization" section
- ⚠️ **Critical Lesson**: Always create `.dockerignore` to exclude `node_modules` from Docker context
- 📄 **Impact**: 8x faster deployments, cleaner codebase without mode detection logic

### Version 1.4 (2025-12-17) - Development Philosophy
- ✅ **Anti-Perfectionism Guidelines**: Added `PERFECTIONISM_LESSONS.md`
- ✅ **Decision Framework**: "Is this a launch blocker?" test for all features
- ✅ **Case Studies**: Lessons from similar project that took 12 years
- ✅ **Development Philosophy**: Documented "SHIP FIRST, OPTIMIZE LATER" approach
- ✅ **Updated Documentation**: Integrated philosophy throughout `AGENTS.md`
- 📖 **Context**: Validates BeskarFolio's approach of simplifying early and shipping fast

### Version 1.3 (2025-12-13) - Backend Refactoring
- ✅ **Modular API structure**: Split monolithic `routes.py` (1,857 lines) into 7 focused modules
- ✅ **97% reduction** in routes.py size (1,857 → 61 lines)
- ✅ **Zero breaking changes**: All API endpoints unchanged
- ✅ **Improved maintainability**: Each module has single responsibility
- ✅ **DRY compliance**: Removed all code duplication
- ✅ **Deleted dead code**: Removed 180 lines of deprecated `guest_storage.py`
- ✅ **Centralized models**: All Pydantic models in `logic/models.py`
- ✅ **MCP testing**: Added testing instructions using MCP tools
- 📄 **Documentation**: See `backend/REFACTOR_SUMMARY.md` for details

### Version 1.2 (Previous)
- MCP Integration + Secure Configuration


## Testing the Refactored Backend

### Quick Verification

1. **Check backend starts:**
   ```bash
   make dev
   # Backend should start on localhost:8060
   # Frontend should start on localhost:3000
   ```

2. **Test with MCP tools (easiest way):**
   ```
   Ask Codex:
   - "Fetch localhost:3000 and show what's on the page"
   - "Get localStorage from localhost:3000" (for guest mode)
   - "Take a screenshot of localhost:3000"
   ```

3. **Test backend health:**
   ```bash
   curl http://localhost:8060/health
   # Should return: {"status": "healthy", ...}
   ```

4. **Verify all 36 routes registered:**
   ```bash
   curl http://localhost:8060/docs
   # FastAPI auto-docs shows all endpoints
   ```

### Module-Specific Testing

**Transactions Module** (7 endpoints):
```bash
curl http://localhost:8060/api/transactions
curl -X POST http://localhost:8060/api/transactions -H "Content-Type: application/json" -d '{"ticker":"AAPL","type":"buy","date":"2024-01-15","shares":10,"price":150.00,"currency":"USD"}'
```

**Portfolio Module** (5 endpoints):
```bash
curl http://localhost:8060/api/holdings
curl http://localhost:8060/api/portfolio/summary
```

**Prices Module** (9 endpoints):
```bash
curl http://localhost:8060/api/prices/status
curl http://localhost:8060/api/prices/validate/AAPL
```

**Analytics Module** (5 endpoints):
```bash
curl http://localhost:8060/api/portfolio/realized-gains
curl http://localhost:8060/api/tax-free
```

**Imports Module** (2 endpoints):
```bash
# Use MCP importCsv tool or frontend UI
```

**Admin Module** (1 endpoint):
```bash
curl http://localhost:8060/api/admin/logs
```

### Troubleshooting

If endpoints don't work:
1. Check `make logs` for errors
2. Verify all modules compiled: `python -m py_compile backend/api/*.py`
3. Check route registration: `python -c "from main import app; print(len(app.routes))"`
   - Should show: "36 routes registered"
4. See `backend/REFACTOR_SUMMARY.md` for detailed troubleshooting

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
