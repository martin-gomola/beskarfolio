"""
Portfolio valuation: open holdings priced at their latest quote and converted to EUR.

Owns the pricing policy for the current portfolio:
- a quote older than PRICE_CACHE_HOURS is used but marked ``stale``;
- a holding with no quote is valued at cost basis and marked ``estimated``;
- totals and unrealized gain are summed in EUR at current FX.

Pure over its inputs (normalized transactions + a price map from the price read
model), so it is tested without HTTP or provider calls.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from config import settings
from logic.currency_service import convert_to_eur
from logic.models import PortfolioSummary
from logic.portfolio_state import build_holdings_state


def value_portfolio(
    transactions: List[Dict[str, Any]],
    prices: Dict[str, Dict[str, Any]],
) -> Tuple[PortfolioSummary, List[Dict[str, Any]]]:
    """Value open holdings from normalized transactions and a ticker -> quote map."""
    holdings: List[Dict[str, Any]] = []
    total_value_eur = 0.0
    total_invested_eur = 0.0
    estimated_holdings_count = 0

    for ticker, data in build_holdings_state(transactions).items():
        shares = data['total_shares']
        if shares <= 0:
            continue

        invested_value = data['total_cost']
        avg_buy_price = invested_value / shares
        currency = data['currency']
        price_info = prices.get(ticker)
        price_status = 'current'
        price_note = None

        if price_info:
            current_price = price_info['price']
            if (price_info.get('fetch_age_hours') or 0) >= settings.PRICE_CACHE_HOURS:
                price_status = 'stale'
                price_note = 'Using cached quote from the latest local CSV update.'
        else:
            current_price = avg_buy_price
            price_status = 'estimated'
            price_note = 'No quote available; current valuation is using cost basis.'
            estimated_holdings_count += 1

        current_value = shares * current_price
        gain_loss = current_value - invested_value
        gain_loss_pct = (gain_loss / invested_value * 100) if invested_value > 0 else 0

        current_value_eur = convert_to_eur(current_value, currency)
        invested_value_eur = convert_to_eur(invested_value, currency)
        total_value_eur += current_value_eur
        total_invested_eur += invested_value_eur

        holdings.append({
            'ticker': ticker,
            'shares': shares,
            'avg_buy_price': avg_buy_price,
            'current_price': current_price,
            'current_value': current_value,
            'invested_value': invested_value,
            'gain_loss': gain_loss,
            'gain_loss_pct': round(gain_loss_pct, 2),
            'currency': currency,
            'current_value_eur': round(current_value_eur, 2),
            'invested_value_eur': round(invested_value_eur, 2),
            'price_status': price_status,
            'price_note': price_note,
        })

    unrealized_gain = total_value_eur - total_invested_eur
    unrealized_gain_pct = (unrealized_gain / total_invested_eur * 100) if total_invested_eur > 0 else 0

    summary = PortfolioSummary(
        success=True,
        transaction_count=len(transactions),
        total_value=round(total_value_eur, 2),
        total_invested=round(total_invested_eur, 2),
        total_gain_loss=round(unrealized_gain, 2),
        total_gain_loss_pct=round(unrealized_gain_pct, 2),
        holdings_count=len(holdings),
        estimated_holdings_count=estimated_holdings_count,
    )
    return summary, holdings
