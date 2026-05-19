"""
Import endpoints for BeskarFolio
localStorage-only architecture: parses broker CSVs, returns transactions
Handles IBKR CSV imports
"""
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

# Rate limiter for this module
limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


@router.post("/api/import/demo")
@limiter.limit("10/minute")
async def import_demo(request: Request, mode: str = Query(default="replace")):
    """
    Load demo portfolio for testing and exploration
    
    Returns realistic sample transactions for a ~€15k portfolio with 5 holdings.
    Simulates a young professional doing DCA (Dollar-Cost Averaging) over 12 months.
    
    Portfolio breakdown:
    - 60% ETFs: VWCE.DE (40%), SXR8.DE (20%) - monthly/quarterly DCA
    - 40% Stocks: AAPL (15%), MSFT (15%), GOOGL (10%) - strategic purchases
    
    Frontend will store these in localStorage.
    
    Args:
        mode: "replace" (default) - for consistency with other import endpoints
    
    Returns:
        {
            "success": true,
            "imported_count": 24,
            "transactions": [...],
            "message": "Demo portfolio loaded"
        }
    """
    try:
        # Realistic demo portfolio: DCA strategy over 12 months (~€15k)
        # Story: Young professional investing €500-800/month since March 2024
        # Strategy: 60% ETFs (core), 40% individual stocks (satellite)
        # Prices from actual historical CSV data
        demo_transactions = [
            # VWCE.DE (Vanguard All-World UCITS ETF) - Core holding, 40% of portfolio
            # Monthly DCA: ~€350/month for diversified global exposure
            {"date": "2024-03-15", "ticker": "VWCE.DE", "shares": 3, "price": 114.80, "type": "buy", "currency": "EUR"},
            {"date": "2024-04-15", "ticker": "VWCE.DE", "shares": 3, "price": 115.60, "type": "buy", "currency": "EUR"},
            {"date": "2024-05-15", "ticker": "VWCE.DE", "shares": 3, "price": 119.80, "type": "buy", "currency": "EUR"},
            {"date": "2024-07-15", "ticker": "VWCE.DE", "shares": 3, "price": 124.88, "type": "buy", "currency": "EUR"},
            {"date": "2024-08-15", "ticker": "VWCE.DE", "shares": 3, "price": 121.74, "type": "buy", "currency": "EUR"},
            {"date": "2024-09-15", "ticker": "VWCE.DE", "shares": 3, "price": 122.14, "type": "buy", "currency": "EUR"},
            {"date": "2024-10-15", "ticker": "VWCE.DE", "shares": 3, "price": 128.72, "type": "buy", "currency": "EUR"},
            {"date": "2024-11-15", "ticker": "VWCE.DE", "shares": 3, "price": 131.36, "type": "buy", "currency": "EUR"},
            {"date": "2024-12-15", "ticker": "VWCE.DE", "shares": 3, "price": 135.96, "type": "buy", "currency": "EUR"},
            {"date": "2025-01-08", "ticker": "VWCE.DE", "shares": 3, "price": 135.06, "type": "buy", "currency": "EUR"},
            
            # SXR8.DE (iShares Core S&P 500) - Second ETF, 20% of portfolio
            # Quarterly purchases: ~€550 every 3 months
            {"date": "2024-03-20", "ticker": "SXR8.DE", "shares": 1, "price": 509.10, "type": "buy", "currency": "EUR"},
            {"date": "2024-06-20", "ticker": "SXR8.DE", "shares": 1, "price": 539.66, "type": "buy", "currency": "EUR"},
            {"date": "2024-09-20", "ticker": "SXR8.DE", "shares": 1, "price": 539.72, "type": "buy", "currency": "EUR"},
            {"date": "2024-12-20", "ticker": "SXR8.DE", "shares": 1, "price": 606.42, "type": "buy", "currency": "EUR"},
            
            # AAPL (Apple) - Individual stock #1, 15% of portfolio
            # Bought on dips: 3 strategic purchases
            {"date": "2024-04-10", "ticker": "AAPL", "shares": 5, "price": 167.78, "type": "buy", "currency": "USD"},
            {"date": "2024-08-05", "ticker": "AAPL", "shares": 4, "price": 209.27, "type": "buy", "currency": "USD"},
            {"date": "2024-11-20", "ticker": "AAPL", "shares": 3, "price": 229.00, "type": "buy", "currency": "USD"},
            
            # MSFT (Microsoft) - Individual stock #2, 15% of portfolio
            # Similar strategy: 3 purchases
            {"date": "2024-05-13", "ticker": "MSFT", "shares": 2, "price": 413.72, "type": "buy", "currency": "USD"},
            {"date": "2024-09-09", "ticker": "MSFT", "shares": 2, "price": 405.72, "type": "buy", "currency": "USD"},
            {"date": "2024-12-10", "ticker": "MSFT", "shares": 2, "price": 443.33, "type": "buy", "currency": "USD"},
            
            # GOOGL (Alphabet) - Individual stock #3, 10% of portfolio
            # 2 purchases during growth opportunities
            {"date": "2024-06-05", "ticker": "GOOGL", "shares": 10, "price": 174.36, "type": "buy", "currency": "USD"},
            {"date": "2024-10-15", "ticker": "GOOGL", "shares": 8, "price": 164.88, "type": "buy", "currency": "USD"},
            
            # Rebalancing: Sold some AAPL after strong gains
            {"date": "2024-12-27", "ticker": "AAPL", "shares": 2, "price": 255.59, "type": "sell", "currency": "USD"},
        ]
        
        logger.info(f"📦 Demo portfolio loaded: {len(demo_transactions)} transactions")
        
        return {
            "success": True,
            "imported_count": len(demo_transactions),
            "transactions": demo_transactions,
            "message": f"Demo portfolio loaded: {len(demo_transactions)} transactions, 5 holdings (~€15k)",
        }
    
    except Exception as e:
        logger.error(f"Error loading demo portfolio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/import/ibkr")
@limiter.limit("10/minute")
async def import_ibkr(request: Request, file: UploadFile = File(...)):
    """
    Parse Interactive Brokers (IBKR) CSV export
    
    LocalStorage-only architecture:
    - Backend parses IBKR activity statement format
    - Returns transactions for frontend localStorage storage
    - Handles Trades section from IBKR activity statement
    """
    try:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="File must be a CSV")

        content = await file.read()
        file_content = content.decode('utf-8')

        from importers.ibkr import convert_ibkr_to_transactions
        transactions, stats = convert_ibkr_to_transactions(file_content)

        return {
            "success": True,
            "imported_count": len(transactions),
            "transactions": transactions,
            "stats": stats,
            "message": f"Parsed {len(transactions)} transaction(s) from IBKR CSV.",
        }

    except Exception as e:
        logger.error(f"Error importing IBKR CSV: {e}")
        raise HTTPException(status_code=500, detail=str(e))
