import unittest

from logic.allocation import calculate_current_allocation
from logic.portfolio_state import (
    build_holdings_state,
    build_open_holdings,
    build_ticker_currency_map,
    normalize_transactions,
)


class PortfolioStateTests(unittest.TestCase):
    def test_normalize_transactions_applies_effective_currency(self) -> None:
        transactions = [
            {"ticker": "vwce.de", "type": "BUY", "date": "2024-01-01", "shares": "2", "price": "100"},
            {"ticker": "aapl", "type": "buy", "date": "2024-01-02", "shares": 1, "price": 150, "currency": "usd"},
        ]

        normalized = normalize_transactions(transactions)

        self.assertEqual(normalized[0]["ticker"], "VWCE.DE")
        self.assertEqual(normalized[0]["type"], "buy")
        self.assertEqual(normalized[0]["currency"], "EUR")
        self.assertEqual(normalized[1]["currency"], "USD")

    def test_build_holdings_state_preserves_remaining_cost_basis(self) -> None:
        transactions = [
            {"ticker": "AAPL", "type": "buy", "date": "2024-01-01", "shares": 10, "price": 100, "currency": "USD"},
            {"ticker": "AAPL", "type": "buy", "date": "2024-01-02", "shares": 10, "price": 200, "currency": "USD"},
            {"ticker": "AAPL", "type": "sell", "date": "2024-01-03", "shares": 5, "price": 250, "currency": "USD"},
        ]

        holdings_state = build_holdings_state(transactions)

        self.assertAlmostEqual(holdings_state["AAPL"]["total_shares"], 15.0)
        self.assertAlmostEqual(holdings_state["AAPL"]["total_cost"], 2250.0)
        self.assertEqual(holdings_state["AAPL"]["currency"], "USD")

    def test_open_holdings_feed_allocation_consistently(self) -> None:
        transactions = [
            {"ticker": "VWCE.DE", "type": "buy", "date": "2024-01-01", "shares": 4, "price": 100, "currency": "EUR"},
            {"ticker": "AAPL", "type": "buy", "date": "2024-01-01", "shares": 2, "price": 150, "currency": "USD"},
        ]

        holdings = build_open_holdings(transactions)
        prices = {
            "VWCE.DE": {"price": 110, "currency": "EUR"},
            "AAPL": {"price": 160, "currency": "USD"},
        }

        allocation = calculate_current_allocation(holdings, prices)
        ticker_currencies = build_ticker_currency_map(transactions)

        self.assertEqual({holding["ticker"] for holding in holdings}, {"VWCE.DE", "AAPL"})
        self.assertEqual(ticker_currencies, {"VWCE.DE": "EUR", "AAPL": "USD"})
        self.assertIn("VWCE.DE", allocation["allocations"])
        self.assertIn("AAPL", allocation["allocations"])
        self.assertGreater(allocation["total_value_eur"], 0)


if __name__ == "__main__":
    unittest.main()
