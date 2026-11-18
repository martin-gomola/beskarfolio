# BeskarFolio assistant guide

Canonical project guidance for coding agents. Keep this file concise;
`CLAUDE.md` should point here. Put detailed product documentation in `README.md`,
runtime terminology in `CONTEXT.md`, and PWA behavior in `docs/PWA.md`.

## Before changing code

1. Verify `pwd`, Git branch, and worktree state.
2. Read the relevant source flow end to end and search every caller before
   changing a shared function.
3. Preserve user-owned changes and runtime price data.
4. Prefer the smallest implementation that fits existing boundaries.
5. Run focused checks, then `make check` for a coherent change.

Do not ask for permission for clear, low-risk, reversible work. Ask only when
blocked by ambiguity, missing authority, destructive work, credentials,
production changes, or a materially different scope.

## Product and architecture

BeskarFolio is a personal portfolio tracker:

- Backend: stateless FastAPI on Python 3.11.
- Frontend: React, TypeScript, Vite, and Tailwind CSS.
- Storage: transactions and settings in browser localStorage; historical prices
  in CSV files; exchange rates and snapshots in JSON.
- Deployment: Docker Compose with Nginx, plus a split Render demo.
- No database, user accounts, server-side portfolio persistence, Redux, or
  background job framework.

The browser sends transactions to the backend for calculations. The backend
must not persist those transactions.

## Stable ownership boundaries

### Browser portfolio state

`frontend/src/services/browserPortfolioState.ts` is the transaction read/write
seam. It owns persistence, cache invalidation, and one typed notification per
logical mutation. Callers must not write the transaction storage key or publish
transaction events directly.

### Price reads and refreshes

- `backend/logic/prices/read_model.py` owns latest prices, ranges, 52-week
  projections, freshness, and snapshot-versus-CSV precedence.
- `backend/logic/prices/refresh.py` owns manual and scheduled refresh behavior.
- `backend/logic/prices/storage.py` owns atomic CSV/JSON persistence and cache
  invalidation.
- Provider fallback remains Twelve Data, FMP, Finnhub, then yfinance.

Do not bypass these seams from API routes, scripts, or frontend code.

### Portfolio calculations

- `backend/logic/portfolio_state.py` normalizes transactions and builds open
  holdings.
- `backend/logic/portfolio_valuation.py` values open holdings at current
  quotes and FX (stale and estimated quote policy, EUR totals). Routes fetch
  prices from the price read model and pass them in.
- `backend/logic/tax_free.py` owns Slovak 365-day FIFO tax status.
- `backend/logic/annual_performance.py` and
  `backend/logic/performance_history.py` own performance calculations.
- `backend/logic/allocation.py` owns allocation and rebalancing calculations.

Money, tax, imports, and persistence require explicit validation and a focused
regression check.

### PWA lifecycle

- `frontend/public/sw.js` owns only the versioned application shell.
- `/api/*` stays network-only.
- `frontend/src/platform/updateLifecycle.ts` owns worker registration, update
  discovery, waiting-worker activation, and guarded reloads.
- New workers wait until the user chooses **Update now**.
- `frontend/scripts/check-pwa.mjs` guards the generated worker and manifest.

Do not add Workbox, background sync, push, or IndexedDB synchronization without
a demonstrated product need. See `docs/PWA.md`.

## Security and privacy

- Never hardcode or print secrets.
- Keep API keys in `config/.env` or deployment-managed environment variables.
- Preserve ticker sanitization, request limits, CORS, API-key checks, and
  persistence error handling.
- Crawler directives are advisory, not authentication.
- WebMCP and the local MCP server remain read-only; they must not mutate
  portfolio data or trigger paid provider calls.

Run `python3 scripts/security/pii_scan.py --staged` before committing.

## Development

```bash
make setup          # first local setup
make dev            # live reload: frontend :3000, backend :8060
make check          # frontend, PWA, privacy, backend, diff checks
make start          # production-shaped local stack on :8080/:8060
make logs
make status
make stop
```

When dependencies change, use `make rebuild-dev`. Frontend TypeScript is strict;
remove unused imports and variables rather than suppressing errors.

## Verification

Use the smallest focused check first:

```bash
cd frontend && npm run test:browser-state
cd frontend && npm run build
cd backend && python -m unittest discover -s tests
bash scripts/check_privacy.sh
git diff --check
```

The backend tests require Python 3.11 dependencies from
`backend/requirements-dev.txt`; `make check` runs them in the development
container. Do not change pinned runtime dependencies merely to accommodate the
host Python version.

For PWA changes, inspect `frontend/dist/manifest.json` and
`frontend/dist/sw.js`, then perform the two-tab and physical-device checks in
`docs/PWA.md`. Do not claim installed-iPhone behavior from desktop emulation.

## Deployment and data safety

```bash
make deploy          # rebuild both production containers
make deploy-front    # replace frontend assets in the running container
make deploy-back     # rebuild backend only
make update          # host-side price and exchange-rate refresh
```

Production deployment is an external mutation and requires explicit user
authorization. Before deployment, inspect the remote branch, dirty state,
Compose project, and health endpoints. Use `git pull --ff-only`; never discard
cron-written price CSV changes to force a pull.

The backend container aligns its runtime uid/gid with the host-owned
`backend/data` volume. Preserve the entrypoint, `PUID`/`PGID` plumbing, atomic
writes, and `PricePersistenceError` behavior.

## Change discipline

- Reuse existing helpers and platform features before adding dependencies.
- No speculative interfaces, factories, state libraries, databases, queues, or
  compatibility layers.
- Keep changes scoped; do not refactor unrelated modules for aesthetics.
- A local commit does not imply push or deployment.
- Report validation gaps honestly, especially unavailable provider APIs,
  unsupported host Python, browser-only behavior, and physical-device checks.
