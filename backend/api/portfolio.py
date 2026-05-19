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
from logic.prices.service import (
    get_all_prices,
)
from logic.currency_service import convert_to_eur
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
        holdings_dict = build_holdings_state(normalized_transactions)

        # Fetch current prices for all tickers
        tickers = list(holdings_dict.keys())
        ticker_currencies = build_ticker_currency_map(normalized_transactions)
        prices = get_all_prices(tickers=tickers, ticker_currencies=ticker_currencies)

        # Calculate holdings with current prices
        holdings = []
        total_value_eur = 0
        total_invested_eur = 0
        estimated_holdings_count = 0

        for ticker, data in holdings_dict.items():
            if data['total_shares'] <= 0:
                continue

            shares = data['total_shares']
            avg_buy_price = data['total_cost'] / shares
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
            invested_value = data['total_cost']
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

        # Calculate summary
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
