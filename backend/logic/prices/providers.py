"""
External provider clients for current and historical price data.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

import pandas as pd
import requests
import yfinance as yf
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import settings
from logic.prices.shared import (
    get_request_delay,
    logger,
    _mask_api_keys,
)


class FMPProvider:
    """Financial Modeling Prep API provider."""

    @staticmethod
    def is_enabled() -> bool:
        provider = (getattr(settings, "PRICE_PROVIDER", "auto") or "auto").lower()
        api_key = getattr(settings, "FMP_API_KEY", "")
        if provider in {"finnhub", "yahoo"}:
            return False
        return bool(api_key)

    @staticmethod
    def fetch_current_price(ticker: str) -> Optional[float]:
        api_key = getattr(settings, "FMP_API_KEY", "")
        if not api_key:
            return None

        try:
            base_url = getattr(settings, "FMP_BASE_URL", "https://financialmodelingprep.com/stable")
            response = requests.get(
                f"{base_url}/quote",
                params={"symbol": ticker, "apikey": api_key},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            if isinstance(data, list) and data:
                price = data[0].get("price")
                if price:
                    logger.info(f"✓ {ticker}: ${float(price):.2f} (FMP)")
                    return float(price)

            logger.warning(f"✗ {ticker}: No data from FMP")
            return None
        except Exception as e:
            logger.warning(f"✗ {ticker}: FMP fetch failed - {_mask_api_keys(str(e))}")
            return None

    @staticmethod
    def fetch_current_prices_batch(tickers: List[str]) -> Dict[str, Optional[float]]:
        """Fetch multiple tickers in a single API call via batch-quote-short."""
        results = {ticker: None for ticker in tickers}
        if not FMPProvider.is_enabled() or not tickers:
            return results

        api_key = getattr(settings, "FMP_API_KEY", "")
        base_url = getattr(settings, "FMP_BASE_URL", "https://financialmodelingprep.com/stable")

        try:
            symbols = ",".join(tickers)
            logger.info(f"📊 FMP batch request for {len(tickers)} ticker(s)")
            response = requests.get(
                f"{base_url}/batch-quote-short",
                params={"symbols": symbols, "apikey": api_key},
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

            if isinstance(data, list):
                for item in data:
                    symbol = (item.get("symbol") or "").upper()
                    price = item.get("price")
                    if symbol in results and price:
                        results[symbol] = float(price)

            successful = sum(1 for v in results.values() if v)
            logger.info(f"📊 FMP batch result: {successful} / {len(tickers)} successful")
        except Exception as e:
            logger.warning(f"FMP batch fetch failed: {_mask_api_keys(str(e))}")
            for ticker in tickers:
                if results[ticker] is None:
                    price = FMPProvider.fetch_current_price(ticker)
                    if price:
                        results[ticker] = price
                    time.sleep(get_request_delay())

        return results

    @staticmethod
    def fetch_historical_prices(ticker: str, start_date: date, end_date: date) -> Optional[pd.DataFrame]:
        api_key = getattr(settings, "FMP_API_KEY", "")
        if not api_key:
            return None

        try:
            base_url = getattr(settings, "FMP_BASE_URL", "https://financialmodelingprep.com/stable")
            response = requests.get(
                f"{base_url.rstrip('/')}/historical-price-eod/full",
                params={
                    "symbol": ticker,
                    "from": start_date.strftime("%Y-%m-%d"),
                    "to": end_date.strftime("%Y-%m-%d"),
                    "apikey": api_key,
                },
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json() or {}
            historical = payload if isinstance(payload, list) else payload.get("historical", [])
            if not historical:
                return None

            rows = []
            for item in historical:
                close = item.get("adjClose") or item.get("close")
                if item.get("date") and close:
                    rows.append(
                        {
                            "Date": pd.to_datetime(item["date"], utc=True),
                            "Open": float(close),
                            "High": float(close),
                            "Low": float(close),
                            "Close": float(close),
                            "Volume": int(item.get("volume", 0) or 0),
                            "Dividends": 0.0,
                            "Stock Splits": 0.0,
                        }
                    )

            if not rows:
                return None

            return pd.DataFrame(rows).sort_values("Date")
        except Exception as e:
            logger.warning(f"FMP historical fetch failed for {ticker}: {_mask_api_keys(str(e))}")
            return None


class FinnhubProvider:
    """Finnhub API provider (60 calls/minute free tier)."""

    TICKER_MAP = {
        "VWCE.DE": "VWCE.F",
        "SXRV.DE": "SXRV.F",
        "SXR8.DE": "SXR8.F",
        "MC.PA": "MC.PA",
    }

    @staticmethod
    def is_enabled() -> bool:
        provider = (getattr(settings, "PRICE_PROVIDER", "auto") or "auto").lower()
        api_key = getattr(settings, "FINNHUB_API_KEY", "")
        if provider == "finnhub":
            return bool(api_key)
        if provider in {"fmp", "yahoo"}:
            return False
        return bool(api_key)

    @staticmethod
    def _translate_ticker(ticker: str) -> str:
        return FinnhubProvider.TICKER_MAP.get(ticker, ticker)

    @staticmethod
    def fetch_current_price(ticker: str) -> Optional[float]:
        api_key = getattr(settings, "FINNHUB_API_KEY", "")
        if not api_key:
            return None

        try:
            finnhub_ticker = FinnhubProvider._translate_ticker(ticker)
            base_url = getattr(settings, "FINNHUB_BASE_URL", "https://finnhub.io/api/v1")
            response = requests.get(
                f"{base_url}/quote",
                params={"symbol": finnhub_ticker, "token": api_key},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            price = data.get("c")
            if price and price > 0:
                logger.info(f"✓ {ticker}: ${float(price):.2f} (Finnhub)")
                return float(price)

            logger.warning(f"✗ {ticker}: No valid price from Finnhub")
            return None
        except Exception as e:
            logger.warning(f"✗ {ticker}: Finnhub fetch failed - {_mask_api_keys(str(e))}")
            return None

    @staticmethod
    def fetch_current_prices_batch(tickers: List[str]) -> Dict[str, Optional[float]]:
        results = {ticker: None for ticker in tickers}
        if not FinnhubProvider.is_enabled() or not tickers:
            return results

        logger.info(f"📊 Fetching {len(tickers)} ticker(s) from Finnhub")
        for index, ticker in enumerate(tickers):
            if index > 0:
                time.sleep(get_request_delay())
            price = FinnhubProvider.fetch_current_price(ticker)
            if price:
                results[ticker] = price

        successful = sum(1 for value in results.values() if value)
        logger.info(f"📊 Finnhub result: {successful} / {len(tickers)} successful")
        return results


class TwelveDataProvider:
    """Twelve Data API provider (800 calls/day free tier, good EU coverage)."""

    @staticmethod
    def is_enabled() -> bool:
        provider = (getattr(settings, "PRICE_PROVIDER", "auto") or "auto").lower()
        api_key = getattr(settings, "TWELVE_DATA_API_KEY", "")
        if provider in {"fmp", "finnhub", "yahoo"}:
            return False
        return bool(api_key)

    @staticmethod
    def fetch_current_price(ticker: str) -> Optional[float]:
        api_key = getattr(settings, "TWELVE_DATA_API_KEY", "")
        if not api_key:
            return None

        try:
            response = requests.get(
                "https://api.twelvedata.com/price",
                params={"symbol": ticker, "apikey": api_key},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            if "price" in data:
                price = float(data["price"])
                if price > 0:
                    logger.info(f"✓ {ticker}: ${price:.2f} (Twelve Data)")
                    return price

            logger.warning(f"✗ {ticker}: No data from Twelve Data")
            return None
        except Exception as e:
            logger.warning(f"✗ {ticker}: Twelve Data fetch failed - {_mask_api_keys(str(e))}")
            return None

    @staticmethod
    def fetch_current_prices_batch(tickers: List[str]) -> Dict[str, Optional[float]]:
        """Fetch multiple tickers via comma-separated symbol param."""
        results = {ticker: None for ticker in tickers}
        api_key = getattr(settings, "TWELVE_DATA_API_KEY", "")
        if not api_key or not tickers:
            return results

        try:
            symbols = ",".join(tickers)
            logger.info(f"📊 Twelve Data batch request for {len(tickers)} ticker(s)")
            response = requests.get(
                "https://api.twelvedata.com/price",
                params={"symbol": symbols, "apikey": api_key},
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

            if len(tickers) == 1:
                if "price" in data:
                    price = float(data["price"])
                    if price > 0:
                        results[tickers[0]] = price
            else:
                for ticker in tickers:
                    ticker_data = data.get(ticker, {})
                    if isinstance(ticker_data, dict) and "price" in ticker_data:
                        price = float(ticker_data["price"])
                        if price > 0:
                            results[ticker] = price

            successful = sum(1 for v in results.values() if v)
            logger.info(f"📊 Twelve Data batch result: {successful} / {len(tickers)} successful")
        except Exception as e:
            logger.warning(f"Twelve Data batch fetch failed: {_mask_api_keys(str(e))}")

        return results

    @staticmethod
    def fetch_historical_prices(ticker: str, start_date: date, end_date: date) -> Optional[pd.DataFrame]:
        api_key = getattr(settings, "TWELVE_DATA_API_KEY", "")
        if not api_key:
            return None

        try:
            days_diff = (end_date - start_date).days + 1
            response = requests.get(
                "https://api.twelvedata.com/time_series",
                params={
                    "symbol": ticker,
                    "interval": "1day",
                    "start_date": start_date.strftime("%Y-%m-%d"),
                    "end_date": end_date.strftime("%Y-%m-%d"),
                    "outputsize": min(days_diff, 5000),
                    "apikey": api_key,
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            values = data.get("values", [])
            if not values:
                return None

            rows = []
            for item in values:
                close = item.get("close")
                if item.get("datetime") and close:
                    rows.append(
                        {
                            "Date": pd.to_datetime(item["datetime"], utc=True),
                            "Open": float(item.get("open", close)),
                            "High": float(item.get("high", close)),
                            "Low": float(item.get("low", close)),
                            "Close": float(close),
                            "Volume": int(item.get("volume", 0) or 0),
                            "Dividends": 0.0,
                            "Stock Splits": 0.0,
                        }
                    )

            if not rows:
                return None

            logger.info(f"✓ {ticker}: {len(rows)} historical prices (Twelve Data)")
            return pd.DataFrame(rows).sort_values("Date")
        except Exception as e:
            logger.warning(f"Twelve Data historical fetch failed for {ticker}: {_mask_api_keys(str(e))}")
            return None


class YFinanceProvider:
    """yfinance (last-resort provider)."""

    @staticmethod
    def create_session() -> requests.Session:
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
            }
        )

        retry_strategy = Retry(
            total=getattr(settings, "YF_RETRY_ATTEMPTS", 3),
            backoff_factor=getattr(settings, "YF_BACKOFF_FACTOR", 1),
            status_forcelist=[500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    @staticmethod
    def fetch_current_price(ticker: str, session: Optional[requests.Session] = None) -> Optional[float]:
        try:
            active_session = session or YFinanceProvider.create_session()
            stock = yf.Ticker(ticker, session=active_session)

            try:
                fast_info = stock.fast_info
                price = fast_info.get("lastPrice") or fast_info.get("regularMarketPrice")
                if price:
                    logger.info(f"✓ {ticker}: ${float(price):.2f} (yfinance)")
                    return float(price)
            except Exception:
                pass

            hist = stock.history(period="5d")
            if not hist.empty and "Close" in hist.columns:
                price = float(hist["Close"].iloc[-1])
                logger.info(f"✓ {ticker}: ${price:.2f} (yfinance)")
                return price
        except Exception as e:
            logger.warning(f"✗ {ticker}: yfinance failed - {_mask_api_keys(str(e))}")
        return None

    @staticmethod
    def fetch_current_prices_batch(
        tickers: List[str],
        session: Optional[requests.Session] = None,
    ) -> Dict[str, Optional[float]]:
        results = {ticker: None for ticker in tickers}
        if not tickers:
            return results

        try:
            logger.info(f"📊 Batch fetching {len(tickers)} tickers from yfinance")
            data = yf.download(
                " ".join(tickers),
                period="1d",
                interval="1d",
                group_by="ticker",
                progress=False,
                auto_adjust=True,
                session=session or YFinanceProvider.create_session(),
            )

            for ticker in tickers:
                try:
                    if len(tickers) == 1:
                        if "Close" in data.columns:
                            results[ticker] = float(data["Close"].iloc[-1])
                    elif ticker in data.columns.get_level_values(0):
                        ticker_data = data[ticker]
                        if "Close" in ticker_data.columns:
                            results[ticker] = float(ticker_data["Close"].iloc[-1])
                except Exception:
                    pass

            successful = sum(1 for value in results.values() if value)
            logger.info(f"📊 yfinance result: {successful} / {len(tickers)} successful")
        except Exception as e:
            logger.error(f"yfinance batch fetch failed: {_mask_api_keys(str(e))}")

        return results

    @staticmethod
    def fetch_historical_prices(ticker: str, start_date: date, end_date: date) -> Optional[pd.DataFrame]:
        try:
            session = YFinanceProvider.create_session()
            stock = yf.Ticker(ticker, session=session)
            hist = stock.history(start=start_date, end=end_date + timedelta(days=1))
            if hist.empty:
                return None

            hist_reset = hist.reset_index()
            hist_reset.columns = ["Date"] + list(hist_reset.columns[1:])
            return hist_reset
        except Exception as e:
            logger.warning(f"yfinance historical fetch failed for {ticker}: {_mask_api_keys(str(e))}")
            return None
