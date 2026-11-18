import unittest

from logic.allocation import calculate_current_allocation
from logic.currency_service import convert_to_eur
from logic.portfolio_valuation import value_portfolio
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


class PortfolioValuationTests(unittest.TestCase):
    def test_value_portfolio_applies_quote_policy_and_eur_totals(self) -> None:
        transactions = normalize_transactions([
            {"ticker": "VWCE.DE", "type": "buy", "date": "2024-01-01", "shares": 10, "price": 100},
            {"ticker": "SXR8.DE", "type": "buy", "date": "2024-01-01", "shares": 2, "price": 500},
            {"ticker": "MISS.DE", "type": "buy", "date": "2024-01-01", "shares": 4, "price": 25},
            {"ticker": "AAPL", "type": "buy", "date": "2024-01-01", "shares": 2, "price": 150, "currency": "USD"},
            {"ticker": "AAPL", "type": "sell", "date": "2024-02-01", "shares": 1, "price": 160, "currency": "USD"},
        ])
        prices = {
            "VWCE.DE": {"price": 120.0, "fetch_age_hours": 1},
            "SXR8.DE": {"price": 450.0, "fetch_age_hours": 1000},
            "AAPL": {"price": 200.0, "fetch_age_hours": 1},
        }

        summary, holdings = value_portfolio(transactions, prices)
        by_ticker = {h["ticker"]: h for h in holdings}

        self.assertEqual(by_ticker["VWCE.DE"]["price_status"], "current")
        self.assertEqual(by_ticker["VWCE.DE"]["current_value_eur"], 1200.0)
        self.assertEqual(by_ticker["SXR8.DE"]["price_status"], "stale")
        # No quote: valued at cost basis, no gain.
        self.assertEqual(by_ticker["MISS.DE"]["price_status"], "estimated")
        self.assertEqual(by_ticker["MISS.DE"]["current_value_eur"], 100.0)
        self.assertEqual(by_ticker["MISS.DE"]["gain_loss"], 0)
        # Sell reduces cost basis proportionally: 1 AAPL left at $150.
        self.assertEqual(by_ticker["AAPL"]["shares"], 1)
        self.assertEqual(by_ticker["AAPL"]["invested_value"], 150)
        self.assertEqual(by_ticker["AAPL"]["current_value_eur"], round(convert_to_eur(200.0, "USD"), 2))

        self.assertEqual(summary.holdings_count, 4)
        self.assertEqual(summary.estimated_holdings_count, 1)
        self.assertEqual(summary.transaction_count, 5)
        self.assertAlmostEqual(summary.total_value, sum(h["current_value_eur"] for h in holdings), places=1)
        self.assertAlmostEqual(
            summary.total_gain_loss, summary.total_value - summary.total_invested, places=1
        )


    def test_allocation_matches_valuation_when_a_quote_is_missing(self) -> None:
        transactions = normalize_transactions([
            {"ticker": "VWCE.DE", "type": "buy", "date": "2024-01-01", "shares": 10, "price": 100},
            {"ticker": "MISS.DE", "type": "buy", "date": "2024-01-01", "shares": 4, "price": 25},
        ])
        prices = {"VWCE.DE": {"price": 120.0, "fetch_age_hours": 1}}

        summary, _ = value_portfolio(transactions, prices)
        allocation = calculate_current_allocation(build_open_holdings(transactions), prices)

        self.assertAlmostEqual(allocation["total_value_eur"], summary.total_value, places=2)
        self.assertAlmostEqual(allocation["allocations"]["MISS.DE"]["value_eur"], 100.0)
        self.assertAlmostEqual(allocation["allocations"]["MISS.DE"]["weight_pct"], 100 / 1300 * 100)


if __name__ == "__main__":
    unittest.main()
