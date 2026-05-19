"""
Tax-free share calculations for Slovak tax rules
Slovak tax law: shares held > 365 days are tax-free
Uses FIFO (First-In-First-Out) accounting

LocalStorage-only architecture:
- Accepts transactions from frontend
- Calculates tax-free shares using FIFO
- Returns breakdown of tax-free vs taxable shares
"""
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from collections import defaultdict, deque
from itertools import islice

logger = logging.getLogger(__name__)


def calculate_tax_free_from_transactions(transactions_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Calculate tax-free shares from a list of transactions (for guest mode)

    Args:
        transactions_list: List of transaction dicts with keys: ticker, type, date, shares, price, currency

    Returns:
        List of dicts with tax-free analysis per ticker
    """
    if not transactions_list:
        return []

    # Group transactions by ticker
    ticker_transactions = defaultdict(list)
    for txn in transactions_list:
        ticker_transactions[txn['ticker']].append({
            'ticker': txn['ticker'],
            'transaction_type': txn['type'],
            'date': datetime.fromisoformat(txn['date'].replace('Z', '+00:00')).date() if isinstance(txn['date'], str) else txn['date'],
            'shares': float(txn['shares']),
            'price': float(txn['price']),
            'currency': txn.get('currency', 'EUR')
        })

    # Sort transactions by date within each ticker
    for ticker in ticker_transactions:
        ticker_transactions[ticker].sort(key=lambda x: x['date'])

    today = datetime.now().date()
    tax_free_cutoff = today - timedelta(days=365)

    results = []

    for ticker, txns in ticker_transactions.items():
        # FIFO queue: each item is (buy_date, shares_remaining, price, currency)
        fifo_queue = deque()

        for txn in txns:
            if txn['transaction_type'] == 'buy':
                # Add to FIFO queue
                fifo_queue.append({
                    'date': txn['date'],
                    'shares': txn['shares'],
                    'price': txn['price'],
                    'currency': txn['currency']
                })

            elif txn['transaction_type'] == 'sell':
                # Remove from oldest positions first (FIFO)
                shares_to_sell = txn['shares']

                while shares_to_sell > 0 and fifo_queue:
                    oldest = fifo_queue[0]

                    if oldest['shares'] <= shares_to_sell:
                        # Consume entire oldest position
                        shares_to_sell -= oldest['shares']
                        fifo_queue.popleft()
                    else:
                        # Partially consume oldest position
                        oldest['shares'] -= shares_to_sell
                        shares_to_sell = 0

        # Skip if no shares left
        if not fifo_queue:
            continue

        # Calculate tax-free shares
        total_shares = sum(lot['shares'] for lot in fifo_queue)
        tax_free_shares = 0
        next_tax_free_date = None
        next_tax_free_shares = 0

        for lot in fifo_queue:
            if lot['date'] <= tax_free_cutoff:
                # This lot is tax-free
                tax_free_shares += lot['shares']
            else:
                # This lot is not yet tax-free
                lot_free_date = lot['date'] + timedelta(days=365)

                if next_tax_free_date is None or lot_free_date < next_tax_free_date:
                    next_tax_free_date = lot_free_date
                    next_tax_free_shares = lot['shares']

        # Get currency from first lot
        first_lot = next(iter(fifo_queue), None)
        currency = first_lot['currency'] if first_lot else 'EUR'

        results.append({
            'ticker': ticker,
            'total_shares': round(total_shares, 4),
            'tax_free_shares': round(tax_free_shares, 4),
            'taxable_shares': round(total_shares - tax_free_shares, 4),
            'tax_free_pct': round((tax_free_shares / total_shares * 100) if total_shares > 0 else 0, 1),
            'next_tax_free_date': next_tax_free_date.isoformat() if next_tax_free_date else None,
            'next_tax_free_shares': round(next_tax_free_shares, 4) if next_tax_free_shares else 0,
            'currency': currency,
            'oldest_lots': [
                {
                    'date': lot['date'].isoformat(),
                    'shares': round(lot['shares'], 4),
                    'days_held': (today - lot['date']).days,
                    'is_tax_free': lot['date'] <= tax_free_cutoff
                }
                for lot in islice(fifo_queue, 5)  # Show first 5 lots
            ]
        })

    # Sort by ticker
    results.sort(key=lambda x: x['ticker'])

    logger.info(f"✅ Calculated tax-free shares for {len(results)} tickers (guest mode)")
    return results
