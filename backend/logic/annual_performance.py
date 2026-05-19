"""
Annual Performance Calculator - Year-by-Year Portfolio Analysis
===============================================================

PURPOSE:
Calculate detailed performance metrics for each calendar year of your portfolio.

WHAT IT CALCULATES:
1. Beginning Balance (portfolio value on Jan 1)
2. Ending Balance (portfolio value on Dec 31)
3. Cash Flows (money IN and OUT)
4. Total Gain (performance after accounting for cash flows)
5. Gain Percentage (return on invested capital)
6. Per-Ticker Breakdown (which stocks performed best)

KEY FORMULA:
  Total Gain = (Ending Balance - Beginning Balance) - Net Deposits
  
  Where Net Deposits = Money IN - Money OUT

EXAMPLE:
  2023 Performance:
  - Jan 1: Portfolio worth €10,000
  - During year: Added €5,000 (bought more stocks)
  - Dec 31: Portfolio worth €16,500
  
  Calculation:
  - Net Deposits = €5,000
  - Total Gain = (€16,500 - €10,000) - €5,000 = €1,500
  - Gain % = €1,500 / (€10,000 + €5,000) × 100 = +10%
  
  Explanation: Portfolio grew by €6,500 total, but €5,000 was new money.
               Real gain from performance = €1,500 (10% return)

REPORTS PROVIDED:
- Per-Year Reports (2021, 2022, 2023, etc.)
- All-Time Summary (total performance since start)
- Per-Ticker Breakdown (AAPL, MSFT, etc.)
"""
import logging
from typing import Dict, List
from collections import defaultdict
from decimal import Decimal
from datetime import datetime, date

logger = logging.getLogger(__name__)


# =============================================================================
# HELPER FUNCTIONS - Date Parsing
# =============================================================================

def _parse_date(date_obj) -> date:
    """
    Parse date from various formats (string, datetime, date object)
    
    Handles:
    - ISO strings: "2023-01-15"
    - Datetime strings: "2023-01-15T10:30:00Z"
    - Datetime objects
    - Date objects
    """
    if isinstance(date_obj, str):
        if 'T' in date_obj or '+' in date_obj or date_obj.endswith('Z'):
            return datetime.fromisoformat(date_obj.replace('Z', '+00:00')).date()
        return datetime.fromisoformat(date_obj).date()
    elif isinstance(date_obj, datetime):
        return date_obj.date()
    elif isinstance(date_obj, date):
        return date_obj
    else:
        raise ValueError(f"Unsupported date type: {type(date_obj)}")


# =============================================================================
# HELPER FUNCTIONS - Portfolio Calculations
# =============================================================================

def _get_positions_at_date(
    transactions: List[Dict],
    target_date: date,
    before: bool = False
) -> Dict:
    """
    Calculate what you owned on a specific date
    
    HOW IT WORKS:
    1. Loop through all transactions
    2. Stop at target_date
    3. Sum up: buys add shares, sells subtract shares
    
    PARAMETERS:
    - before=True: Get positions BEFORE target_date (for year start)
    - before=False: Get positions ON OR BEFORE target_date (for year end)
    
    EXAMPLE:
      Transactions:
      - 2022-06-15: Buy 10 AAPL
      - 2023-03-20: Buy 5 AAPL
      - 2023-08-10: Sell 3 AAPL
      
      _get_positions_at_date(txns, 2023-12-31, before=False)
      → {AAPL: 12 shares} (10 + 5 - 3)
      
      _get_positions_at_date(txns, 2023-01-01, before=True)
      → {AAPL: 10 shares} (only June 2022 transaction)
    
    Returns:
      {ticker: {'shares': Decimal, 'currency': str}}
    """
    positions = defaultdict(lambda: {'shares': Decimal('0'), 'currency': 'EUR'})

    for txn in transactions:
        txn_date = _parse_date(txn['date'])

        # Decide if transaction should be included
        if before:
            if txn_date >= target_date:
                continue  # Skip transactions on or after target date
        else:
            if txn_date > target_date:
                continue  # Skip transactions after target date

        ticker = txn['ticker']
        shares = Decimal(str(txn['shares']))
        currency = txn.get('currency', 'EUR')

        positions[ticker]['currency'] = currency

        if txn['type'] == 'dividend':
            continue

        if txn['type'] == 'buy':
            positions[ticker]['shares'] += shares
        else:  # sell
            positions[ticker]['shares'] -= shares

    # Remove zero or negative positions (should not happen, but defensive)
    return {
        ticker: pos for ticker, pos in positions.items()
        if pos['shares'] > Decimal('0.0001')
    }


def _calculate_portfolio_value(
    positions: Dict,
    prices: Dict[str, float]
) -> Decimal:
    """
    Calculate total portfolio value in EUR
    
    FORMULA:
      Portfolio Value = SUM(shares × price × exchange_rate)
    
    EXAMPLE:
      Positions:
      - AAPL: 10 shares @ $180 (USD)
      - MSFT: 5 shares @ $400 (USD)
      - ASML: 2 shares @ €800 (EUR)
      
      Exchange Rate: $1 = €0.92
      
      Value = (10 × $180 × 0.92) + (5 × $400 × 0.92) + (2 × €800 × 1)
            = €1,656 + €1,840 + €1,600
            = €5,096
    
    Returns:
      Total value in EUR (Decimal)
    """
    from logic.currency_service import convert_to_eur

    total = Decimal('0')

    missing_prices = []

    for ticker, pos in positions.items():
        shares = pos['shares']
        price = prices.get(ticker, 0)
        currency = pos.get('currency', 'EUR')

        if shares > 0 and price == 0:
            # Track tickers with missing prices (will be valued at $0)
            missing_prices.append(ticker)

        if price > 0 and shares > 0:
            value = shares * Decimal(str(price))
            value_eur = Decimal(str(convert_to_eur(float(value), currency)))
            total += value_eur

    # Warn about missing prices - these positions are valued at $0 which corrupts calculations
    if missing_prices:
        logger.warning(
            f"⚠️ Missing prices for {len(missing_prices)} ticker(s): {', '.join(missing_prices)}. "
            f"These positions are valued at €0 which may cause incorrect gain calculations."
        )

    return total


# =============================================================================
# STEP 1: Calculate Per-Ticker Breakdown for a Year
# =============================================================================

def _calculate_ticker_breakdown_for_year(
    year_txns: List[Dict],
    positions_start: Dict,
    positions_end: Dict,
    prices_start: Dict,
    prices_end: Dict
) -> List[Dict]:
    """
    Calculate performance for each individual ticker (stock) in a year
    
    WHAT IT SHOWS:
    - How many shares you had at start/end
    - Value at start/end (in ticker's native currency)
    - How much you invested/withdrew
    - Gain/loss for this ticker
    - % return
    
    WHY NATIVE CURRENCY:
    - AAPL gains shown in USD (what you see in your brokerage)
    - ASML gains shown in EUR
    - Matches your broker statements
    
    EXAMPLE:
      AAPL in 2023:
      - Jan 1: 10 shares @ $150 = $1,500
      - Bought: 5 shares @ $160 = $800
      - Dec 31: 15 shares @ $180 = $2,700
      
      Calculation:
      - Invested: $800
      - Value Change: $2,700 - $1,500 = +$1,200
      - Gain: $1,200 - $800 = $400
      - Gain %: $400 / ($1,500 + $800) × 100 = +17.4%
    
    Returns:
      List of ticker performance dicts
    """
    from logic.currency_service import convert_to_eur

    breakdown = []

    # Get all tickers that existed in this year
    all_tickers = set(
        list(positions_start.keys()) + 
        list(positions_end.keys()) + 
        [txn['ticker'] for txn in year_txns]
    )

    for ticker in all_tickers:
        # Get positions (shares owned)
        shares_start = positions_start.get(ticker, {}).get('shares', Decimal('0'))
        shares_end = positions_end.get(ticker, {}).get('shares', Decimal('0'))
        currency = positions_start.get(ticker, {}).get('currency') or \
                   positions_end.get(ticker, {}).get('currency', 'EUR')

        # Get prices
        price_start = Decimal(str(prices_start.get(ticker, 0)))
        price_end = Decimal(str(prices_end.get(ticker, 0)))

        # Calculate values in NATIVE CURRENCY (what user sees)
        value_start_native = shares_start * price_start
        value_end_native = shares_end * price_end

        # Calculate values in EUR (for totals)
        value_start_eur = convert_to_eur(float(value_start_native), currency)
        value_end_eur = convert_to_eur(float(value_end_native), currency)

        # Get trades for this ticker (exclude dividends from trade count)
        ticker_trades = [txn for txn in year_txns if txn['ticker'] == ticker]
        trade_count = sum(1 for txn in ticker_trades if txn['type'] != 'dividend')

        # Calculate invested/withdrawn in NATIVE CURRENCY (exclude dividends)
        invested_native = sum(
            Decimal(str(txn['shares'])) * Decimal(str(txn['price']))
            for txn in ticker_trades if txn['type'] == 'buy'
        )

        withdrawn_native = sum(
            Decimal(str(txn['shares'])) * Decimal(str(txn['price']))
            for txn in ticker_trades if txn['type'] == 'sell'
        )

        # Calculate invested/withdrawn in EUR (for validation, exclude dividends)
        invested_eur = sum(
            convert_to_eur(
                float(Decimal(str(txn['shares'])) * Decimal(str(txn['price']))),
                txn.get('currency', 'EUR')
            )
            for txn in ticker_trades if txn['type'] == 'buy'
        )

        withdrawn_eur = sum(
            convert_to_eur(
                float(Decimal(str(txn['shares'])) * Decimal(str(txn['price']))),
                txn.get('currency', 'EUR')
            )
            for txn in ticker_trades if txn['type'] == 'sell'
        )

        # Calculate gain in NATIVE CURRENCY
        # Formula: (End Value - Start Value) - (Invested - Withdrawn)
        gain_native = value_end_native - value_start_native - (invested_native - withdrawn_native)

        # Calculate gain in EUR (for totals)
        gain_eur = value_end_eur - value_start_eur - (invested_eur - withdrawn_eur)

        # Calculate gain percentage using native currency
        gain_pct = 0
        if value_start_native + invested_native > 0:
            gain_pct = (gain_native / (value_start_native + invested_native)) * 100

        breakdown.append({
            'ticker': ticker,
            'currency': currency,
            'shares_start': round(float(shares_start), 4),
            'shares_end': round(float(shares_end), 4),
            'value_start': round(float(value_start_native), 2),  # Native currency
            'value_end': round(float(value_end_native), 2),      # Native currency
            'invested': round(float(invested_native), 2),        # Native currency
            'withdrawn': round(float(withdrawn_native), 2),      # Native currency
            'gain': round(float(gain_native), 2),                # Native currency
            'gain_pct': round(float(gain_pct), 2),
            'trade_count': trade_count,
            # EUR values for backend validation/logging
            'value_start_eur': round(value_start_eur, 2),
            'value_end_eur': round(value_end_eur, 2),
            'gain_eur': round(gain_eur, 2)
        })

    return breakdown


# =============================================================================
# STEP 2: Calculate Single Year Performance
# =============================================================================

def _calculate_year_performance(
    transactions: List[Dict],
    year_start: date,
    year_end: date,
    current_prices: Dict[str, float]
) -> Dict:
    """
    Calculate portfolio performance for one calendar year
    
    WORKFLOW:
    1. Get positions at Jan 1 (what you owned at year start)
    2. Get positions at Dec 31 (what you owned at year end)
    3. Get prices at both dates
    4. Calculate beginning/ending balance
    5. Sum up cash flows (money in/out during year)
    6. Calculate gain: (ending - beginning) - cash flows
    
    SKIP YEAR IF:
    - No transactions AND
    - No positions at start (nothing carried over from previous year)
    
    GAIN FORMULA:
      Total Gain = (Ending Balance - Beginning Balance) - Net Deposits
      
      This isolates PERFORMANCE from CASH FLOWS
    
    EXAMPLE:
      2023 Performance:
      - Jan 1: €10,000 (10 AAPL @ $150)
      - Bought: €5,000 (5 MSFT @ $400)
      - Sold: €2,000 (2 AAPL @ $160)
      - Dec 31: €14,500
      
      Calculation:
      - Beginning: €10,000
      - Ending: €14,500
      - Invested: €5,000
      - Withdrawn: €2,000
      - Net Deposits: €5,000 - €2,000 = €3,000
      - Gain: (€14,500 - €10,000) - €3,000 = €1,500
      - Gain %: €1,500 / (€10,000 + €5,000) × 100 = +10%
    
    Returns:
      Year performance dict or None if year should be skipped
    """
    from logic.prices.history import get_prices_at_date
    from logic.currency_service import convert_to_eur

    today = date.today()
    # For current year, report only up to today (not Dec 31)
    period_end = today if year_start <= today <= year_end else year_end

    # Get transactions in this year (up to report period end)
    year_txns = [
        txn for txn in transactions
        if year_start <= _parse_date(txn['date']) <= period_end
    ]

    # Calculate positions at year boundaries
    positions_start = _get_positions_at_date(transactions, year_start, before=True)
    positions_end = _get_positions_at_date(transactions, period_end, before=False)

    # Skip year if no activity and no positions
    if not year_txns and not positions_start:
        return None

    # Get prices at year boundaries
    tickers = set(list(positions_start.keys()) + list(positions_end.keys()))
    prices_start = get_prices_at_date(list(tickers), year_start)

    # For period end: use current prices for current year, otherwise historical
    if period_end == today:
        prices_end = current_prices
    else:
        prices_end = get_prices_at_date(list(tickers), period_end)

    # Calculate balances
    beginning_balance = _calculate_portfolio_value(positions_start, prices_start)
    ending_balance = _calculate_portfolio_value(positions_end, prices_end)

    # Calculate cash flows (money in/out, exclude dividends)
    total_invested = Decimal('0')
    total_withdrawn = Decimal('0')
    trade_count = 0

    for txn in year_txns:
        if txn['type'] == 'dividend':
            continue

        trade_count += 1
        shares = Decimal(str(txn['shares']))
        price = Decimal(str(txn['price']))
        currency = txn.get('currency', 'EUR')

        value = shares * price
        value_eur = Decimal(str(convert_to_eur(float(value), currency)))

        if txn['type'] == 'buy':
            total_invested += value_eur
        else:  # sell
            total_withdrawn += value_eur

    net_deposits = total_invested - total_withdrawn

    # Calculate gain
    # Formula: (Ending - Beginning) - Net Deposits
    # This isolates performance from cash flows
    total_gain = ending_balance - beginning_balance - net_deposits

    # Calculate gain percentage
    # Denominator: Starting value + New investments
    total_gain_pct = 0
    if beginning_balance + total_invested > 0:
        total_gain_pct = (total_gain / (beginning_balance + total_invested)) * 100

    # Per-ticker breakdown (which stocks performed best)
    ticker_breakdown = _calculate_ticker_breakdown_for_year(
        year_txns, positions_start, positions_end, prices_start, prices_end
    )

    return {
        'year': year_start.year,
        'is_current_year': period_end == today,
        'start_date': year_start.isoformat(),
        'end_date': period_end.isoformat(),
        'beginning_balance': round(float(beginning_balance), 2),
        'ending_balance': round(float(ending_balance), 2),
        'total_invested': round(float(total_invested), 2),
        'total_withdrawn': round(float(total_withdrawn), 2),
        'net_deposits': round(float(net_deposits), 2),
        'total_gain': round(float(total_gain), 2),
        'total_gain_pct': round(float(total_gain_pct), 2),
        'trade_count': trade_count,
        'tickers': ticker_breakdown
    }


# =============================================================================
# STEP 3: Calculate All-Time Performance
# =============================================================================

def _calculate_all_time_performance(
    transactions: List[Dict],
    current_prices: Dict[str, float]
) -> Dict:
    """
    Calculate total performance since you started investing
    
    SIMPLER THAN YEARLY:
    - Beginning Balance: €0 (you started from zero)
    - Ending Balance: Current portfolio value
    - Total Gain: Current value - Net deposits
    
    FORMULA:
      Total Gain = Current Portfolio Value - (Total Invested - Total Withdrawn)
      Gain % = Total Gain / Total Invested × 100
    
    EXAMPLE:
      All-Time Performance:
      - Started: Jan 2021 (from €0)
      - Total Invested: €50,000 (over 4 years)
      - Total Withdrawn: €5,000 (some sells)
      - Current Value: €52,000
      
      Calculation:
      - Net Deposits: €50,000 - €5,000 = €45,000
      - Total Gain: €52,000 - €45,000 = €7,000
      - Gain %: €7,000 / €50,000 × 100 = +14%
      
      Explanation: You put in €50k (net), it's now worth €52k,
                   so you gained €7k (+14% return)
    
    Returns:
      All-time performance dict
    """
    from logic.currency_service import convert_to_eur

    if not transactions:
        return {}

    start_date = _parse_date(transactions[0]['date'])
    end_date = date.today()

    # Get final positions (what you own today)
    positions_end = _get_positions_at_date(transactions, end_date, before=False)
    ending_balance = _calculate_portfolio_value(positions_end, current_prices)

    # Calculate total cash flows (all money in/out, exclude dividends)
    total_invested = Decimal('0')
    total_withdrawn = Decimal('0')
    trade_count = sum(1 for txn in transactions if txn['type'] != 'dividend')

    for txn in transactions:
        if txn['type'] == 'dividend':
            continue

        shares = Decimal(str(txn['shares']))
        price = Decimal(str(txn['price']))
        currency = txn.get('currency', 'EUR')

        value = shares * price
        value_eur = Decimal(str(convert_to_eur(float(value), currency)))

        if txn['type'] == 'buy':
            total_invested += value_eur
        else:
            total_withdrawn += value_eur

    net_deposits = total_invested - total_withdrawn

    # Total gain = current value - net deposits
    # (Everything you have now - everything you put in)
    total_gain = ending_balance - net_deposits

    # Gain percentage (return on invested capital)
    total_gain_pct = 0
    if total_invested > 0:
        total_gain_pct = (total_gain / total_invested) * 100

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'beginning_balance': 0,  # Started from zero
        'ending_balance': round(float(ending_balance), 2),
        'total_invested': round(float(total_invested), 2),
        'total_withdrawn': round(float(total_withdrawn), 2),
        'net_deposits': round(float(net_deposits), 2),
        'total_gain': round(float(total_gain), 2),
        'total_gain_pct': round(float(total_gain_pct), 2),
        'trade_count': trade_count
    }


# =============================================================================
# MAIN FUNCTION: Calculate Annual Performance
# =============================================================================

def calculate_annual_performance(
    transactions: List[Dict],
    current_prices: Dict[str, float]
) -> Dict:
    """
    Calculate detailed annual performance reports
    
    WHAT IT RETURNS:
    {
      'years': [
        {2021 performance}, 
        {2022 performance},
        {2023 performance},
        ...
      ],
      'all_time': {total performance}
    }
    
    WORKFLOW:
    1. Get all years in portfolio (first transaction year → current year)
    2. For each year: Calculate performance (STEP 2)
    3. Calculate all-time total (STEP 3)
    4. Return both yearly and all-time data
    
    EXAMPLE OUTPUT:
    {
      'years': [
        {
          'year': 2021,
          'beginning_balance': 0,
          'ending_balance': 10000,
          'total_invested': 10000,
          'total_withdrawn': 0,
          'net_deposits': 10000,
          'total_gain': 0,
          'total_gain_pct': 0,
          'trade_count': 5,
          'tickers': [{AAPL performance}, {MSFT performance}]
        },
        {
          'year': 2022,
          'beginning_balance': 10000,
          'ending_balance': 12500,
          'total_invested': 5000,
          'total_withdrawn': 0,
          'net_deposits': 5000,
          'total_gain': -2500,  # Down year!
          'total_gain_pct': -16.7,
          'trade_count': 3,
          'tickers': [...]
        }
      ],
      'all_time': {
        'beginning_balance': 0,
        'ending_balance': 52000,
        'total_invested': 50000,
        'total_withdrawn': 5000,
        'net_deposits': 45000,
        'total_gain': 7000,
        'total_gain_pct': 14.0,
        'trade_count': 47
      }
    }
    
    Args:
        transactions: List of transaction dicts
        current_prices: Dict[ticker, current_price] for today's valuations
    
    Returns:
        Dict with 'years' list and 'all_time' summary
    """
    if not transactions:
        return {
            'years': [],
            'all_time': {
                'start_date': None,
                'end_date': None,
                'beginning_balance': 0,
                'ending_balance': 0,
                'total_invested': 0,
                'total_withdrawn': 0,
                'net_deposits': 0,
                'total_gain': 0,
                'total_gain_pct': 0,
                'trade_count': 0
            }
        }

    # Sort transactions by date
    sorted_txns = sorted(transactions, key=lambda x: _parse_date(x['date']))

    # Get date range (first transaction year → current year)
    start_date = _parse_date(sorted_txns[0]['date'])
    end_date = date.today()

    # Get all years in range (e.g., 2021, 2022, 2023, 2024)
    years = list(range(start_date.year, end_date.year + 1))

    logger.info(f"📊 Calculating annual performance for {len(years)} years")

    # Calculate performance for each year
    annual_data = []

    for year in years:
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)

        year_perf = _calculate_year_performance(
            sorted_txns, year_start, year_end, current_prices
        )

        if year_perf:  # Only include years with activity or positions
            annual_data.append(year_perf)
            logger.info(
                f"  {year}: €{year_perf['ending_balance']:.0f} "
                f"({year_perf['total_gain_pct']:+.1f}%, "
                f"{year_perf['trade_count']} trades)"
            )

    # Ensure continuity: beginning_balance of year N == ending_balance of year N-1
    # NOTE: This adjustment ensures smooth year-to-year transitions when historical prices
    # differ slightly from end-of-year prices (due to price data timing, currency fluctuations).
    # The per-ticker breakdown is NOT recalculated - it uses raw price-based calculations.
    # Therefore: sum(ticker gains) may not exactly equal adjusted total_gain.
    for idx in range(1, len(annual_data)):
        prev_end = Decimal(str(annual_data[idx - 1]['ending_balance']))
        cur = annual_data[idx]
        original_beginning = cur['beginning_balance']

        cur['beginning_balance'] = round(float(prev_end), 2)

        # Track if adjustment was made (for debugging/transparency)
        adjustment = round(float(prev_end), 2) - original_beginning
        if abs(adjustment) > 0.01:
            cur['beginning_balance_adjusted'] = True
            cur['adjustment_amount'] = round(adjustment, 2)
            logger.debug(
                f"  {cur['year']}: Adjusted beginning balance by €{adjustment:.2f} "
                f"(from €{original_beginning:.2f} to €{cur['beginning_balance']:.2f})"
            )

        # Recalculate gains based on adjusted beginning balance
        ending_balance = Decimal(str(cur['ending_balance']))
        net_deposits = Decimal(str(cur['net_deposits']))
        total_invested = Decimal(str(cur['total_invested']))

        total_gain = ending_balance - prev_end - net_deposits
        cur['total_gain'] = round(float(total_gain), 2)

        denom = prev_end + total_invested
        cur['total_gain_pct'] = round(float((total_gain / denom) * 100), 2) if denom > 0 else 0.0

    # Calculate all-time metrics
    all_time = _calculate_all_time_performance(sorted_txns, current_prices)
    logger.info(
        f"📈 All-Time: €{all_time['ending_balance']:.0f} "
        f"({all_time['total_gain_pct']:+.1f}% total return)"
    )

    return {
        'years': annual_data,
        'all_time': all_time
    }
