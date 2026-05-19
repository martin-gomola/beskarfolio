"""
Shared types and utilities for the price subsystem.
"""
from __future__ import annotations

import logging
import os
import random
from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Dict, List, Optional, Protocol, Tuple

import pandas as pd
import yfinance as yf

from config import settings

logger = logging.getLogger(__name__)

# Suppress requests/urllib3 debug logging (can expose URLs with API keys)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("requests").setLevel(logging.WARNING)


def _mask_api_keys(text: str) -> str:
    """
    Mask API keys in error messages/URLs to prevent accidental log exposure.
    Replaces known API key patterns with ***MASKED***.
    """
    import re

    patterns = [
        (r"apikey=[^&\s]+", "apikey=***MASKED***"),
        (r"token=[^&\s]+", "token=***MASKED***"),
        (r"api_key=[^&\s]+", "api_key=***MASKED***"),
        (r"key=[^&\s]+", "key=***MASKED***"),
    ]
    result = text
    for pattern, replacement in patterns:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


try:
    yf.set_tz_cache_location(os.path.join(settings.DATA_DIR, ".yfinance_cache"))
    os.makedirs(os.path.join(settings.DATA_DIR, ".yfinance_cache"), exist_ok=True)
except Exception as e:
    logger.warning(f"Could not set yfinance cache location: {e}. Continuing without cache.")


class PriceProvider(Enum):
    """Supported price data providers."""

    FMP = "fmp"
    FINNHUB = "finnhub"
    TWELVE_DATA = "twelvedata"
    YFINANCE = "yfinance"


@dataclass(frozen=True)
class PriceData:
    """Standardized price data structure."""

    price: float
    date: datetime
    source: PriceProvider
    age_hours: Optional[float] = None


@dataclass(frozen=True)
class HistoricalSeriesCacheEntry:
    """Cached view of a ticker's historical CSV, keyed by file mtime."""

    mtime: float
    dates_only: List[date]
    closes: List[float]
    latest_dt_utc: datetime
    latest_date_str: str
    latest_close: float


class PriceProviderProtocol(Protocol):
    """Protocol for price provider implementations."""

    def fetch_current_price(self, ticker: str) -> Optional[float]:
        ...

    def fetch_historical_prices(
        self,
        ticker: str,
        start_date: date,
        end_date: date,
    ) -> Optional[pd.DataFrame]:
        ...


_historical_series_cache: Dict[str, HistoricalSeriesCacheEntry] = {}


def get_historical_series_cache() -> Dict[str, HistoricalSeriesCacheEntry]:
    """Expose the shared in-memory cache to storage helpers."""
    return _historical_series_cache


def get_cache_threshold_hours() -> float:
    """Get cache TTL from settings."""
    return float(getattr(settings, "PRICE_CACHE_HOURS", 4.0))


def get_request_delay() -> float:
    """Get random delay for rate limiting."""
    min_delay = float(getattr(settings, "PRICE_FETCH_DELAY_MIN", 0.5))
    max_delay = float(getattr(settings, "PRICE_FETCH_DELAY_MAX", 1.5))
    return random.uniform(min_delay, max_delay)


def detect_currency_from_ticker(ticker: str) -> str:
    """
    Best-effort currency detection from ticker suffix.
    EU exchanges (.DE, .PA) -> EUR, others -> USD.
    """
    ticker_upper = ticker.upper()
    return "EUR" if ticker_upper.endswith((".DE", ".PA")) else "USD"


def get_effective_currency_for_ticker(
    ticker: str,
    preferred_currency: Optional[str] = None,
) -> str:
    """
    Return the effective currency for a ticker using a narrow strong-EUR contract.
    """
    detected_currency = detect_currency_from_ticker(ticker)
    if detected_currency == "EUR":
        return "EUR"

    normalized_currency = (preferred_currency or "").strip().upper()
    return normalized_currency or detected_currency


def normalize_ticker(ticker: Optional[str]) -> str:
    """Normalize ticker: strip whitespace and uppercase."""
    return (ticker or "").strip().upper()


def get_file_fetch_metadata(csv_file: str) -> Optional[Tuple[datetime, float]]:
    """Return the file modification time and its age in hours."""
    if not os.path.exists(csv_file):
        return None

    try:
        fetched_at = datetime.fromtimestamp(os.path.getmtime(csv_file), tz=pd.Timestamp.now(tz="UTC").tzinfo)
    except OSError:
        return None

    fetch_age_hours = (datetime.now(fetched_at.tzinfo) - fetched_at).total_seconds() / 3600
    return fetched_at, fetch_age_hours


# ---------------------------------------------------------------------------
# Market rules -- single source of truth for trading-hours logic
# ---------------------------------------------------------------------------
from dataclasses import dataclass as _dataclass
from datetime import time as _time
from zoneinfo import ZoneInfo as _ZoneInfo


@_dataclass(frozen=True)
class MarketRule:
    label: str
    tz: _ZoneInfo
    open_time: _time
    close_time: _time


MARKET_RULES: Dict[str, MarketRule] = {
    ".DE": MarketRule("Xetra", _ZoneInfo("Europe/Berlin"), _time(9, 0), _time(17, 30)),
    ".PA": MarketRule("Euronext Paris", _ZoneInfo("Europe/Paris"), _time(9, 0), _time(17, 30)),
}
DEFAULT_MARKET_RULE = MarketRule("US", _ZoneInfo("America/New_York"), _time(9, 30), _time(16, 0))


def get_market_rule(ticker: str) -> MarketRule:
    """Return the matching market rule for a ticker suffix."""
    for suffix, rule in MARKET_RULES.items():
        if ticker.endswith(suffix):
            return rule
    return DEFAULT_MARKET_RULE


def get_market_state(ticker: str, now_utc: Optional[datetime] = None) -> Dict[str, object]:
    """Compute current market state for a ticker (open/closed/after-hours)."""
    rule = get_market_rule(ticker)
    now_utc = now_utc or datetime.now(tz=pd.Timestamp.now(tz="UTC").tzinfo)
    local_now = now_utc.astimezone(rule.tz)
    is_trading_day = local_now.weekday() < 5
    local_clock = local_now.time()

    return {
        "rule": rule,
        "local_now": local_now,
        "market_date": local_now.date(),
        "is_trading_day": is_trading_day,
        "is_open": is_trading_day and rule.open_time <= local_clock < rule.close_time,
        "is_after_close": is_trading_day and local_clock >= rule.close_time,
    }


def get_market_date_for_ticker(ticker: str) -> str:
    """Return today's market date (YYYY-MM-DD) in the ticker's local timezone."""
    return get_market_state(ticker)["market_date"].isoformat()
