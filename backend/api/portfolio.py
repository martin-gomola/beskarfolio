"""
Portfolio calculation endpoints for BeskarFolio
localStorage-only architecture: accepts transactions, returns calculations

Performance optimizations:
- Parallel price fetching (~5x faster for 10+ tickers)
"""
import logging
from typing import List
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.error_handling import raise_invalid_request, raise_unexpected_error
from config import settings

# Rate limiter for this module
limiter = Limiter(key_func=get_remote_address)
from logic.models import PortfolioCalculationResponse, PortfolioSummary, MAX_TRANSACTIONS
from logic.prices.history import ensure_historical_prices_with_timeout
from logic.prices.read_model import get_all_prices
from logic.portfolio_valuation import value_portfolio
from logic.portfolio_state import (
    build_holdings_state,
    build_ticker_currency_map,
    normalize_transactions,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/portfolio/calculate", response_model=PortfolioCalculationResponse)
@limiter.limit("30/minute")
async def calculate_portfolio(
    request: Request,
    transactions: List[dict],
    background_tasks: BackgroundTasks,
) -> PortfolioCalculationResponse:
    """
    Calculate portfolio from transactions (localStorage-only architecture)
    
    Rate limit: 30 requests/minute (CPU intensive calculations)
    
    Backend is stateless:
    - Accepts transaction array from frontend localStorage
    - Calculates holdings and summary
    - Returns results (frontend displays them)
    
    Input: Array of transactions
    Output: Holdings + Summary (total value, gains, etc.)
    """
    try:
        # Security: Limit transaction array size
        if len(transactions) > MAX_TRANSACTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Too many transactions (max {MAX_TRANSACTIONS})"
            )
        
        # Empty portfolio case
        if not transactions:
            return {
                "success": True,
                "summary": PortfolioSummary(
                    success=True,
                    transaction_count=0,
                    total_value=0,
                    total_invested=0,
                    total_gain_loss=0,
                    total_gain_loss_pct=0,
                    holdings_count=0
                ),
                "holdings": []
            }

        # Schedule historical price fetching (if enabled)
        if settings.AUTO_FETCH_HISTORICAL:
            try:
                background_tasks.add_task(
                    ensure_historical_prices_with_timeout,
                    [{'ticker': t['ticker'], 'date': t['date']} for t in transactions],
                )
            except Exception as e:
                logger.warning(f"Could not schedule historical price fetch: {e}")

        normalized_transactions = normalize_transactions(transactions)
        tickers = list(build_holdings_state(normalized_transactions).keys())
        prices = get_all_prices(
            tickers=tickers,
            ticker_currencies=build_ticker_currency_map(normalized_transactions),
        )
        summary, holdings = value_portfolio(normalized_transactions, prices)

        return PortfolioCalculationResponse(
            success=True,
            summary=summary,
            holdings=holdings,
        )

    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as e:
        raise_invalid_request(logger, "Invalid portfolio request", e, detail_prefix="Invalid transaction data")
    except Exception as e:
        raise_unexpected_error(logger, "Error calculating portfolio", e, "Failed to calculate portfolio")
