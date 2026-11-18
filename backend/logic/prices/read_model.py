"""
Read model for price data exposed to callers.

This module owns read-only price semantics: latest price projection, historical
range projection, 52-week range projection, and freshness status. Provider
fetching and persistence stay in the existing writer modules.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from config import settings
from logic.prices.shared import (
    get_effective_currency_for_ticker,
    get_file_fetch_metadata,
    logger,
    normalize_ticker,
)
from logic.prices.storage import CSVStorageManager, list_historical_tickers


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


def get_all_latest_prices() -> Dict[str, Dict[str, Any]]:
    """
    Project all latest cached prices into the minimal frontend payload.

    Source precedence is delegated to get_latest_price(), so snapshot-vs-CSV
    rules stay consistent across callers.
    """
    result: Dict[str, Dict[str, Any]] = {}

    for ticker in list_historical_tickers():
        latest = get_latest_price(ticker)
        if latest:
            result[ticker] = {
                "price": latest["price"],
                "date": latest["date"],
                "currency": get_effective_currency_for_ticker(ticker),
            }

    return result


def get_price_range(
    ticker: str,
    from_date: str,
    to_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Project cached historical closes for one ticker and date window."""
    entry = CSVStorageManager.load_cached_series(normalize_ticker(ticker))
    if not entry:
        raise FileNotFoundError(f"No price data for {normalize_ticker(ticker)}")

    from_dt = datetime.strptime(from_date, "%Y-%m-%d").date()
    to_dt = datetime.strptime(to_date, "%Y-%m-%d").date() if to_date else date.today()

    return [
        {"date": price_date.isoformat(), "close": entry.closes[index]}
        for index, price_date in enumerate(entry.dates_only)
        if from_dt <= price_date <= to_dt
    ]


def get_52week_ranges() -> Dict[str, Dict[str, Any]]:
    """
    Project 52-week high/low for every ticker with cached history.

    The window is relative to each ticker's latest close date, so partial
    histories still return useful data.
    """
    result: Dict[str, Dict[str, Any]] = {}

    for ticker in list_historical_tickers():
        entry = CSVStorageManager.load_cached_series(ticker)
        if not entry or not entry.dates_only or not entry.closes:
            continue

        as_of = entry.dates_only[-1]
        window_start = as_of - timedelta(days=365)
        window_closes = [
            close
            for price_date, close in zip(entry.dates_only, entry.closes)
            if window_start <= price_date <= as_of and close is not None
        ]
        if not window_closes:
            continue

        result[ticker] = {
            "high": float(max(window_closes)),
            "low": float(min(window_closes)),
            "as_of": as_of.isoformat(),
            "currency": get_effective_currency_for_ticker(ticker),
        }

    return result


def _latest_file_update(ticker: str) -> Optional[datetime]:
    csv_path = settings.get_historical_price_path(ticker)
    if not os.path.exists(csv_path):
        return None

    return datetime.fromtimestamp(os.path.getmtime(csv_path), tz=timezone.utc)


def _parse_fetched_at(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    try:
        fetched_at = datetime.fromisoformat(value)
    except ValueError:
        return None

    if fetched_at.tzinfo is None:
        return fetched_at.replace(tzinfo=timezone.utc)
    return fetched_at


def _status_for_fetch_age(fetch_age_hours: float) -> str:
    if fetch_age_hours < settings.PRICE_CACHE_HOURS:
        return "cached"
    if fetch_age_hours < 24:
        return "recent"
    return "stale"


def get_price_status(
    details: bool = False,
    prices: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Project price freshness status from the same price map used by callers.

    The optional prices argument keeps the interface testable and preserves
    existing route-level patching seams while moving status semantics here.
    """
    price_map = prices if prices is not None else get_all_prices()

    if not price_map:
        return {
            "has_prices": False,
            "last_update": None,
            "prices_count": 0,
            "status_counts": {"cached": 0, "recent": 0, "stale": 0},
        }

    status_counts = {"cached": 0, "recent": 0, "stale": 0}
    most_recent_update: Optional[datetime] = None
    ticker_details = [] if details else None

    for ticker, data in price_map.items():
        fetch_age_hours = data.get("fetch_age_hours")
        if fetch_age_hours is None:
            fetch_age_hours = data["age_hours"]

        fetched_at = _parse_fetched_at(data.get("fetched_at"))
        if fetched_at is None:
            fetched_at = _latest_file_update(ticker)

        if fetched_at is not None and (most_recent_update is None or fetched_at > most_recent_update):
            most_recent_update = fetched_at

        status = _status_for_fetch_age(fetch_age_hours)
        status_counts[status] += 1

        if ticker_details is not None:
            ticker_details.append({
                "ticker": ticker,
                "price": data["price"],
                "currency": data["currency"],
                "updated_at": data.get("fetched_at") or data["date"],
                "age_hours": round(fetch_age_hours, 1),
                "price_date": data["date"],
                "status": status,
            })

    response: Dict[str, Any] = {
        "has_prices": True,
        "last_update": most_recent_update.isoformat() if most_recent_update else None,
        "prices_count": len(price_map),
        "status_counts": status_counts,
    }

    if ticker_details is not None:
        response["prices"] = ticker_details

    return response
