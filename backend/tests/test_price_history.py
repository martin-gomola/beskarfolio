import json
import os
import tempfile
import time
import unittest
from datetime import datetime
from threading import Thread
from unittest.mock import patch

import pandas as pd

from logic.prices.history import ensure_historical_prices_with_timeout
from logic.prices.read_model import (
    get_52week_ranges,
    get_all_latest_prices,
    get_price_range,
    get_price_status,
)
from logic.prices.service import get_historical_file_status_for_ticker, get_latest_price
from logic.prices.storage import CSVStorageManager, PricePersistenceError
from config import settings


class PriceHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_dir = settings.HISTORICAL_PRICES_DIR
        self.original_class_dir = type(settings).HISTORICAL_PRICES_DIR
        self.original_snapshot_file = settings.LATEST_PRICES_FILE
        self.original_class_snapshot_file = type(settings).LATEST_PRICES_FILE
        settings.HISTORICAL_PRICES_DIR = self.temp_dir.name
        type(settings).HISTORICAL_PRICES_DIR = self.temp_dir.name
        settings.LATEST_PRICES_FILE = os.path.join(self.temp_dir.name, "latest_prices.json")
        type(settings).LATEST_PRICES_FILE = settings.LATEST_PRICES_FILE

    def tearDown(self) -> None:
        settings.HISTORICAL_PRICES_DIR = self.original_dir
        type(settings).HISTORICAL_PRICES_DIR = self.original_class_dir
        settings.LATEST_PRICES_FILE = self.original_snapshot_file
        type(settings).LATEST_PRICES_FILE = self.original_class_snapshot_file
        self.temp_dir.cleanup()

    def _write_csv(self, ticker: str, rows: list[str]) -> str:
        path = CSVStorageManager.get_csv_path(ticker)
        with open(path, "w") as handle:
            handle.write("Date,Close\n")
            handle.write("\n".join(rows))
            handle.write("\n")
        CSVStorageManager.invalidate_cache(ticker)
        return path

    def test_latest_price_includes_fetch_age_metadata(self) -> None:
        path = self._write_csv("AAPL", ["2024-01-01,150.00", "2024-01-02,155.00"])
        fetched_at = time.time() - 3600
        os.utime(path, (fetched_at, fetched_at))

        latest_price = get_latest_price("AAPL")

        self.assertIsNotNone(latest_price)
        self.assertIn("fetched_at", latest_price)
        self.assertIn("fetch_age_hours", latest_price)
        self.assertAlmostEqual(latest_price["price"], 155.0)
        self.assertGreater(latest_price["fetch_age_hours"], 0.9)

    def test_historical_file_status_uses_fetch_age_not_market_age(self) -> None:
        path = self._write_csv("VWCE.DE", ["2024-01-05,101.25"])
        fetched_at = time.time() - 1800
        os.utime(path, (fetched_at, fetched_at))

        status = get_historical_file_status_for_ticker("VWCE.DE")

        self.assertTrue(status["has_csv"])
        self.assertLess(status["price_age_hours"], 1.0)
        self.assertGreater(status["market_age_hours"], 24.0)
        self.assertEqual(status["price_source"], "recent_api")

    def test_save_price_to_csv_refreshes_file_mtime_for_same_market_date(self) -> None:
        path = self._write_csv("AAPL", ["2024-01-05,101.25"])
        old_mtime = time.time() - 7200
        os.utime(path, (old_mtime, old_mtime))

        CSVStorageManager.save_price_to_csv("AAPL", 109.75, datetime(2024, 1, 5, 15, 30))

        self.assertGreater(os.path.getmtime(path), old_mtime)
        latest_price = get_latest_price("AAPL")
        self.assertIsNotNone(latest_price)
        self.assertAlmostEqual(latest_price["price"], 109.75)
        self.assertLess(latest_price["fetch_age_hours"], 1.0)

    def test_latest_price_prefers_intraday_snapshot_over_csv(self) -> None:
        self._write_csv("AAPL", ["2024-01-05,101.25"])

        CSVStorageManager.save_latest_snapshot(
            "AAPL",
            109.75,
            updated_at=datetime.now(),
            source="api_snapshot",
            market_date="2024-01-08",
        )

        latest_price = get_latest_price("AAPL")

        self.assertIsNotNone(latest_price)
        self.assertAlmostEqual(latest_price["price"], 109.75)
        self.assertEqual(latest_price["date"], "2024-01-08")
        self.assertEqual(latest_price["source"], "api_snapshot")
        self.assertLess(latest_price["fetch_age_hours"], 1.0)

    def test_price_read_model_projects_cached_price_views(self) -> None:
        self._write_csv(
            "AAPL",
            [
                "2023-01-01,90.00",
                "2024-01-01,100.00",
                "2024-01-02,110.00",
            ],
        )

        latest_prices = get_all_latest_prices()
        price_range = get_price_range("aapl", "2024-01-01", "2024-01-02")
        week_ranges = get_52week_ranges()
        status = get_price_status(
            details=True,
            prices={
                "AAPL": {
                    "price": 110.0,
                    "currency": "USD",
                    "date": "2024-01-02",
                    "age_hours": 500,
                    "fetch_age_hours": 0.5,
                }
            },
        )

        self.assertEqual(latest_prices["AAPL"]["price"], 110.0)
        self.assertEqual([row["close"] for row in price_range], [100.0, 110.0])
        self.assertEqual(week_ranges["AAPL"]["high"], 110.0)
        self.assertEqual(week_ranges["AAPL"]["low"], 100.0)
        self.assertEqual(status["status_counts"], {"cached": 1, "recent": 0, "stale": 0})
        self.assertEqual(status["prices"][0]["status"], "cached")

    def test_save_historical_dataframe_normalizes_same_day_duplicates(self) -> None:
        df = pd.DataFrame(
            {
                "Date": [
                    "2024-01-05T09:30:00Z",
                    "2024-01-05T16:00:00Z",
                    "2024-01-08T16:00:00Z",
                ],
                "Close": [100.0, 101.25, 102.5],
            }
        )

        CSVStorageManager.save_historical_dataframe("AAPL", df)

        path = CSVStorageManager.get_csv_path("AAPL")
        saved = pd.read_csv(path)

        self.assertEqual(saved["Date"].tolist(), ["2024-01-05", "2024-01-08"])
        self.assertEqual(saved["Close"].tolist(), [101.25, 102.5])

    def test_concurrent_snapshot_writes_preserve_all_tickers(self) -> None:
        def save_snapshot(ticker: str, price: float) -> None:
            CSVStorageManager.save_latest_snapshot(
                ticker,
                price,
                updated_at=datetime(2024, 1, 5, 12, 0),
                source="test",
                market_date="2024-01-05",
            )

        threads = [
            Thread(target=save_snapshot, args=("AAPL", 101.25)),
            Thread(target=save_snapshot, args=("MSFT", 202.5)),
        ]

        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        with open(settings.LATEST_PRICES_FILE, "r", encoding="utf-8") as handle:
            payload = json.load(handle)

        self.assertEqual(set(payload["prices"].keys()), {"AAPL", "MSFT"})
        self.assertEqual(payload["prices"]["AAPL"]["price"], 101.25)
        self.assertEqual(payload["prices"]["MSFT"]["price"], 202.5)

    def test_snapshot_write_failure_raises_persistence_error(self) -> None:
        with patch.object(CSVStorageManager, "_atomic_replace_text", side_effect=OSError("disk full")):
            with self.assertRaises(PricePersistenceError):
                CSVStorageManager.save_latest_snapshot("AAPL", 101.25)

    def test_conditional_close_write_preserves_interleaved_newer_snapshot(self) -> None:
        CSVStorageManager.save_latest_snapshot(
            "AAPL",
            110.0,
            source="api",
            market_date="2026-07-31",
        )

        promoted = CSVStorageManager.save_latest_snapshot_if_not_newer(
            "AAPL",
            100.0,
            source="daily_close",
            market_date="2026-07-30",
        )

        latest = CSVStorageManager.load_latest_snapshot("AAPL")
        self.assertFalse(promoted)
        self.assertEqual(latest["price"], 110.0)
        self.assertEqual(latest["market_date"], "2026-07-31")

    def test_historical_dataframe_write_failure_raises_persistence_error(self) -> None:
        df = pd.DataFrame({"Date": ["2024-01-05"], "Close": [101.25]})

        with patch.object(CSVStorageManager, "_atomic_replace_text", side_effect=OSError("disk full")):
            with self.assertRaises(PricePersistenceError):
                CSVStorageManager.save_historical_dataframe("AAPL", df)

    def test_timeout_wrapper_returns_promptly(self) -> None:
        def slow_fetch(_transactions):
            time.sleep(0.5)
            return {"fetched": [], "skipped": [], "errors": []}

        with patch("logic.prices.history.ensure_historical_prices", side_effect=slow_fetch):
            start = time.time()
            result = ensure_historical_prices_with_timeout([], timeout=0.05)
            elapsed = time.time() - start

        self.assertLess(elapsed, 0.25)
        self.assertIn("Task timed out", result["errors"][0])


if __name__ == "__main__":
    unittest.main()
