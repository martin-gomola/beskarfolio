"""
Transaction CSV parsing endpoints for BeskarFolio
localStorage-only architecture: frontend stores data, backend parses CSVs
"""
import io
import logging
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.error_handling import raise_unexpected_error
from config import settings

# Rate limiter for this module
limiter = Limiter(key_func=get_remote_address)
from logic.prices.history import ensure_historical_prices_with_timeout

logger = logging.getLogger(__name__)

# =============================================================================
# SECURITY LIMITS
# =============================================================================
MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024  # 10MB max CSV file size
MAX_CSV_ROWS = 10000  # Maximum number of transactions per import

router = APIRouter()


@router.post("/api/transactions/import")
@limiter.limit("10/minute")
async def import_csv(
    request: Request,
    file: UploadFile = File(...),
    mode: str = "add",  # add or replace
    background_tasks: BackgroundTasks = None
):
    """
    Parse CSV file and return transactions for frontend localStorage storage
    
    LocalStorage-only architecture:
    - Backend parses and validates CSV
    - Returns transactions to frontend
    - Frontend stores in localStorage
    
    CSV Format:
      date,ticker,shares,price,type,currency
      2024-01-15,AAPL,10,150.00,buy,USD
    
    Supported type column names: 'type', 'transaction_type'
    Supported date formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
    """
    try:
        content = await file.read()
        
        # Security: Check file size
        if len(content) > MAX_CSV_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"CSV file too large. Maximum size: {MAX_CSV_SIZE_BYTES // (1024*1024)}MB"
            )
        
        # Parse CSV with row limit
        df = pd.read_csv(io.BytesIO(content), nrows=MAX_CSV_ROWS + 1)
        
        # Security: Check row count
        if len(df) > MAX_CSV_ROWS:
            raise HTTPException(
                status_code=400,
                detail=f"CSV has too many rows. Maximum: {MAX_CSV_ROWS} transactions"
            )
        
        # Normalize column names (case-insensitive)
        df.columns = df.columns.str.lower().str.strip()
        
        # Handle both 'type' and 'transaction_type' column names
        if 'transaction_type' in df.columns and 'type' not in df.columns:
            df.rename(columns={'transaction_type': 'type'}, inplace=True)
        
        # Validate required columns
        required = {'date', 'ticker', 'shares', 'price', 'type'}
        missing = required - set(df.columns)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing)}"
            )
        
        # Normalize and validate
        df['type'] = df['type'].str.lower().str.strip()
        df['ticker'] = df['ticker'].str.upper().str.strip()
        
        # Add currency column if missing (default to EUR)
        if 'currency' not in df.columns:
            df['currency'] = 'EUR'
        
        # Parse dates (try multiple formats)
        def parse_date_flexible(date_str):
            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d']:
                try:
                    return pd.to_datetime(date_str, format=fmt)
                except (ValueError, TypeError):
                    continue
            raise ValueError(f"Could not parse date: {date_str}")
        
        df['date'] = df['date'].apply(parse_date_flexible)
        
        # Validate transaction types
        invalid_types = df[~df['type'].isin(['buy', 'sell'])]['type'].unique()
        if len(invalid_types) > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid transaction types: {', '.join(invalid_types)}. Must be 'buy' or 'sell'"
            )
        
        # Convert to list of transactions
        transactions = []
        for _, row in df.iterrows():
            transactions.append({
                'ticker': row['ticker'],
                'type': row['type'],
                'date': row['date'].strftime('%Y-%m-%d'),
                'shares': float(row['shares']),
                'price': float(row['price']),
                'currency': row['currency']
            })
        
        # Schedule historical price fetching (if enabled)
        if settings.AUTO_FETCH_HISTORICAL and background_tasks:
            unique_tickers = df[['ticker', 'date']].drop_duplicates()
            ticker_dates = [
                {'ticker': row['ticker'], 'date': row['date'].strftime('%Y-%m-%d')}
                for _, row in unique_tickers.iterrows()
            ]
            background_tasks.add_task(ensure_historical_prices_with_timeout, ticker_dates)
        
        return {
            "success": True,
            "message": f"Parsed {len(transactions)} transactions",
            "transactions": transactions,
            "mode": mode,
            "historical_prices_fetch": "scheduled" if settings.AUTO_FETCH_HISTORICAL else "disabled",
            "stats": {
                "total": len(transactions),
                "buys": len([t for t in transactions if t['type'] == 'buy']),
                "sells": len([t for t in transactions if t['type'] == 'sell']),
                "tickers": df['ticker'].nunique()
            }
        }
        
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {str(e)}")
    except Exception as e:
        raise_unexpected_error(logger, "Error parsing CSV", e, str(e))
