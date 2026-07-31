from datetime import date, datetime, timezone
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from logic.prices.refresh import PriceRefresh, PriceRefreshMode


class FakePriceStorage:
    def __init__(self, latest_market_dates=None) -> None:
        self.events = []
        self.latest_market_dates = latest_market_dates or {}

    def save_price_to_csv(self, ticker, price, price_date) -> None:
        self.events.append(("csv", ticker, price, price_date.date().isoformat()))

    def save_latest_snapshot(
        self,
        ticker,
        price,
        updated_at=None,
        source="snapshot",
        market_date=None,
    ) -> None:
        self.events.append(("snapshot", ticker, price, source, market_date))
        self.latest_market_dates[ticker] = market_date

    def save_latest_snapshot_if_not_newer(
        self,
        ticker,
        price,
        *,
        updated_at=None,
        source="snapshot",
        market_date,
        replace_same_market_date=False,
    ) -> bool:
        current_market_date = self.latest_market_dates.get(ticker, "")
        if current_market_date > market_date:
            return False
        if current_market_date == market_date and not replace_same_market_date:
            return False
        self.save_latest_snapshot(
            ticker,
            price,
            updated_at=updated_at,
            source=source,
            market_date=market_date,
        )
        return True


def open_market_state():
    return {
        "market_date": date(2026, 7, 31),
        "is_after_close": False,
        "is_open": True,
        "is_trading_day": True,
    }


class PriceRefreshTests(unittest.TestCase):
    def test_manual_refresh_persists_intraday_snapshot_after_daily_close(self) -> None:
        storage = FakePriceStorage()
        refresh = PriceRefresh(
            latest_price_loader=lambda _ticker: None,
            current_prices_fetcher=lambda _tickers: {"AAPL": 110.0},
            daily_close_fetcher=lambda _ticker, _state: (date(2026, 7, 30), 100.0),
            market_state_loader=lambda _ticker: open_market_state(),
            storage=storage,
            now=lambda: datetime(2026, 7, 31, 14, 0, tzinfo=timezone.utc),
            cache_threshold_hours=4.0,
        )

        report = refresh.run(["AAPL"], mode=PriceRefreshMode.MANUAL, force_refresh=True)

        self.assertEqual(
            storage.events,
            [
                ("csv", "AAPL", 100.0, "2026-07-30"),
                ("snapshot", "AAPL", 100.0, "daily_close", "2026-07-30"),
                ("snapshot", "AAPL", 110.0, "api", "2026-07-31"),
            ],
        )
        self.assertEqual(report.updated_count, 1)
        self.assertEqual(report.closes_finalized, 1)
        self.assertEqual(report.results[0].price, 110.0)

    def test_cached_same_day_intraday_snapshot_is_not_overwritten_by_close(
        self,
    ) -> None:
        storage = FakePriceStorage({"AAPL": "2026-07-31"})
        batch_calls = []
        latest = {
            "price": 109.0,
            "date": "2026-07-31",
            "fetch_age_hours": 0.5,
            "age_hours": 0.5,
        }
        refresh = PriceRefresh(
            latest_price_loader=lambda _ticker: latest,
            current_prices_fetcher=lambda tickers: batch_calls.append(tickers) or {},
            daily_close_fetcher=lambda _ticker, _state: (date(2026, 7, 30), 100.0),
            market_state_loader=lambda _ticker: open_market_state(),
            storage=storage,
            now=lambda: datetime(2026, 7, 31, 14, 0, tzinfo=timezone.utc),
            cache_threshold_hours=4.0,
        )

        report = refresh.run(["AAPL"], mode=PriceRefreshMode.MANUAL)

        self.assertEqual(storage.events, [("csv", "AAPL", 100.0, "2026-07-30")])
        self.assertEqual(batch_calls, [])
        self.assertEqual(report.cached_count, 1)
        self.assertEqual(report.results[0].price, 109.0)

    def test_scheduled_refresh_uses_same_module_and_skips_closed_market_snapshot(
        self,
    ) -> None:
        storage = FakePriceStorage()
        batch_calls = []
        closed_state = {
            "market_date": date(2026, 7, 31),
            "is_after_close": False,
            "is_open": False,
            "is_trading_day": True,
        }
        refresh = PriceRefresh(
            latest_price_loader=lambda _ticker: None,
            current_prices_fetcher=lambda tickers: batch_calls.append(tickers) or {},
            daily_close_fetcher=lambda _ticker, _state: (date(2026, 7, 30), 100.0),
            market_state_loader=lambda _ticker: closed_state,
            storage=storage,
            now=lambda: datetime(2026, 7, 31, 6, 30, tzinfo=timezone.utc),
            cache_threshold_hours=4.0,
        )

        report = refresh.run(["AAPL"], mode=PriceRefreshMode.SCHEDULED)

        self.assertEqual(batch_calls, [])
        self.assertEqual(report.closes_finalized, 1)
        self.assertEqual(report.results[0].snapshot_status, "skipped_closed")

    def test_completed_same_day_close_replaces_intraday_snapshot_after_market_close(
        self,
    ) -> None:
        storage = FakePriceStorage({"AAPL": "2026-07-31"})
        latest = {
            "price": 109.0,
            "date": "2026-07-31",
            "fetch_age_hours": 1.0,
            "age_hours": 1.0,
        }
        after_close_state = {
            "market_date": date(2026, 7, 31),
            "is_after_close": True,
            "is_open": False,
            "is_trading_day": True,
        }
        refresh = PriceRefresh(
            latest_price_loader=lambda _ticker: latest,
            current_prices_fetcher=lambda _tickers: {},
            daily_close_fetcher=lambda _ticker, _state: (date(2026, 7, 31), 108.0),
            market_state_loader=lambda _ticker: after_close_state,
            storage=storage,
            now=lambda: datetime(2026, 7, 31, 21, 0, tzinfo=timezone.utc),
            cache_threshold_hours=4.0,
        )

        report = refresh.run(["AAPL"], mode=PriceRefreshMode.SCHEDULED)

        self.assertEqual(
            storage.events,
            [
                ("csv", "AAPL", 108.0, "2026-07-31"),
                ("snapshot", "AAPL", 108.0, "daily_close", "2026-07-31"),
            ],
        )
        self.assertEqual(report.closes_finalized, 1)

    def test_unexpected_current_fetch_error_propagates(self) -> None:
        refresh = PriceRefresh(
            latest_price_loader=lambda _ticker: None,
            current_prices_fetcher=lambda _tickers: (_ for _ in ()).throw(
                RuntimeError("provider implementation defect")
            ),
            daily_close_fetcher=lambda _ticker, _state: None,
            market_state_loader=lambda _ticker: open_market_state(),
            storage=FakePriceStorage(),
            now=lambda: datetime(2026, 7, 31, 14, 0, tzinfo=timezone.utc),
            cache_threshold_hours=4.0,
        )

        with self.assertRaisesRegex(RuntimeError, "implementation defect"):
            refresh.run(
                ["AAPL"],
                mode=PriceRefreshMode.MANUAL,
                force_refresh=True,
            )

    def test_unexpected_daily_close_error_propagates(self) -> None:
        refresh = PriceRefresh(
            latest_price_loader=lambda _ticker: None,
            current_prices_fetcher=lambda _tickers: {},
            daily_close_fetcher=lambda _ticker, _state: (_ for _ in ()).throw(
                RuntimeError("close implementation defect")
            ),
            market_state_loader=lambda _ticker: open_market_state(),
            storage=FakePriceStorage(),
            now=lambda: datetime(2026, 7, 31, 14, 0, tzinfo=timezone.utc),
            cache_threshold_hours=4.0,
        )

        with self.assertRaisesRegex(RuntimeError, "close implementation defect"):
            refresh.run(
                ["AAPL"],
                mode=PriceRefreshMode.MANUAL,
                force_refresh=True,
            )

    def test_cron_main_propagates_unexpected_refresh_failure(self) -> None:
        script_path = (
            Path(__file__).resolve().parents[2] / "scripts" / "update_portfolio_data.py"
        )
        spec = importlib.util.spec_from_file_location(
            "update_portfolio_data_test", script_path
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        updater = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(updater)

        with (
            patch.object(sys, "argv", [str(script_path), "--mode", "auto"]),
            patch.object(updater, "update_exchange_rates", return_value=True),
            patch.object(
                updater,
                "get_all_tickers_from_csv",
                return_value={"AAPL": "AAPL"},
            ),
            patch.object(
                updater,
                "refresh_prices",
                side_effect=RuntimeError("refresh defect"),
            ),
            self.assertRaisesRegex(RuntimeError, "refresh defect"),
        ):
            updater.main()


if __name__ == "__main__":
    unittest.main()
