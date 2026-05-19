"""
Public price service facade over storage, provider orchestration, and history helpers.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf

from logic.prices.orchestrator import PriceOrchestrator
from logic.prices.shared import (
    get_cache_threshold_hours,
    get_effective_currency_for_ticker,
    get_file_fetch_metadata,
    get_market_state,
    logger,
    normalize_ticker,
)
from logic.prices.storage import CSVStorageManager, get_historical_file_status, list_historical_tickers


def finalize_daily_close(ticker: str) -> Optional[Tuple[date, float]]:
    """Fetch the latest completed daily close via yfinance and persist it.

    Writes to both the CSV history *and* the latest-price snapshot so
    every consumer sees the newest close without a separate sync step.

    Returns (close_date, close_price) on success, None on failure.
    """
    ticker = normalize_ticker(ticker)
    market_state = get_market_state(ticker)

    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="10d", interval="1d", auto_adjust=False)
    except Exception as exc:
        logger.warning(f"finalize_daily_close: yfinance fetch failed for {ticker}: {exc}")
        return None

    hist = hist.dropna(subset=["Close"])
    if hist.empty:
        return None

    rows = [(pd.Timestamp(idx).date(), float(row["Close"])) for idx, row in hist.iterrows()]
    if not rows:
        return None

    market_date = market_state["market_date"]
    if rows[-1][0] >= market_date and not market_state["is_after_close"] and len(rows) > 1:
        close_date, close_price = rows[-2]
    else:
        close_date, close_price = rows[-1]

    CSVStorageManager.save_price_to_csv(
        ticker, close_price, datetime.combine(close_date, time(0, 0), tzinfo=timezone.utc)
    )
    CSVStorageManager.save_latest_snapshot(
        ticker,
        close_price,
        updated_at=datetime.now(timezone.utc),
        source="daily_close",
        market_date=close_date.isoformat(),
    )
    logger.info(f"finalize_daily_close: {ticker} -> ${close_price:.2f} ({close_date.isoformat()})")
    return close_date, close_price


def _parse_snapshot_result(snapshot: Dict[str, object]) -> Dict[str, Any]:
    """Build a price result dict from a latest_prices.json snapshot entry."""
    updated_at_raw = snapshot.get("updated_at")
    updated_at = None
    if isinstance(updated_at_raw, str):
        try:
            updated_at = datetime.fromisoformat(updated_at_raw)
        except ValueError:
            updated_at = None

    if updated_at is None:
        updated_at = datetime.now(timezone.utc)
    elif updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)

    age_hours = (datetime.now(updated_at.tzinfo) - updated_at).total_seconds() / 3600
    market_date = snapshot.get("market_date") or updated_at.date().isoformat()

    return {
        "price": float(snapshot["price"]),
        "date": str(market_date),
        "age_hours": age_hours,
        "fetched_at": updated_at.isoformat(),
        "fetch_age_hours": age_hours,
        "source": snapshot.get("source", "snapshot"),
    }


def _build_csv_result(entry, csv_path: str) -> Dict[str, Any]:
    """Build a price result dict from a cached CSV series entry."""
    result: Dict[str, Any] = {
        "price": entry.latest_close,
        "date": entry.latest_date_str,
        "age_hours": (datetime.now(entry.latest_dt_utc.tzinfo) - entry.latest_dt_utc).total_seconds() / 3600,
        "source": "daily_close",
    }

    fetch_metadata = get_file_fetch_metadata(csv_path)
    if fetch_metadata is not None:
        fetched_at, fetch_age_hours = fetch_metadata
        result["fetched_at"] = fetched_at.isoformat()
        result["fetch_age_hours"] = fetch_age_hours

    return result


def get_latest_price(ticker: str) -> Optional[Dict[str, Any]]:
    """Get the latest price, preferring whichever of snapshot or CSV is newer.

    The cron job updates CSVs with daily closes and only writes snapshots
    during open market hours.  Previously the snapshot always won, which
    could serve a stale intraday price even when the CSV already had a
    more recent daily close.
    """
    try:
        normalized_ticker = normalize_ticker(ticker)

        snapshot = CSVStorageManager.load_latest_snapshot(normalized_ticker)
        entry = CSVStorageManager.load_cached_series(normalized_ticker)

        snap_result = _parse_snapshot_result(snapshot) if snapshot else None
        csv_result = (
            _build_csv_result(entry, CSVStorageManager.get_csv_path(normalized_ticker))
            if entry
            else None
        )

        if snap_result and csv_result:
            snap_date_str = str(snap_result["date"])[:10]
            csv_date_str = str(csv_result["date"])[:10]

            if csv_date_str > snap_date_str:
                return csv_result
            return snap_result

        return snap_result or csv_result
    except Exception as e:
        logger.debug(f"Could not load price for {ticker}: {e}")
        return None


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


def get_all_prices(
    tickers: Optional[List[str]] = None,
    ticker_currencies: Optional[Dict[str, str]] = None,
) -> Dict[str, Dict[str, Any]]:
    """Get all current prices from historical CSV files."""
    ticker_data: Dict[str, str] = {}
    if tickers is not None:
        for ticker in tickers:
            if not ticker:
                continue
            normalized_ticker = normalize_ticker(ticker)
            if ticker_currencies and normalized_ticker in ticker_currencies:
                ticker_data[normalized_ticker] = get_effective_currency_for_ticker(
                    normalized_ticker,
                    ticker_currencies[normalized_ticker],
                )
            else:
                ticker_data[normalized_ticker] = get_effective_currency_for_ticker(normalized_ticker)
    else:
        ticker_data = {ticker: get_effective_currency_for_ticker(ticker) for ticker in list_historical_tickers()}

    prices: Dict[str, Dict[str, Any]] = {}
    for ticker, currency in ticker_data.items():
        latest = get_latest_price(ticker)
        if latest:
            prices[ticker] = {
                "price": latest["price"],
                "currency": currency,
                "date": latest["date"],
                "age_hours": latest["age_hours"],
                "fetched_at": latest.get("fetched_at"),
                "fetch_age_hours": latest.get("fetch_age_hours"),
            }

    return prices


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
