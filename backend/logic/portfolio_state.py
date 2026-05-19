"""
Shared transaction normalization and holdings state builders.

This module is the single source of truth for:
- transaction normalization
- ticker currency resolution
- holdings share/cost basis aggregation
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, List

from logic.prices.shared import get_effective_currency_for_ticker


def normalize_transaction(transaction: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize one transaction dict into the canonical internal shape."""
    ticker = str(transaction["ticker"]).upper().strip()
    normalized_currency = get_effective_currency_for_ticker(
        ticker,
        transaction.get("currency", "EUR"),
    )

    normalized = {
        "ticker": ticker,
        "type": str(transaction["type"]).lower().strip(),
        "date": str(transaction["date"]),
        "shares": float(transaction["shares"]),
        "price": float(transaction["price"]),
        "currency": normalized_currency,
    }

    if transaction.get("gross_amount") is not None:
        normalized["gross_amount"] = float(transaction["gross_amount"])
    if transaction.get("withholding_tax") is not None:
        normalized["withholding_tax"] = float(transaction["withholding_tax"])

    return normalized


def normalize_transactions(transactions: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize transactions into the canonical list shape used by calculations."""
    return [normalize_transaction(transaction) for transaction in transactions]


def build_holdings_state(transactions: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Build per-ticker holdings state from normalized transactions.

    The resulting state keeps the cost basis of remaining open shares using the
    same proportional sell reduction logic currently used across the backend.
    """
    holdings_state = defaultdict(
        lambda: {
            "total_shares": 0.0,
            "total_cost": 0.0,
            "currency": "EUR",
        }
    )

    for transaction in normalize_transactions(transactions):
        ticker = transaction["ticker"]
        shares = transaction["shares"]
        price = transaction["price"]
        currency = transaction["currency"]

        position = holdings_state[ticker]
        position["currency"] = currency

        if transaction["type"] == "dividend":
            continue

        if transaction["type"] == "buy":
            position["total_shares"] += shares
            position["total_cost"] += shares * price
            continue

        current_shares = position["total_shares"]
        avg_buy_price = (position["total_cost"] / current_shares) if current_shares > 0 else 0.0
        position["total_shares"] -= shares
        position["total_cost"] -= shares * avg_buy_price

    return dict(holdings_state)


def build_open_holdings(transactions: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert holdings state into the open-holdings list used by allocation logic."""
    holdings = []

    for ticker, data in build_holdings_state(transactions).items():
        total_shares = data["total_shares"]
        if total_shares <= 0:
            continue

        holdings.append(
            {
                "ticker": ticker,
                "total_shares": total_shares,
                "avg_buy_price": data["total_cost"] / total_shares,
                "currency": data["currency"],
            }
        )

    return holdings


def build_ticker_currency_map(transactions: Iterable[Dict[str, Any]]) -> Dict[str, str]:
    """Return the effective currency for each ticker in the transaction set."""
    currency_by_ticker: Dict[str, str] = {}
    for transaction in normalize_transactions(transactions):
        currency_by_ticker[transaction["ticker"]] = transaction["currency"]
    return currency_by_ticker
