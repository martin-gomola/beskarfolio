"""
WebMCP discovery endpoints for BeskarFolio.

Serves a `.well-known/webmcp` manifest (W3C Community Group Draft) plus an A2A
AgentCard at `.well-known/agent.json`. These describe the *public, read-only*
calculation/price tools an in-browser AI agent could call, mirroring the
existing FastAPI endpoints.

Why only read-only public endpoints?
- User portfolio data lives in browser localStorage, never on the server, so
  there is nothing private to expose here.
- The spec does not define authentication at this layer. Declaring only GET
  endpoints that already require no auth keeps the blast radius at zero if the
  spec changes.
- The price *update* endpoint is deliberately omitted: it triggers paid
  external API calls and writes to disk.

The manifest is served CORS-open and unauthenticated (see the carve-out in
main.security_middleware) because agents fetch it from a different origin than
the app.

Status: WebMCP has ~0% production adoption and no stable browser support yet
(Chrome 146+ Canary only). This is forward-looking infrastructure; the routes
degrade to plain JSON that no client calls today.
"""
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from config.settings import APP_VERSION

logger = logging.getLogger(__name__)

router = APIRouter()

# Cache discovery docs at the edge/browser for a day. They only change on deploy.
_CACHE_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=86400",
}


def _build_manifest() -> dict:
    """WebMCP manifest declaring public read-only tools backed by real endpoints."""
    return {
        "name": "beskarfolio",
        "version": APP_VERSION,
        "description": (
            "Stateless portfolio price/calculation API. Public tools expose "
            "cached market prices, price freshness, exchange rates, and ticker "
            "classification. User portfolio data is never stored server-side."
        ),
        "tools": [
            {
                "name": "get_latest_prices",
                "description": (
                    "Get the latest cached close/intraday price for every "
                    "ticker the server has data for. Returns price, date, and "
                    "currency per ticker."
                ),
                "inputSchema": {"type": "object", "properties": {}},
                "endpoint": "/api/prices/latest",
                "method": "GET",
            },
            {
                "name": "get_price_status",
                "description": (
                    "Summarize price-cache freshness: total tickers, the most "
                    "recent update timestamp, and counts of cached/recent/stale "
                    "tickers. Pass details=true for the full per-ticker list."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "details": {
                            "type": "boolean",
                            "description": "Include the full per-ticker list (larger payload).",
                        }
                    },
                },
                "endpoint": "/api/prices/status",
                "method": "GET",
            },
            {
                "name": "get_exchange_rates",
                "description": (
                    "Get current EUR/USD and USD/EUR exchange rates (refreshed "
                    "daily) with the source and update timestamp."
                ),
                "inputSchema": {"type": "object", "properties": {}},
                "endpoint": "/api/exchange-rates",
                "method": "GET",
            },
            {
                "name": "get_ticker_profile",
                "description": (
                    "Classify a single ticker: company/fund name, normalized "
                    "sector, industry, country, region, ETF flag, and currency."
                ),
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "ticker": {
                            "type": "string",
                            "description": "Stock ticker, e.g. AAPL or VWCE.DE",
                        }
                    },
                    "required": ["ticker"],
                },
                "endpoint": "/api/tickers/{ticker}/profile",
                "method": "GET",
            },
        ],
    }


def _build_agent_card() -> dict:
    """A2A AgentCard (schema.org SoftwareApplication) for discovery."""
    return {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "BeskarFolio",
        "description": (
            "Minimal stock portfolio tracker. Tracks transactions, computes "
            "FIFO returns, time-weighted return, Slovak tax-free shares, and "
            "allocation. Privacy-first: transactions stay in the browser."
        ),
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "featureList": [
            "Portfolio holdings and returns",
            "Time-weighted return (TWR)",
            "Slovak 365-day tax-free share analysis (FIFO)",
            "Multi-currency (EUR/USD) support",
            "CSV / IBKR import",
        ],
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
        },
    }


@router.get("/.well-known/webmcp")
async def webmcp_manifest() -> JSONResponse:
    """Serve the WebMCP tool manifest (CORS-open, cacheable)."""
    return JSONResponse(content=_build_manifest(), headers=_CACHE_HEADERS)


@router.get("/.well-known/agent.json")
async def agent_card() -> JSONResponse:
    """Serve the A2A AgentCard (CORS-open, cacheable)."""
    return JSONResponse(content=_build_agent_card(), headers=_CACHE_HEADERS)
