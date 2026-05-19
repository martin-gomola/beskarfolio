"""
Analytics endpoints for BeskarFolio
localStorage-only architecture: accepts transactions, returns analytics
Includes: Annual performance, tax-free shares, performance history
"""
import logging
from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.error_handling import raise_invalid_request, raise_unexpected_error
from logic.models import AnnualPerformanceRequest, AnnualPerformanceResponse, DividendSummaryResponse, PerformanceHistoryResponse, TaxFreeRequest, TaxFreeResponse

# Rate limiter for this module
limiter = Limiter(key_func=get_remote_address)
from logic.prices.service import get_all_prices
from logic.portfolio_state import build_ticker_currency_map, normalize_transactions

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/portfolio/annual-performance", response_model=AnnualPerformanceResponse)
@limiter.limit("20/minute")
async def calculate_annual_performance(
    request: Request,
    perf_request: AnnualPerformanceRequest,
) -> AnnualPerformanceResponse:
    """
    Calculate annual performance from transactions
    
    Rate limit: 20 requests/minute (CPU intensive)
    
    LocalStorage-only architecture:
    - Accepts transactions from frontend localStorage
    - Returns year-by-year performance breakdown
    """
    try:
        from logic.annual_performance import calculate_annual_performance as calc_annual
        
        if not perf_request.transactions:
            return AnnualPerformanceResponse(
                success=True,
                years=[],
                all_time={
                    "start_date": "",
                    "end_date": "",
                    "beginning_balance": 0,
                    "ending_balance": 0,
                    "total_invested": 0,
                    "total_withdrawn": 0,
                    "net_deposits": 0,
                    "total_gain": 0,
                    "total_gain_pct": 0,
                    "trade_count": 0,
                },
            )
        
        # Transactions are already dicts from localStorage
        # Just ensure numeric types are floats for calculations
        transactions = normalize_transactions(perf_request.transactions)
        
        # Get unique tickers
        tickers = list(set(t['ticker'] for t in transactions))
        
        # Get current prices
        prices_data = get_all_prices(
            tickers=tickers,
            ticker_currencies=build_ticker_currency_map(transactions),
        )
        current_prices = {ticker: data['price'] for ticker, data in prices_data.items()}
        
        # Calculate annual performance
        result = calc_annual(transactions, current_prices)
        # Return data directly (frontend expects years and all_time at top level)
        return AnnualPerformanceResponse(
            success=True,
            years=result.get("years", []),
            all_time=result.get("all_time", {}),
        )
        
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as e:
        raise_invalid_request(logger, "Invalid annual performance request", e)
    except Exception as e:
        raise_unexpected_error(
            logger,
            "Error calculating annual performance",
            e,
            "Failed to calculate annual performance",
        )


@router.post("/api/tax-free", response_model=TaxFreeResponse)
@limiter.limit("20/minute")
async def calculate_tax_free(request: Request, tax_request: TaxFreeRequest) -> TaxFreeResponse:
    """
    Calculate tax-free shares from transactions (Slovak 365-day rule)
    
    Rate limit: 20 requests/minute
    
    LocalStorage-only architecture:
    - Accepts transactions from frontend localStorage
    - Uses FIFO accounting to determine tax-free lots
    - Returns per-ticker breakdown of tax-free shares
    """
    try:
        from logic.tax_free import calculate_tax_free_from_transactions
        
        if not tax_request.transactions:
            return TaxFreeResponse(success=True, tax_free_holdings=[])
        
        tax_free_data = calculate_tax_free_from_transactions(tax_request.transactions)
        return TaxFreeResponse(success=True, tax_free_holdings=tax_free_data)
        
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as e:
        raise_invalid_request(logger, "Invalid tax-free request", e)
    except Exception as e:
        raise_unexpected_error(
            logger,
            "Error calculating tax-free shares",
            e,
            "Failed to calculate tax-free shares",
        )


@router.post("/api/portfolio/performance-history", response_model=PerformanceHistoryResponse)
@limiter.limit("20/minute")
async def calculate_performance_history(
    request: Request,
    perf_request: AnnualPerformanceRequest,
    benchmark: str = 'SXR8.DE',
) -> PerformanceHistoryResponse:
    """
    Calculate portfolio performance history vs benchmark
    
    Rate limit: 20 requests/minute (CPU intensive)
    
    LocalStorage-only architecture:
    - Accepts transactions from frontend localStorage
    - Calculates daily portfolio value and returns
    - Compares to benchmark (default: S&P 500 via SXR8.DE)
    """
    try:
        from logic.performance_history import calculate_performance_history
        
        if not perf_request.transactions:
            return PerformanceHistoryResponse(success=True, data_points=[])
        
        # Transactions are already dicts from localStorage
        # Just ensure numeric types are floats for calculations
        transactions = normalize_transactions(perf_request.transactions)
        
        # Get current prices for all tickers + benchmark
        tickers = set([t['ticker'] for t in transactions])
        tickers.add(benchmark)  # Include benchmark ticker
        current_prices = get_all_prices(
            tickers=list(tickers),
            ticker_currencies=build_ticker_currency_map(transactions),
        )
        
        result = calculate_performance_history(transactions, current_prices, benchmark_ticker=benchmark)
        return PerformanceHistoryResponse(success=True, data_points=result)
        
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as e:
        raise_invalid_request(logger, "Invalid performance history request", e)
    except Exception as e:
        raise_unexpected_error(
            logger,
            "Error calculating performance history",
            e,
            "Failed to calculate performance history",
            include_traceback=True,
        )


@router.post("/api/dividends/summary", response_model=DividendSummaryResponse)
@limiter.limit("20/minute")
async def calculate_dividend_summary(
    request: Request,
    perf_request: AnnualPerformanceRequest,
) -> DividendSummaryResponse:
    """
    Calculate dividend summary from transactions.

    Aggregates all dividend transactions by ticker and year,
    including gross amounts, withholding tax, and net received.
    """
    try:
        from collections import defaultdict

        if not perf_request.transactions:
            return DividendSummaryResponse(
                success=True,
                total_gross=0, total_tax=0, total_net=0,
                payment_count=0, by_ticker=[], by_year=[],
            )

        transactions = normalize_transactions(perf_request.transactions)
        dividends = [t for t in transactions if t["type"] == "dividend"]

        if not dividends:
            return DividendSummaryResponse(
                success=True,
                total_gross=0, total_tax=0, total_net=0,
                payment_count=0, by_ticker=[], by_year=[],
            )

        total_gross = 0.0
        total_tax = 0.0
        total_net = 0.0

        ticker_agg: dict = defaultdict(lambda: {
            "gross": 0.0, "tax": 0.0, "net": 0.0, "count": 0, "currency": "EUR",
        })
        year_agg: dict = defaultdict(lambda: {
            "gross": 0.0, "tax": 0.0, "net": 0.0, "count": 0,
        })

        for div in dividends:
            gross = div.get("gross_amount") or div["price"]
            tax = div.get("withholding_tax") or 0.0
            net = gross - tax
            year = div["date"][:4]

            total_gross += gross
            total_tax += tax
            total_net += net

            ta = ticker_agg[div["ticker"]]
            ta["gross"] += gross
            ta["tax"] += tax
            ta["net"] += net
            ta["count"] += 1
            ta["currency"] = div["currency"]

            ya = year_agg[year]
            ya["gross"] += gross
            ya["tax"] += tax
            ya["net"] += net
            ya["count"] += 1

        by_ticker = [
            {
                "ticker": ticker,
                "currency": data["currency"],
                "total_gross": round(data["gross"], 2),
                "total_tax": round(data["tax"], 2),
                "total_net": round(data["net"], 2),
                "payment_count": data["count"],
                "avg_withholding_pct": round(
                    (data["tax"] / data["gross"] * 100) if data["gross"] > 0 else 0, 1
                ),
            }
            for ticker, data in sorted(ticker_agg.items())
        ]

        by_year = [
            {
                "year": int(year),
                "total_gross": round(data["gross"], 2),
                "total_tax": round(data["tax"], 2),
                "total_net": round(data["net"], 2),
                "payment_count": data["count"],
            }
            for year, data in sorted(year_agg.items())
        ]

        return DividendSummaryResponse(
            success=True,
            total_gross=round(total_gross, 2),
            total_tax=round(total_tax, 2),
            total_net=round(total_net, 2),
            payment_count=len(dividends),
            by_ticker=by_ticker,
            by_year=by_year,
        )

    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as e:
        raise_invalid_request(logger, "Invalid dividend summary request", e)
    except Exception as e:
        raise_unexpected_error(
            logger,
            "Error calculating dividend summary",
            e,
            "Failed to calculate dividend summary",
        )
