"""
IBKR AI Chat export adapter

Converts IBKR AI Chat transaction export to BeskarFolio format.
Handles both Buy and Sell transactions from IBKR's copy-paste format.
"""
import csv
import io
import logging
from datetime import datetime
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

# IBKR Symbol to Market Ticker Mapping
# IBKR uses internal symbols that need to be mapped to actual market tickers
IBKR_SYMBOL_MAP = {
    # European ETFs (Xetra)
    'VWCE': 'VWCE.DE',      # Vanguard FTSE All-World UCITS ETF
    'CNDX': 'SXRV.DE',      # iShares Nasdaq 100 UCITS ETF (IBKR calls it CNDX, real ticker is SXRV.DE)
    'XSX6': 'XSXR.DE',      # Xtrackers STOXX Europe 600 UCITS ETF

    # European Stocks
    'MOHd': 'MC.PA',        # LVMH (Paris Euronext)

    # Add more mappings as needed
    # Format: 'IBKR_SYMBOL': 'ACTUAL_TICKER'
}

# Currency detection for EUR tickers
EUR_TICKERS = {
    'VWCE.DE', 'SXRV.DE', 'XSXR.DE', 'MC.PA',  # Actual tickers
    'VWCE', 'CNDX', 'XSX6', 'MOHd'              # IBKR symbols (backup)
}


def parse_ibkr_number(value: str) -> float:
    """
    Parse IBKR number format (removes commas, handles negatives)
    Examples: "14,101.01" -> 14101.01, "-26.0000" -> -26.0
    """
    if not value:
        return 0.0
    # Remove commas and convert to float
    cleaned = value.strip().replace(',', '')
    return float(cleaned)


def parse_ibkr_content(content: str) -> Tuple[List[Dict[str, str]], Dict[str, int]]:
    """
    Parse IBKR AI Chat export (tab-separated format)

    Expected columns:
    - Date
    - Transaction type (Buy/Sell)
    - Security name
    - Symbol
    - Net quantity
    - Average price
    - Total amount

    Args:
        content: Tab-separated content from IBKR AI chat export

    Returns:
        - transactions: List of transaction dictionaries
        - stats: Parsing statistics (buy_count, sell_count, skipped_currency, etc.)
    """
    lines = content.splitlines()

    # IBKR AI Chat format has headers on separate lines, not tab-separated
    # Example:
    # Date
    # Transaction type
    # Security name
    # ...
    # 2022-01-26    Buy    ISHARES...    CNDX    5.0000    723.92    -3,619.60

    # Skip all header lines (lines without tabs or that are just column names)
    transaction_lines = []
    header_keywords = ['Date', 'Transaction type', 'Security name', 'Symbol',
                      'Net quantity', 'Average price', 'Total amount',
                      'Total trades', 'Total proceeds', 'Buy Trades', 'Sell Transactions']

    for line in lines:
        line = line.strip()

        # Skip empty lines
        if not line:
            continue

        # Skip header lines (single column names without tabs)
        if line in header_keywords:
            continue

        # Skip summary lines
        if line.startswith('Total') or line.startswith('Buy Trades') or line.startswith('Sell Transactions'):
            continue

        # Only include lines with tabs (actual data rows)
        if '\t' in line:
            transaction_lines.append(line)

    if not transaction_lines:
        raise ValueError("No transaction data found in IBKR export")

    # Parse transactions using tab delimiter
    stats = {
        'buy_count': 0,
        'sell_count': 0,
        'skipped_currency': 0,
        'skipped_invalid': 0
    }

    transactions = []

    # Use tab as delimiter for IBKR AI chat format
    reader = csv.DictReader(
        io.StringIO('\n'.join(transaction_lines)),
        delimiter='\t',
        fieldnames=['Date', 'Transaction type', 'Security name', 'Symbol', 'Net quantity', 'Average price', 'Total amount']
    )

    for row in reader:
        try:
            # Skip if missing essential fields
            if not row.get('Symbol') or not row.get('Date'):
                stats['skipped_invalid'] += 1
                continue

            symbol = row['Symbol'].strip()

            # Skip currency conversion transactions (EUR.USD)
            if symbol == 'EUR.USD' or 'EUR.USD' in symbol:
                stats['skipped_currency'] += 1
                continue

            # Parse transaction type
            trans_type = row.get('Transaction type', '').strip().lower()
            if trans_type not in ['buy', 'sell']:
                stats['skipped_invalid'] += 1
                continue

            # Track statistics
            if trans_type == 'buy':
                stats['buy_count'] += 1
            else:
                stats['sell_count'] += 1

            transactions.append(row)

        except Exception as e:
            logger.warning(f"Error parsing IBKR transaction row: {e}")
            stats['skipped_invalid'] += 1
            continue

    return transactions, stats


def format_date(date_str: str) -> str:
    """Convert date from 'YYYY-MM-DD' format (already in correct format)"""
    if not date_str:
        return ''

    try:
        # IBKR format is already YYYY-MM-DD
        date_obj = datetime.strptime(date_str.strip(), '%Y-%m-%d')
        return date_obj.strftime('%Y-%m-%d')
    except ValueError:
        return date_str


def convert_ibkr_to_transactions(content: str) -> Tuple[List[Dict[str, str]], Dict[str, int]]:
    """
    Convert IBKR AI Chat export to BeskarFolio transaction format

    Args:
        content: Tab-separated content from IBKR AI chat

    Returns:
        - import_data: List of transactions in BeskarFolio format
        - stats: Conversion statistics
    """
    # Parse IBKR content
    transactions, stats = parse_ibkr_content(content)

    import_data = []
    stats['mapped_symbols'] = 0  # Track how many symbols were mapped

    for txn in transactions:
        try:
            # Get ticker from IBKR (preserve original case for mapping)
            ibkr_symbol = txn['Symbol'].strip()

            # Map IBKR symbol to actual market ticker
            # Check both original case and uppercase in mapping
            actual_ticker = IBKR_SYMBOL_MAP.get(ibkr_symbol)
            if not actual_ticker:
                actual_ticker = IBKR_SYMBOL_MAP.get(ibkr_symbol.upper())

            if actual_ticker:
                # Symbol was mapped
                stats['mapped_symbols'] += 1
            else:
                # No mapping found, use original symbol
                actual_ticker = ibkr_symbol.upper()

            date = format_date(txn.get('Date', ''))
            trans_type = txn.get('Transaction type', '').strip().lower()

            # Parse quantity (remove commas, handle negatives)
            quantity_str = txn.get('Net quantity', '0')
            quantity = abs(parse_ibkr_number(quantity_str))  # Use absolute value

            # Parse price (remove commas)
            price_str = txn.get('Average price', '0')
            price = parse_ibkr_number(price_str)

            # Skip if essential data is missing
            if not actual_ticker or not date or quantity == 0 or price == 0:
                stats['skipped_invalid'] = stats.get('skipped_invalid', 0) + 1
                continue

            # Detect currency from the actual ticker symbol
            currency = 'USD'  # Default to USD
            if actual_ticker in EUR_TICKERS or actual_ticker.endswith('.DE') or actual_ticker.endswith('.PA'):
                currency = 'EUR'

            import_data.append({
                'ticker': actual_ticker,
                'type': trans_type,  # 'buy' or 'sell' - MUST be 'type' not 'transaction_type'
                'date': date,
                'shares': str(quantity),
                'price': str(price),
                'currency': currency
            })

        except Exception as e:
            logger.warning(f"Error converting IBKR transaction: {e}")
            stats['skipped_invalid'] = stats.get('skipped_invalid', 0) + 1
            continue

    # Sort by date
    import_data.sort(key=lambda x: x['date'])

    stats['converted_count'] = len(import_data)

    return import_data, stats
