"""
Historical price utilities and backfill coordination.
"""
from __future__ import annotations

from bisect import bisect_right
from datetime import date, datetime, timedelta
from queue import Empty, Queue
from threading import Thread
from typing import Dict, List, Optional

from logic.prices.orchestrator import PriceOrchestrator
from logic.prices.shared import logger, normalize_ticker, _mask_api_keys
from logic.prices.storage import CSVStorageManager

BACKGROUND_TASK_TIMEOUT = 120


def get_price_at_date(ticker: str, target_date: date) -> Optional[float]:
    """Get the latest available price on or before the target date."""
    try:
        entry = CSVStorageManager.load_cached_series(normalize_ticker(ticker))
        if not entry or not entry.dates_only:
            logger.warning(f"❌ No cached series for {ticker}")
            return None

        if isinstance(target_date, str):
            target_date = datetime.strptime(target_date, "%Y-%m-%d").date()

        index = bisect_right(entry.dates_only, target_date) - 1
        if index < 0:
            logger.warning(
                f"❌ No price found for {ticker} at {target_date} "
                f"(idx={index}, first_date={entry.dates_only[0] if entry.dates_only else 'empty'})"
            )
            return None

        price = float(entry.closes[index])
        logger.debug(f"✅ Price for {ticker} at {target_date}: {price} (matched date: {entry.dates_only[index]})")
        return price
    except Exception as e:
        logger.warning(f"❌ Error getting price for {ticker} at {target_date}: {e}")
        return None


def get_prices_at_date(tickers: List[str], target_date: date) -> Dict[str, float]:
    """Get prices for multiple tickers at a specific date."""
    return {
        ticker: price
        for ticker in tickers
        if (price := get_price_at_date(ticker, target_date)) is not None
    }


def fetch_historical_prices_for_ticker(
    ticker: str,
    start_date: date,
    end_date: Optional[date] = None,
) -> bool:
    """Fetch and store historical prices for a ticker."""
    if end_date is None:
        end_date = datetime.now().date()
    return PriceOrchestrator.fetch_historical_prices_with_fallback(ticker, start_date, end_date)


def get_required_dates_for_transactions(transactions: List[Dict]) -> Dict[str, List[date]]:
    """Calculate the minimum set of dates needed for performance calculations."""
    ticker_dates: Dict[str, set[date]] = {}
    if not transactions:
        return {}

    parsed_transactions = []
    for transaction in transactions:
        transaction_date = transaction["date"]
        if isinstance(transaction_date, str):
            transaction_date = datetime.strptime(transaction_date, "%Y-%m-%d").date()
        elif isinstance(transaction_date, datetime):
            transaction_date = transaction_date.date()
        parsed_transactions.append((transaction["ticker"], transaction_date))

    all_dates = [parsed_date for _, parsed_date in parsed_transactions]
    min_date = min(all_dates)
    today = datetime.now().date()

    year_boundaries = set()
    for year in range(min_date.year, today.year + 1):
        year_boundaries.add(date(year, 1, 1))
        year_boundaries.add(date(year, 12, 31))
    year_boundaries.add(today)

    for ticker, transaction_date in parsed_transactions:
        ticker_dates.setdefault(ticker, set()).add(transaction_date)

    for ticker in ticker_dates:
        ticker_dates[ticker].update(year_boundaries)

    return {ticker: sorted(required_dates) for ticker, required_dates in ticker_dates.items()}


def ensure_historical_prices(transactions: List[Dict]) -> Dict[str, List[str]]:
    """Ensure the required historical prices exist for the transaction set."""
    stats = {"fetched": [], "skipped": [], "errors": []}
    if not transactions:
        return stats

    ticker_required_dates = get_required_dates_for_transactions(transactions)
    if not ticker_required_dates:
        return stats

    logger.info(f"🔍 Checking historical prices for {len(ticker_required_dates)} ticker(s)")

    for ticker, required_dates in ticker_required_dates.items():
        earliest_date = required_dates[0]
        price = get_price_at_date(ticker, earliest_date)

        if price is None:
            start_date = earliest_date - timedelta(days=7)
            end_date = datetime.now().date()
            logger.info(f"⚠️  Missing data for {ticker} at {earliest_date}, fetching minimal range...")
            logger.debug(f"   Required dates: {len(required_dates)} dates from {earliest_date} to {required_dates[-1]}")
            if fetch_historical_prices_for_ticker(ticker, start_date, end_date):
                stats["fetched"].append(ticker)
            else:
                stats["errors"].append(f"{ticker}: Failed to fetch")
            continue

        missing_dates = [required_date for required_date in required_dates if get_price_at_date(ticker, required_date) is None]
        if missing_dates:
            first_missing = missing_dates[0]
            start_date = first_missing - timedelta(days=7)
            end_date = datetime.now().date()
            logger.info(f"⚠️  Missing {len(missing_dates)} dates for {ticker}, fetching from {first_missing}...")
            if fetch_historical_prices_for_ticker(ticker, start_date, end_date):
                stats["fetched"].append(ticker)
            else:
                stats["errors"].append(f"{ticker}: Failed to fetch")
            continue

        stats["skipped"].append(ticker)
        logger.debug(f"✓ {ticker} has all {len(required_dates)} required dates")

    if stats["fetched"]:
        logger.info(f"✅ Fetched historical data for: {', '.join(stats['fetched'])}")

    return stats


def ensure_historical_prices_with_timeout(
    transactions: List[Dict],
    timeout: int = BACKGROUND_TASK_TIMEOUT,
) -> Dict[str, List[str]]:
    """Return promptly when the historical backfill worker exceeds the timeout."""
    result_queue: Queue[Dict | Exception] = Queue(maxsize=1)

    def run_fetch() -> None:
        try:
            result_queue.put(ensure_historical_prices(transactions))
        except Exception as exc:
            result_queue.put(exc)

    worker = Thread(target=run_fetch, name="historical-price-fetch", daemon=True)
    worker.start()
    worker.join(timeout)

    if worker.is_alive():
        logger.warning(
            f"⏱️ Background task timed out after {timeout}s - returning without waiting for the fetch worker"
        )
        return {
            "fetched": [],
            "skipped": [],
            "errors": [f"Task timed out after {timeout} seconds"],
        }

    try:
        result = result_queue.get_nowait()
    except Empty:
        logger.error("❌ Background task finished without returning a result")
        return {
            "fetched": [],
            "skipped": [],
            "errors": ["Task finished without returning a result"],
        }

    if isinstance(result, Exception):
        logger.error(f"❌ Background task failed: {_mask_api_keys(str(result))}")
        return {
            "fetched": [],
            "skipped": [],
            "errors": [str(result)],
        }

    return result
