"""
Realized Gains Calculator

Calculates realized gains/losses from sell transactions by tracking
the weighted average cost basis at the time of each sale.

Formula:
    realized_gain = (sell_price - avg_buy_price_at_time_of_sale) * shares_sold
"""
import logging
from typing import Dict, List
from collections import defaultdict
from decimal import Decimal

logger = logging.getLogger(__name__)


def calculate_realized_gains(transactions: List[Dict]) -> Dict[str, any]:
    """
    Calculate realized gains from all sell transactions.

    Args:
        transactions: List of transaction dicts with keys:
            - ticker, date, shares, price, type (buy/sell), currency

    Returns:
        Dict with:
            - total_realized_gain: Total across all tickers
            - by_ticker: Dict[ticker, realized_gain]
            - by_currency: Dict[currency, realized_gain]
            - details: List of individual realized gain events
    """
    # Sort transactions by date to process chronologically
    sorted_txns = sorted(transactions, key=lambda x: x['date'])

    # Track cost basis per ticker
    positions = defaultdict(lambda: {
        'shares': Decimal('0'),
        'total_cost': Decimal('0'),
        'currency': 'EUR'
    })

    # Track realized gains
    realized_gains_by_ticker = defaultdict(Decimal)
    realized_gains_by_currency = defaultdict(Decimal)
    realized_gain_details = []

    for txn in sorted_txns:
        ticker = txn['ticker']
        shares = Decimal(str(txn['shares']))
        price = Decimal(str(txn['price']))
        txn_type = txn['type']
        currency = txn.get('currency', 'EUR')
        date = txn['date']

        position = positions[ticker]
        position['currency'] = currency

        if txn_type == 'buy':
            # Add to position
            position['shares'] += shares
            position['total_cost'] += (shares * price)

        elif txn_type == 'sell':
            # Calculate weighted average buy price BEFORE the sale
            if position['shares'] > 0:
                avg_buy_price = position['total_cost'] / position['shares']
            else:
                # Edge case: selling without prior buys (short selling or data error)
                avg_buy_price = price
                logger.warning(f"Sell transaction for {ticker} on {date} without sufficient buy history")

            # Calculate realized gain for this sale
            realized_gain = (price - avg_buy_price) * shares

            # Track the gain
            realized_gains_by_ticker[ticker] += realized_gain
            realized_gains_by_currency[currency] += realized_gain

            # Record details
            realized_gain_details.append({
                'ticker': ticker,
                'date': date,
                'shares': float(shares),
                'sell_price': float(price),
                'avg_buy_price': float(avg_buy_price),
                'realized_gain': float(realized_gain),
                'currency': currency
            })

            # Reduce position proportionally
            position['shares'] -= shares
            position['total_cost'] -= (shares * avg_buy_price)

            # Handle rounding errors - if shares close to zero, set to zero
            if abs(position['shares']) < Decimal('0.0001'):
                position['shares'] = Decimal('0')
                position['total_cost'] = Decimal('0')

    # Calculate totals (in original currencies - no conversion)
    total_realized_gain = sum(realized_gains_by_ticker.values())

    return {
        'total_realized_gain': float(total_realized_gain),
        'by_ticker': {k: float(v) for k, v in realized_gains_by_ticker.items()},
        'by_currency': {k: float(v) for k, v in realized_gains_by_currency.items()},
        'details': realized_gain_details
    }


def calculate_realized_gains_by_ticker(transactions: List[Dict], ticker: str) -> Dict[str, any]:
    """
    Calculate realized gains for a specific ticker.

    Args:
        transactions: List of all transactions
        ticker: Ticker symbol to calculate for

    Returns:
        Dict with realized gain info for the ticker
    """
    ticker_txns = [t for t in transactions if t['ticker'] == ticker]
    result = calculate_realized_gains(ticker_txns)

    return {
        'ticker': ticker,
        'realized_gain': result['by_ticker'].get(ticker, 0.0),
        'currency': result['by_currency'],
        'details': result['details']
    }
