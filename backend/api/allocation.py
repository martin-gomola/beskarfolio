"""
Portfolio Allocation & Rebalancing API
localStorage-only architecture: accepts transactions and targets, returns recommendations
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict

from api.error_handling import raise_invalid_request, raise_unexpected_error
from logic.allocation import (
    calculate_current_allocation,
    calculate_drift,
    generate_rebalancing_plan
)
from logic.models import AllocationStatusResponse, MAX_TRANSACTIONS, RebalancePlanResponse
from logic.prices.service import get_all_prices
from logic.portfolio_state import (
    build_open_holdings,
    build_ticker_currency_map,
    normalize_transactions,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class GuestAllocationStatusRequest(BaseModel):
    """Request for allocation status calculation"""
    transactions: List[dict]  # localStorage-only: transactions as dicts
    target_allocations: Dict[str, float]  # {ticker: weight_pct}

    @field_validator('transactions')
    @classmethod
    def validate_transactions_limit(cls, v: List[dict]) -> List[dict]:
        if len(v) > MAX_TRANSACTIONS:
            raise ValueError(f'Too many transactions (max {MAX_TRANSACTIONS})')
        return v


class RebalancePlanRequest(BaseModel):
    """Request for rebalancing plan generation"""
    transactions: List[dict]  # localStorage-only: transactions as dicts
    target_allocations: Dict[str, float]  # {ticker: weight_pct}
    cash_available: float = Field(default=0, ge=0, description="Cash available for buying (EUR)")
    can_sell: bool = Field(default=True, description="Allow selling to rebalance")
    minimum_trade_value: float = Field(default=100, ge=0, description="Minimum trade value (EUR)")
    rebalance_threshold: float = Field(default=5.0, ge=0, description="Rebalance if drift > X%")
    prioritize_tax_free: bool = Field(default=True, description="Prioritize selling tax-free shares")
    strategy: str = Field(default="sell_buy", description="Rebalancing strategy: 'sell_buy' or 'buy_only'")

    @field_validator('transactions')
    @classmethod
    def validate_transactions_limit(cls, v: List[dict]) -> List[dict]:
        if len(v) > MAX_TRANSACTIONS:
            raise ValueError(f'Too many transactions (max {MAX_TRANSACTIONS})')
        return v


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/api/allocation/status", response_model=AllocationStatusResponse)
async def get_allocation_status(request: GuestAllocationStatusRequest) -> AllocationStatusResponse:
    """
    Get allocation status from transactions
    
    LocalStorage-only architecture:
    - Accepts transactions from frontend localStorage
    - Accepts target allocations from frontend localStorage
    - Returns current allocation, drift, and rebalancing needs
    """
    try:
        # Debug logging
        logger.info(f"📥 Allocation status request: {len(request.transactions)} transactions")
        logger.info(f"📥 Target allocations: {request.target_allocations}")
        if request.transactions:
            logger.info(f"📥 First transaction: {request.transactions[0]}")
        normalized_transactions = normalize_transactions(request.transactions)
        holdings = build_open_holdings(normalized_transactions)
        ticker_currencies = build_ticker_currency_map(normalized_transactions)
        prices = get_all_prices(
            tickers=[holding["ticker"] for holding in holdings],
            ticker_currencies=ticker_currencies,
        )
        
        # Calculate current allocation
        current = calculate_current_allocation(holdings, prices)

        # Validate or auto-fill target allocations
        target_allocations = request.target_allocations
        if not target_allocations:
            # Auto-set targets to current weights so first run is 0% drift
            target_allocations = {
                ticker: data['weight_pct']
                for ticker, data in current['allocations'].items()
            }
            logger.info("ℹ️ No target_allocations provided; using current weights as targets for 0% drift baseline")
        
        # Calculate drift
        drift_data = calculate_drift(
            current['allocations'],
            target_allocations,
            current['total_value_eur']
        )
        
        # Calculate total drift
        total_drift = sum(abs(d['drift_pct']) for d in drift_data)
        needs_rebalancing = total_drift > 5.0
        
        return AllocationStatusResponse(
            success=True,
            total_value_eur=round(current['total_value_eur'], 2),
            total_drift_pct=round(total_drift, 2),
            needs_rebalancing=needs_rebalancing,
            drift_data=drift_data,
        )
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as e:
        raise_invalid_request(logger, "Invalid allocation request", e)
    except Exception as e:
        raise_unexpected_error(
            logger,
            "Failed to get allocation status",
            e,
            "Failed to calculate allocation status",
            include_traceback=True,
        )


@router.post("/api/allocation/rebalance-plan", response_model=RebalancePlanResponse)
async def get_rebalance_plan(request: RebalancePlanRequest) -> RebalancePlanResponse:
    """
    Generate rebalancing plan from transactions
    
    LocalStorage-only architecture:
    - Accepts transactions from frontend localStorage
    - Accepts target allocations from frontend localStorage
    - Returns recommended trades to achieve target allocation
    - Considers cash available, tax efficiency, and minimum trade values
    """
    try:
        normalized_transactions = normalize_transactions(request.transactions)
        holdings = build_open_holdings(normalized_transactions)
        ticker_currencies = build_ticker_currency_map(normalized_transactions)
        prices = get_all_prices(
            tickers=[holding["ticker"] for holding in holdings],
            ticker_currencies=ticker_currencies,
        )
        
        # Get target allocations
        target_allocations = request.target_allocations
        if not target_allocations:
            raise HTTPException(
                status_code=400,
                detail="target_allocations required in request body"
            )
        
        # Transactions are already dicts from localStorage
        # Just ensure numeric types are floats for calculations
        transactions_list = normalized_transactions
        
        # Calculate current allocation
        current = calculate_current_allocation(holdings, prices)
        
        # Calculate drift
        drift_data = calculate_drift(
            current['allocations'],
            target_allocations,
            current['total_value_eur']
        )
        
        # Determine if selling is allowed based on strategy
        # "buy_only" strategy NEVER allows selling, regardless of can_sell checkbox
        allow_selling = request.can_sell and request.strategy != "buy_only"
        
        # Generate rebalancing plan with correct parameters
        plan = generate_rebalancing_plan(
            drift_data=drift_data,
            prices=prices,
            transactions=transactions_list,
            cash_available=float(request.cash_available) if request.cash_available else 0.0,
            allow_selling=allow_selling,
            min_trade_value=float(request.minimum_trade_value) if request.minimum_trade_value else 100.0,
            use_tax_free_only=request.prioritize_tax_free
        )
        
        return RebalancePlanResponse(success=True, plan=plan)
        
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as e:
        raise_invalid_request(logger, "Invalid rebalance request", e)
    except Exception as e:
        raise_unexpected_error(
            logger,
            "Failed to generate rebalancing plan",
            e,
            "Failed to generate rebalancing plan",
        )
