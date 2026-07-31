"""One deep module for refreshing daily closes and intraday price snapshots."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Callable, Dict, Iterable, List, Optional, Protocol, Tuple

import pandas as pd
import yfinance as yf

from logic.prices.orchestrator import PriceOrchestrator
from logic.prices.shared import (
    get_cache_threshold_hours,
    get_market_state,
    logger,
    normalize_ticker,
)
from logic.prices.storage import CSVStorageManager


class PriceRefreshMode(str, Enum):
    """Operational intent understood by the refresh module."""

    MANUAL = "manual"
    SCHEDULED = "scheduled"
    SNAPSHOTS = "snapshots"
    CLOSES = "closes"


class PriceStorage(Protocol):
    """Persistence seam used by the refresh implementation and its tests."""

    def save_price_to_csv(
        self, ticker: str, price: float, price_date: datetime
    ) -> None: ...

    def save_latest_snapshot(
        self,
        ticker: str,
        price: float,
        updated_at: Optional[datetime] = None,
        source: str = "snapshot",
        market_date: Optional[str] = None,
    ) -> None: ...

    def save_latest_snapshot_if_not_newer(
        self,
        ticker: str,
        price: float,
        *,
        updated_at: Optional[datetime] = None,
        source: str = "snapshot",
        market_date: str,
        replace_same_market_date: bool = False,
    ) -> bool: ...


LatestPriceLoader = Callable[[str], Optional[Dict[str, object]]]
CurrentPricesFetcher = Callable[[List[str]], Dict[str, Optional[float]]]
DailyCloseFetcher = Callable[[str, Dict[str, object]], Optional[Tuple[date, float]]]
MarketStateLoader = Callable[[str], Dict[str, object]]


@dataclass
class TickerRefreshResult:
    ticker: str
    snapshot_status: str = "not_requested"
    close_finalized: bool = False
    price: Optional[float] = None
    age_hours: Optional[float] = None
    source: Optional[str] = None
    error: Optional[str] = None

    def to_http_item(self) -> Dict[str, object]:
        item: Dict[str, object] = {
            "ticker": self.ticker,
            "status": self.snapshot_status,
        }
        if self.price is not None:
            item["price"] = self.price
        if self.age_hours is not None:
            item["age_hours"] = round(self.age_hours, 1)
        if self.source is not None:
            item["source"] = self.source
        if self.error is not None:
            item["error"] = self.error
        return item


@dataclass
class PriceRefreshReport:
    results: List[TickerRefreshResult]

    @property
    def updated_count(self) -> int:
        return sum(result.snapshot_status == "updated" for result in self.results)

    @property
    def cached_count(self) -> int:
        return sum(result.snapshot_status == "cached" for result in self.results)

    @property
    def failed_results(self) -> List[TickerRefreshResult]:
        return [
            result
            for result in self.results
            if result.snapshot_status in {"stale", "failed"}
        ]

    @property
    def closes_finalized(self) -> int:
        return sum(result.close_finalized for result in self.results)

    def to_http_response(self) -> Dict[str, object]:
        total = len(self.results)
        failed_tickers = [result.ticker for result in self.failed_results]
        return {
            "success": True,
            "total_tickers": total,
            "updated_count": self.updated_count,
            "cached_count": self.cached_count,
            "failed_count": len(failed_tickers),
            "failed_tickers": failed_tickers or None,
            "ticker_results": [result.to_http_item() for result in self.results],
            "closes_finalized": self.closes_finalized,
            "message": (
                f"Updated {self.updated_count}/{total} ticker(s), "
                f"{self.cached_count} cached, "
                f"{self.closes_finalized} daily closes finalized"
            ),
        }


def _load_latest_price(ticker: str) -> Optional[Dict[str, object]]:
    # Local import keeps the read model independent from the refresh implementation.
    from logic.prices.service import get_latest_price

    return get_latest_price(ticker)


def _fetch_latest_completed_close(
    ticker: str,
    market_state: Dict[str, object],
) -> Optional[Tuple[date, float]]:
    """Fetch the most recent completed daily close from yfinance."""
    try:
        stock = yf.Ticker(ticker)
        history = stock.history(period="10d", interval="1d", auto_adjust=False)
    except Exception as exc:
        logger.warning(f"Daily close fetch failed for {ticker}: {exc}")
        return None

    history = history.dropna(subset=["Close"])
    if history.empty:
        return None

    rows = [
        (pd.Timestamp(index).date(), float(row["Close"]))
        for index, row in history.iterrows()
    ]
    if not rows:
        return None

    market_date = market_state["market_date"]
    if (
        rows[-1][0] >= market_date
        and not market_state["is_after_close"]
        and len(rows) > 1
    ):
        return rows[-2]
    return rows[-1]


def _fetch_age_hours(latest: Optional[Dict[str, object]]) -> Optional[float]:
    if not latest:
        return None

    value = latest.get("fetch_age_hours", latest.get("age_hours"))
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


class PriceRefresh:
    """Refresh cached prices through one interface shared by HTTP and cron."""

    def __init__(
        self,
        *,
        latest_price_loader: Optional[LatestPriceLoader] = None,
        current_prices_fetcher: Optional[CurrentPricesFetcher] = None,
        daily_close_fetcher: Optional[DailyCloseFetcher] = None,
        market_state_loader: Optional[MarketStateLoader] = None,
        storage: PriceStorage = CSVStorageManager,
        now: Optional[Callable[[], datetime]] = None,
        cache_threshold_hours: Optional[float] = None,
    ) -> None:
        self._latest_price_loader = latest_price_loader or _load_latest_price
        self._current_prices_fetcher = (
            current_prices_fetcher
            or PriceOrchestrator.fetch_current_prices_batch_with_fallback
        )
        self._daily_close_fetcher = daily_close_fetcher or _fetch_latest_completed_close
        self._market_state_loader = market_state_loader or get_market_state
        self._storage = storage
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._cache_threshold_hours = (
            cache_threshold_hours
            if cache_threshold_hours is not None
            else get_cache_threshold_hours()
        )

    def run(
        self,
        tickers: Iterable[str],
        *,
        mode: PriceRefreshMode = PriceRefreshMode.MANUAL,
        force_refresh: bool = False,
    ) -> PriceRefreshReport:
        normalized_tickers = sorted(
            {
                normalized
                for ticker in tickers
                if (normalized := normalize_ticker(ticker))
            }
        )
        states = {
            ticker: self._market_state_loader(ticker) for ticker in normalized_tickers
        }
        initial_prices = {
            ticker: self._latest_price_loader(ticker) for ticker in normalized_tickers
        }
        results = {
            ticker: TickerRefreshResult(ticker=ticker) for ticker in normalized_tickers
        }

        tickers_to_fetch = self._select_snapshot_tickers(
            normalized_tickers,
            states,
            initial_prices,
            results,
            mode=mode,
            force_refresh=force_refresh,
        )

        if mode in {
            PriceRefreshMode.MANUAL,
            PriceRefreshMode.SCHEDULED,
            PriceRefreshMode.CLOSES,
        }:
            self._finalize_daily_closes(
                normalized_tickers,
                states,
                results,
            )

        if tickers_to_fetch:
            snapshot_source = "api" if mode == PriceRefreshMode.MANUAL else mode.value
            self._refresh_snapshots(
                tickers_to_fetch,
                states,
                initial_prices,
                results,
                source=snapshot_source,
            )

        return PriceRefreshReport(
            results=[results[ticker] for ticker in normalized_tickers]
        )

    def _select_snapshot_tickers(
        self,
        tickers: List[str],
        states: Dict[str, Dict[str, object]],
        initial_prices: Dict[str, Optional[Dict[str, object]]],
        results: Dict[str, TickerRefreshResult],
        *,
        mode: PriceRefreshMode,
        force_refresh: bool,
    ) -> List[str]:
        if mode == PriceRefreshMode.CLOSES:
            return []

        selected = []
        for ticker in tickers:
            result = results[ticker]
            latest = initial_prices[ticker]

            if mode in {PriceRefreshMode.SCHEDULED, PriceRefreshMode.SNAPSHOTS}:
                if not states[ticker]["is_open"]:
                    result.snapshot_status = "skipped_closed"
                    continue
                selected.append(ticker)
                continue

            fetch_age_hours = _fetch_age_hours(latest)
            if (
                not force_refresh
                and latest is not None
                and fetch_age_hours is not None
                and fetch_age_hours < self._cache_threshold_hours
            ):
                result.snapshot_status = "cached"
                result.price = float(latest["price"])
                result.age_hours = fetch_age_hours
                result.source = "cache"
                continue

            selected.append(ticker)

        return selected

    def _finalize_daily_closes(
        self,
        tickers: List[str],
        states: Dict[str, Dict[str, object]],
        results: Dict[str, TickerRefreshResult],
    ) -> None:
        for ticker in tickers:
            close = self._daily_close_fetcher(ticker, states[ticker])
            if close is None:
                continue

            close_date, close_price = close
            self._storage.save_price_to_csv(
                ticker,
                close_price,
                datetime.combine(close_date, time(0, 0), tzinfo=timezone.utc),
            )
            results[ticker].close_finalized = True

            state = states[ticker]
            self._storage.save_latest_snapshot_if_not_newer(
                ticker,
                close_price,
                updated_at=self._now(),
                source="daily_close",
                market_date=close_date.isoformat(),
                replace_same_market_date=bool(
                    state["is_after_close"]
                    or not state["is_trading_day"]
                    or not state["is_open"]
                ),
            )

    def _refresh_snapshots(
        self,
        tickers: List[str],
        states: Dict[str, Dict[str, object]],
        initial_prices: Dict[str, Optional[Dict[str, object]]],
        results: Dict[str, TickerRefreshResult],
        *,
        source: str,
    ) -> None:
        fetched_prices = self._current_prices_fetcher(tickers)

        for ticker in tickers:
            price = fetched_prices.get(ticker)
            result = results[ticker]

            if price is not None:
                self._storage.save_latest_snapshot(
                    ticker,
                    price,
                    updated_at=self._now(),
                    source=source,
                    market_date=states[ticker]["market_date"].isoformat(),
                )
                result.snapshot_status = "updated"
                result.price = float(price)
                result.source = "api_snapshot" if source == "api" else source
                continue

            latest = self._latest_price_loader(ticker) or initial_prices[ticker]
            if latest:
                result.snapshot_status = "stale"
                result.price = float(latest["price"])
                result.age_hours = _fetch_age_hours(latest)
                result.error = "API failed, using stale cache"
            else:
                result.snapshot_status = "failed"
                result.error = "No price available"


def refresh_prices(
    tickers: Iterable[str],
    *,
    mode: PriceRefreshMode = PriceRefreshMode.MANUAL,
    force_refresh: bool = False,
) -> PriceRefreshReport:
    """Refresh prices using the production adapters."""
    return PriceRefresh().run(
        tickers,
        mode=mode,
        force_refresh=force_refresh,
    )
