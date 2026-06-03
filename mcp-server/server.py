"""
BeskarFolio MCP server.

A thin, read-only Model Context Protocol server that lets local agents
(Codex, Cursor, Claude Desktop, ...) call BeskarFolio's public price and
calculation endpoints as native tools.

It wraps the same endpoints declared in the `.well-known/webmcp` manifest, so
there is one source of truth for "what an agent can do here." Everything is
read-only: no tool writes data or triggers paid external price fetches.

Config (env vars):
    BESKARFOLIO_API_URL   Base URL of the API. Default: http://localhost:8060
                          For prod: https://stonks.martingomola.com
    BESKARFOLIO_API_KEY   Optional X-API-Key for API-key-protected deployments.

Run:
    python mcp-server/server.py            # stdio transport (for agents)
"""
import os

import httpx
from mcp.server.fastmcp import FastMCP

API_URL = os.environ.get("BESKARFOLIO_API_URL", "http://localhost:8060").rstrip("/")
API_KEY = os.environ.get("BESKARFOLIO_API_KEY", "").strip()

_HEADERS = {"X-API-Key": API_KEY} if API_KEY else {}
_TIMEOUT = 15.0

mcp = FastMCP("beskarfolio")


def _get(path: str, params: dict | None = None) -> dict | list:
    """GET a read-only BeskarFolio endpoint and return parsed JSON."""
    url = f"{API_URL}{path}"
    with httpx.Client(timeout=_TIMEOUT, headers=_HEADERS) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


@mcp.tool()
def get_latest_prices() -> dict:
    """Get the latest cached price for every ticker the server tracks.

    Returns a map of ticker -> {price, date, currency}. These are the most
    recent close/intraday snapshots BeskarFolio has cached; this does not
    trigger a live fetch.
    """
    return _get("/api/prices/latest")


@mcp.tool()
def get_price_status(details: bool = False) -> dict:
    """Summarize price-cache freshness.

    Returns total ticker count, the most recent update timestamp, and counts of
    cached/recent/stale tickers. Set details=True to include the full per-ticker
    list (larger payload).
    """
    return _get("/api/prices/status", params={"details": str(details).lower()})


@mcp.tool()
def get_exchange_rates() -> dict:
    """Get current EUR/USD and USD/EUR exchange rates.

    Rates are refreshed daily. Returns the rates plus source and update
    timestamp.
    """
    return _get("/api/exchange-rates")


@mcp.tool()
def get_ticker_profile(ticker: str) -> dict:
    """Classify a single ticker.

    Returns company/fund name, normalized sector, industry, country, region,
    ETF flag, and currency for the given ticker (e.g. AAPL or VWCE.DE).
    """
    return _get(f"/api/tickers/{ticker.upper().strip()}/profile")


if __name__ == "__main__":
    mcp.run()
