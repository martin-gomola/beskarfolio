import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from config import settings
from logic.prices.refresh import PriceRefreshMode
from logic.prices.storage import PricePersistenceError
from main import app


class ApiContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_dir = settings.HISTORICAL_PRICES_DIR
        self.original_class_dir = type(settings).HISTORICAL_PRICES_DIR
        self.original_snapshot_file = settings.LATEST_PRICES_FILE
        self.original_class_snapshot_file = type(settings).LATEST_PRICES_FILE
        self.original_api_key = settings.API_KEY
        self.original_auto_fetch_historical = settings.AUTO_FETCH_HISTORICAL
        self.original_trusted_hosts = list(settings.TRUSTED_HOSTS)
        settings.HISTORICAL_PRICES_DIR = self.temp_dir.name
        type(settings).HISTORICAL_PRICES_DIR = self.temp_dir.name
        settings.LATEST_PRICES_FILE = os.path.join(self.temp_dir.name, "latest_prices.json")
        type(settings).LATEST_PRICES_FILE = settings.LATEST_PRICES_FILE
        settings.API_KEY = None
        settings.AUTO_FETCH_HISTORICAL = False
        settings.TRUSTED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
        self.client = TestClient(app)

    def tearDown(self) -> None:
        settings.HISTORICAL_PRICES_DIR = self.original_dir
        type(settings).HISTORICAL_PRICES_DIR = self.original_class_dir
        settings.LATEST_PRICES_FILE = self.original_snapshot_file
        type(settings).LATEST_PRICES_FILE = self.original_class_snapshot_file
        settings.API_KEY = self.original_api_key
        settings.AUTO_FETCH_HISTORICAL = self.original_auto_fetch_historical
        settings.TRUSTED_HOSTS = self.original_trusted_hosts
        self.temp_dir.cleanup()

    def _create_csv(self, ticker: str) -> None:
        path = settings.get_historical_price_path(ticker)
        with open(path, "w") as handle:
            handle.write("Date,Close\n2024-01-01,100.00\n")

    def test_portfolio_calculate_preserves_contract_with_estimated_holding(self) -> None:
        transactions = [
            {"ticker": "AAPL", "type": "buy", "date": "2024-01-01", "shares": 2, "price": 100, "currency": "USD"},
        ]

        with patch("api.portfolio.get_all_prices", return_value={}):
            response = self.client.post("/api/portfolio/calculate", json=transactions)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["summary"]["estimated_holdings_count"], 1)
        self.assertEqual(payload["holdings"][0]["price_status"], "estimated")
        self.assertIn("current_value_eur", payload["holdings"][0])
        self.assertIn("invested_value_eur", payload["holdings"][0])
        self.assertIn("price_note", payload["holdings"][0])

    def test_prices_status_preserves_summary_contract(self) -> None:
        self._create_csv("AAPL")
        self._create_csv("MSFT")
        self._create_csv("GOOGL")

        prices = {
            "AAPL": {"price": 100, "currency": "USD", "date": "2024-01-01T00:00:00+00:00", "age_hours": 1000, "fetched_at": "2024-01-10T00:00:00+00:00", "fetch_age_hours": 0.1},
            "MSFT": {"price": 200, "currency": "USD", "date": "2024-01-01T00:00:00+00:00", "age_hours": 1000, "fetched_at": "2024-01-10T00:00:00+00:00", "fetch_age_hours": 5},
            "GOOGL": {"price": 300, "currency": "USD", "date": "2024-01-01T00:00:00+00:00", "age_hours": 1000, "fetched_at": "2024-01-10T00:00:00+00:00", "fetch_age_hours": 30},
        }

        with patch("api.prices.get_all_prices", return_value=prices):
            response = self.client.get("/api/prices/status?details=true")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status_counts"], {"cached": 1, "recent": 1, "stale": 1})
        self.assertEqual(payload["prices_count"], 3)
        self.assertEqual(len(payload["prices"]), 3)
        self.assertIn("price_date", payload["prices"][0])

    def test_price_update_delegates_to_shared_refresh_module(self) -> None:
        expected = {
            "success": True,
            "total_tickers": 1,
            "updated_count": 1,
            "cached_count": 0,
            "failed_count": 0,
            "failed_tickers": None,
            "ticker_results": [
                {
                    "ticker": "AAPL",
                    "status": "updated",
                    "price": 110.0,
                    "source": "api_snapshot",
                }
            ],
            "closes_finalized": 1,
            "message": "Updated 1/1 ticker(s), 0 cached, 1 daily closes finalized",
        }

        with patch("api.prices.refresh_prices") as refresh_prices:
            refresh_prices.return_value.to_http_response.return_value = expected
            response = self.client.post(
                "/api/prices/update",
                json={"tickers": ["aapl"], "force": True},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected)
        refresh_prices.assert_called_once_with(
            ["aapl"],
            mode=PriceRefreshMode.MANUAL,
            force_refresh=True,
        )

    def test_price_update_surfaces_refresh_persistence_failure(self) -> None:
        with patch(
            "api.prices.refresh_prices",
            side_effect=PricePersistenceError("disk full"),
        ):
            response = self.client.post(
                "/api/prices/update",
                json={"tickers": ["AAPL"], "force": True},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("could not persist", response.json()["detail"])

    def test_price_update_surfaces_unexpected_refresh_failure(self) -> None:
        with patch(
            "api.prices.refresh_prices",
            side_effect=RuntimeError("refresh defect"),
        ):
            response = self.client.post(
                "/api/prices/update",
                json={"tickers": ["AAPL"], "force": True},
            )

        self.assertEqual(response.status_code, 500)

    def test_allocation_status_preserves_typed_contract(self) -> None:
        request_payload = {
            "transactions": [
                {"ticker": "AAPL", "type": "buy", "date": "2024-01-01", "shares": 2, "price": 100, "currency": "USD"},
                {"ticker": "VWCE.DE", "type": "buy", "date": "2024-01-01", "shares": 3, "price": 90, "currency": "EUR"},
            ],
            "target_allocations": {"AAPL": 50.0, "VWCE.DE": 50.0},
        }
        prices = {
            "AAPL": {"price": 120, "currency": "USD"},
            "VWCE.DE": {"price": 100, "currency": "EUR"},
        }

        with patch("api.allocation.get_all_prices", return_value=prices):
            response = self.client.post("/api/allocation/status", json=request_payload)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertIn("drift_data", payload)
        self.assertEqual(len(payload["drift_data"]), 2)
        self.assertIn("current_weight_pct", payload["drift_data"][0])

    def test_rebalance_plan_preserves_typed_contract(self) -> None:
        request_payload = {
            "transactions": [
                {"ticker": "AAPL", "type": "buy", "date": "2024-01-01", "shares": 4, "price": 100, "currency": "USD"},
                {"ticker": "VWCE.DE", "type": "buy", "date": "2024-01-01", "shares": 2, "price": 100, "currency": "EUR"},
            ],
            "target_allocations": {"AAPL": 20.0, "VWCE.DE": 80.0},
            "cash_available": 500,
            "can_sell": True,
            "minimum_trade_value": 10,
            "prioritize_tax_free": False,
            "strategy": "sell_buy",
        }
        prices = {
            "AAPL": {"price": 150, "currency": "USD"},
            "VWCE.DE": {"price": 100, "currency": "EUR"},
        }

        with patch("api.allocation.get_all_prices", return_value=prices):
            response = self.client.post("/api/allocation/rebalance-plan", json=request_payload)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertIn("summary", payload["plan"])
        self.assertIn("trades", payload["plan"])
        self.assertIn("cash_shortfall", payload["plan"]["summary"])

    def test_annual_performance_uses_normalized_transactions(self) -> None:
        request_payload = {
            "transactions": [
                {"ticker": "aapl", "type": "BUY", "date": "2024-01-01", "shares": 2, "price": 100, "currency": "usd"},
            ]
        }

        with patch("api.analytics.get_all_prices", return_value={"AAPL": {"price": 150, "currency": "USD"}}):
            with patch(
                "logic.annual_performance.calculate_annual_performance",
                return_value={
                    "years": [],
                    "all_time": {
                        "start_date": "2024-01-01",
                        "end_date": "2024-12-31",
                        "beginning_balance": 0,
                        "ending_balance": 171.2,
                        "total_invested": 171.2,
                        "total_withdrawn": 0,
                        "net_deposits": 171.2,
                        "total_gain": 0,
                        "total_gain_pct": 0,
                        "trade_count": 1,
                    },
                },
            ):
                response = self.client.post("/api/portfolio/annual-performance", json=request_payload)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["all_time"]["trade_count"], 1)

    def test_tax_free_preserves_typed_contract(self) -> None:
        request_payload = {
            "transactions": [
                {"ticker": "VWCE.DE", "type": "buy", "date": "2024-01-01", "shares": 3, "price": 90, "currency": "EUR"},
            ]
        }

        with patch(
            "logic.tax_free.calculate_tax_free_from_transactions",
            return_value=[
                {
                    "ticker": "VWCE.DE",
                    "total_shares": 3.0,
                    "tax_free_shares": 1.0,
                    "taxable_shares": 2.0,
                    "tax_free_pct": 33.3,
                    "next_tax_free_date": "2026-01-01",
                    "next_tax_free_shares": 2.0,
                    "currency": "EUR",
                    "oldest_lots": [
                        {"date": "2024-01-01", "shares": 1.0, "days_held": 400, "is_tax_free": True},
                    ],
                }
            ],
        ):
            response = self.client.post("/api/tax-free", json=request_payload)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["tax_free_holdings"][0]["ticker"], "VWCE.DE")
        self.assertIn("oldest_lots", payload["tax_free_holdings"][0])

    def test_performance_history_preserves_typed_contract(self) -> None:
        request_payload = {
            "transactions": [
                {"ticker": "AAPL", "type": "buy", "date": "2024-01-01", "shares": 2, "price": 100, "currency": "USD"},
            ]
        }

        with patch("api.analytics.get_all_prices", return_value={"AAPL": {"price": 150, "currency": "USD"}, "SXR8.DE": {"price": 100, "currency": "EUR"}}):
            with patch(
                "logic.performance_history.calculate_performance_history",
                return_value=[
                    {
                        "date": "2024-01-01",
                        "value": 171.2,
                        "invested": 171.2,
                        "portfolio_return_pct": 0.0,
                        "benchmark_return_pct": 0.0,
                    }
                ],
            ):
                response = self.client.post("/api/portfolio/performance-history", json=request_payload)

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(len(payload["data_points"]), 1)
        self.assertIn("portfolio_return_pct", payload["data_points"][0])


if __name__ == "__main__":
    unittest.main()
