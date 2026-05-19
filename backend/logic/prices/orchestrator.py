"""
Provider orchestration for current and historical price fetching.
"""
from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional, Tuple

import requests

from logic.prices.providers import FMPProvider, FinnhubProvider, TwelveDataProvider, YFinanceProvider
from logic.prices.shared import PriceProvider, logger, normalize_ticker
from logic.prices.storage import CSVStorageManager


class PriceOrchestrator:
    """Coordinate provider fallback for current and historical data.

    Fallback chain (current prices):
        Twelve Data → FMP (batch) → Finnhub → yfinance

    Fallback chain (historical):
        Twelve Data → FMP → yfinance
    """

    @staticmethod
    def fetch_current_price_with_fallback(ticker: str) -> Tuple[Optional[float], str]:
        ticker = normalize_ticker(ticker)

        if TwelveDataProvider.is_enabled():
            price = TwelveDataProvider.fetch_current_price(ticker)
            if price:
                return price, PriceProvider.TWELVE_DATA.value

        if FMPProvider.is_enabled():
            price = FMPProvider.fetch_current_price(ticker)
            if price:
                return price, PriceProvider.FMP.value

        if FinnhubProvider.is_enabled():
            price = FinnhubProvider.fetch_current_price(ticker)
            if price:
                return price, PriceProvider.FINNHUB.value

        price = YFinanceProvider.fetch_current_price(ticker)
        if price:
            return price, PriceProvider.YFINANCE.value

        return None, "unavailable"

    @staticmethod
    def fetch_current_prices_batch_with_fallback(
        tickers: List[str],
        session: Optional[requests.Session] = None,
    ) -> Dict[str, Optional[float]]:
        normalized_tickers = [normalize_ticker(ticker) for ticker in tickers if ticker]
        results = {ticker: None for ticker in normalized_tickers}
        if not normalized_tickers:
            return results

        if TwelveDataProvider.is_enabled():
            results.update(TwelveDataProvider.fetch_current_prices_batch(normalized_tickers))
            failed = [t for t, p in results.items() if p is None]
        else:
            failed = normalized_tickers

        if failed and FMPProvider.is_enabled():
            logger.info(f"Trying FMP batch for {len(failed)} failed ticker(s)")
            for ticker, price in FMPProvider.fetch_current_prices_batch(failed).items():
                if price:
                    results[ticker] = price
            failed = [t for t, p in results.items() if p is None]

        if failed and FinnhubProvider.is_enabled():
            logger.info(f"Trying Finnhub for {len(failed)} failed ticker(s)")
            for ticker, price in FinnhubProvider.fetch_current_prices_batch(failed).items():
                if price:
                    results[ticker] = price
            failed = [t for t, p in results.items() if p is None]

        if failed:
            logger.info(f"Trying yfinance for {len(failed)} failed ticker(s)")
            for ticker, price in YFinanceProvider.fetch_current_prices_batch(failed, session).items():
                if price:
                    results[ticker] = price

        return results

    @staticmethod
    def fetch_historical_prices_with_fallback(
        ticker: str,
        start_date: date,
        end_date: date,
    ) -> bool:
        ticker = normalize_ticker(ticker)
        logger.info(f"📥 Fetching historical prices for {ticker} from {start_date} to {end_date}")

        if TwelveDataProvider.is_enabled():
            df = TwelveDataProvider.fetch_historical_prices(ticker, start_date, end_date)
            if df is not None and not df.empty:
                CSVStorageManager.save_historical_dataframe(ticker, df)
                logger.info(f"✅ Fetched {len(df)} prices from Twelve Data [historical]")
                return True

        if FMPProvider.is_enabled():
            df = FMPProvider.fetch_historical_prices(ticker, start_date, end_date)
            if df is not None and not df.empty:
                CSVStorageManager.save_historical_dataframe(ticker, df)
                logger.info(f"✅ Fetched {len(df)} prices from FMP [historical]")
                return True

        logger.info(f"FMP/TwelveData unavailable or failed, trying yfinance for {ticker}")
        df = YFinanceProvider.fetch_historical_prices(ticker, start_date, end_date)
        if df is not None and not df.empty:
            CSVStorageManager.save_historical_dataframe(ticker, df)
            logger.info(f"✅ Fetched {len(df)} prices from yfinance [historical]")
            return True

        logger.warning(f"❌ Failed to fetch historical data for {ticker}")
        return False
