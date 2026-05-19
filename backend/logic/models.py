"""
Pydantic models for BeskarFolio API.
"""
from typing import List, Optional
from pydantic import BaseModel, field_validator


# =============================================================================
# SECURITY LIMITS
# =============================================================================
MAX_TRANSACTIONS = 10000  # Maximum transactions per request
MAX_TICKER_LENGTH = 20  # Maximum ticker symbol length


class Transaction(BaseModel):
    ticker: str
    type: str  # 'buy', 'sell', or 'dividend'
    date: str
    shares: float
    price: float
    currency: str = "EUR"
    gross_amount: Optional[float] = None
    withholding_tax: Optional[float] = None

    @field_validator('ticker')
    @classmethod
    def validate_ticker(cls, v: str) -> str:
        if len(v) > MAX_TICKER_LENGTH:
            raise ValueError(f'Ticker too long (max {MAX_TICKER_LENGTH} chars)')
        return v.upper().strip()

    @field_validator('shares', 'price')
    @classmethod
    def validate_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError('Must be positive')
        return v

    @field_validator('type')
    @classmethod
    def validate_type(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ('buy', 'sell', 'dividend'):
            raise ValueError("Must be 'buy', 'sell', or 'dividend'")
        return v


class TransactionResponse(BaseModel):
    id: int
    ticker: str
    type: str
    date: str
    shares: float
    price: float
    currency: str
    total_value: float
    gross_amount: Optional[float] = None
    withholding_tax: Optional[float] = None


class HoldingResponse(BaseModel):
    ticker: str
    shares: float
    avg_buy_price: float
    current_price: float
    current_value: float
    invested_value: float
    gain_loss: float
    gain_loss_pct: float
    currency: str
    current_value_eur: float
    invested_value_eur: float
    price_status: str = "current"
    price_note: Optional[str] = None


class PortfolioSummary(BaseModel):
    success: bool
    transaction_count: int
    total_value: float
    total_invested: float
    total_gain_loss: float
    total_gain_loss_pct: float
    holdings_count: int
    estimated_holdings_count: int = 0


class PortfolioCalculationResponse(BaseModel):
    success: bool
    summary: PortfolioSummary
    holdings: List[HoldingResponse]


class LatestPriceItem(BaseModel):
    price: float
    date: str
    currency: str


class PriceStatusDetailItem(BaseModel):
    ticker: str
    price: float
    currency: str
    updated_at: Optional[str] = None
    age_hours: float
    price_date: Optional[str] = None
    status: str


class PriceStatusCounts(BaseModel):
    cached: int
    recent: int
    stale: int


class PriceStatusResponse(BaseModel):
    has_prices: bool
    last_update: Optional[str] = None
    prices_count: int
    status_counts: PriceStatusCounts
    prices: Optional[List[PriceStatusDetailItem]] = None


class HistoricalPriceFileStatusResponse(BaseModel):
    ticker: str
    has_csv: bool
    path: Optional[str] = None
    rows: Optional[int] = None
    csv_earliest_date: Optional[str] = None
    csv_latest_date: Optional[str] = None
    latest_price_date: Optional[str] = None
    file_size_kb: Optional[float] = None
    last_updated: Optional[str] = None
    price_age_hours: Optional[float] = None
    market_age_hours: Optional[float] = None
    price_source: Optional[str] = None


class HistoricalPriceStatusResponse(BaseModel):
    success: bool
    portfolio: List[HistoricalPriceFileStatusResponse]
    csv_only: List[HistoricalPriceFileStatusResponse]


class AllocationDriftItem(BaseModel):
    ticker: str
    currency: str
    current_shares: float
    current_value_eur: float
    current_weight_pct: float
    target_weight_pct: float
    drift_pct: float
    drift_value_eur: float
    action: str


class AllocationStatusResponse(BaseModel):
    success: bool
    total_value_eur: float
    total_drift_pct: float
    needs_rebalancing: bool
    drift_data: List[AllocationDriftItem]


class RebalanceTrade(BaseModel):
    ticker: str
    action: str
    shares: float
    price: float
    eur_value: float
    tax_free: Optional[bool] = None
    tax_liability_eur: float
    tax_savings_eur: float
    reason: str


class RebalancePlanSummary(BaseModel):
    total_trades: int
    total_sells_eur: float
    total_buys_eur: float
    cash_generated: float
    cash_used: float
    cash_remaining: float
    cash_needed: float
    cash_shortfall: float
    total_tax_liability: float
    tax_savings: float


class RebalancePlan(BaseModel):
    trades: List[RebalanceTrade]
    summary: RebalancePlanSummary
    needs_rebalancing: bool
    total_drift_pct: float


class RebalancePlanResponse(BaseModel):
    success: bool
    plan: RebalancePlan


class TickerBreakdownResponse(BaseModel):
    ticker: str
    currency: str
    shares_start: float
    shares_end: float
    value_start: float
    value_end: float
    invested: float
    withdrawn: float
    gain: float
    gain_pct: float
    trade_count: int


class YearPerformanceResponse(BaseModel):
    year: int
    is_current_year: bool
    start_date: str
    end_date: str
    beginning_balance: float
    ending_balance: float
    total_invested: float
    total_withdrawn: float
    net_deposits: float
    total_gain: float
    total_gain_pct: float
    trade_count: int
    tickers: List[TickerBreakdownResponse]
    beginning_balance_adjusted: Optional[bool] = None
    adjustment_amount: Optional[float] = None


class AllTimePerformanceResponse(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    beginning_balance: float
    ending_balance: float
    total_invested: float
    total_withdrawn: float
    net_deposits: float
    total_gain: float
    total_gain_pct: float
    trade_count: int


class AnnualPerformanceResponse(BaseModel):
    success: bool
    years: List[YearPerformanceResponse]
    all_time: AllTimePerformanceResponse


class TaxFreeLotResponse(BaseModel):
    date: str
    shares: float
    days_held: int
    is_tax_free: bool


class TaxFreeHoldingResponse(BaseModel):
    ticker: str
    total_shares: float
    tax_free_shares: float
    taxable_shares: float
    tax_free_pct: float
    next_tax_free_date: Optional[str] = None
    next_tax_free_shares: float
    currency: str
    oldest_lots: List[TaxFreeLotResponse]


class TaxFreeResponse(BaseModel):
    success: bool
    tax_free_holdings: List[TaxFreeHoldingResponse]


class DividendTickerSummary(BaseModel):
    ticker: str
    currency: str
    total_gross: float
    total_tax: float
    total_net: float
    payment_count: int
    avg_withholding_pct: float


class DividendYearSummary(BaseModel):
    year: int
    total_gross: float
    total_tax: float
    total_net: float
    payment_count: int


class DividendSummaryResponse(BaseModel):
    success: bool
    total_gross: float
    total_tax: float
    total_net: float
    payment_count: int
    by_ticker: List[DividendTickerSummary]
    by_year: List[DividendYearSummary]


class PerformanceHistoryPointResponse(BaseModel):
    date: str
    value: float
    invested: float
    portfolio_return_pct: float = 0.0
    benchmark_return_pct: float = 0.0


class PerformanceHistoryResponse(BaseModel):
    success: bool
    data_points: List[PerformanceHistoryPointResponse]


# Request models for guest mode endpoints
class AnnualPerformanceRequest(BaseModel):
    transactions: List[dict]

    @field_validator('transactions')
    @classmethod
    def validate_transactions_limit(cls, v: List[dict]) -> List[dict]:
        if len(v) > MAX_TRANSACTIONS:
            raise ValueError(f'Too many transactions (max {MAX_TRANSACTIONS})')
        return v


class PriceUpdateRequest(BaseModel):
    force: bool = False
    tickers: Optional[list[str]] = None


class TaxFreeRequest(BaseModel):
    transactions: Optional[List[dict]] = None

    @field_validator('transactions')
    @classmethod
    def validate_transactions_limit(cls, v: Optional[List[dict]]) -> Optional[List[dict]]:
        if v is not None and len(v) > MAX_TRANSACTIONS:
            raise ValueError(f'Too many transactions (max {MAX_TRANSACTIONS})')
        return v


class PerformanceHistoryRequest(BaseModel):
    """Request model for performance history endpoint"""
    transactions: List[dict]
    benchmark: Optional[str] = "SXR8.DE"

    @field_validator('transactions')
    @classmethod
    def validate_transactions_limit(cls, v: List[dict]) -> List[dict]:
        if len(v) > MAX_TRANSACTIONS:
            raise ValueError(f'Too many transactions (max {MAX_TRANSACTIONS})')
        return v
