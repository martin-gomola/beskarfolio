"""
Public price service facade over storage, provider orchestration, and history helpers.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import yfinance as yf

from logic.prices.orchestrator import PriceOrchestrator
from logic.prices.shared import (
    get_cache_threshold_hours,
    logger,
)
from logic.prices.read_model import get_latest_price
from logic.prices.storage import CSVStorageManager, get_historical_file_status


def get_price_with_cache(
    ticker: str,
    currency: str,
    force_refresh: bool = False,
) -> Tuple[Optional[float], str]:
    """
    Get a price with smart caching and provider fallback.

    The `currency` parameter is preserved for compatibility with existing call sites.
    """
    _ = currency
    latest = get_latest_price(ticker)
    cache_threshold = get_cache_threshold_hours()
    cache_age_hours = latest.get("fetch_age_hours", latest["age_hours"]) if latest else None
    if not force_refresh and latest and cache_age_hours is not None and cache_age_hours < cache_threshold:
        logger.info(f"Using cached price for {ticker} (fetch age: {cache_age_hours:.1f}h)")
        return latest["price"], "recent"

    price, source = PriceOrchestrator.fetch_current_price_with_fallback(ticker)
    if price:
        CSVStorageManager.save_latest_snapshot(ticker, price, source=source)
        return price, source

    if latest:
        logger.warning(f"Using stale price for {ticker} (age: {latest['age_hours']:.1f}h)")
        return latest["price"], "stale"

    return None, "unavailable"


def update_all_prices(force_refresh: bool = False) -> Dict[str, Any]:
    """Deprecated compatibility helper for localStorage-only mode."""
    _ = force_refresh
    return {
        "success": False,
        "message": "update_all_prices() deprecated in localStorage-only architecture. Provide tickers explicitly.",
        "updated_count": 0,
        "cached_count": 0,
        "errors": ["Database removed - provide tickers in request"],
    }


def get_historical_file_status_for_ticker(ticker: str) -> Dict[str, Any]:
    """Compatibility wrapper returning historical CSV status for one ticker."""
    return get_historical_file_status(ticker, get_latest_price)


def validate_ticker(ticker: str) -> Dict[str, Any]:
    """Validate a ticker using a lightweight yfinance query."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")
        if hist.empty:
            return {
                "valid": False,
                "ticker": ticker,
                "error": f'Ticker "{ticker}" not found. Formats: AAPL (US), TSLA.DE (Germany), AIR.PA (France)',
            }

        currency = get_effective_currency_for_ticker(ticker)
        try:
            fast_info = stock.fast_info
            currency = fast_info.get("currency", currency)
        except (AttributeError, KeyError, TypeError, RuntimeError):
            pass

        return {
            "valid": True,
            "ticker": ticker.upper(),
            "name": ticker,
            "currency": currency,
            "exchange": "Unknown",
        }
    except Exception as e:
        error_message = str(e).lower()
        if "404" in error_message or "not found" in error_message:
            return {
                "valid": False,
                "ticker": ticker,
                "error": f'Ticker "{ticker}" not found. Formats: AAPL (US), TSLA.DE (Germany), AIR.PA (France)',
            }
        if "429" in error_message or "rate limit" in error_message:
            return {
                "valid": False,
                "ticker": ticker,
                "error": "Rate limited. Try again in a moment.",
            }
        return {
            "valid": False,
            "ticker": ticker,
            "error": f"Could not validate: {str(e)}",
        }
