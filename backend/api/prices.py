"""
Price-related endpoints for BeskarFolio
localStorage-only architecture: price caching and fetching services

Performance optimizations:
- /api/prices/latest: Single request returns all latest prices (precomputed)
- In-memory cache with file mtime invalidation
- Minimal payload for fast frontend loading
"""
import logging
import json
from pathlib import Path
from typing import List, Optional, Dict, Any
import requests as http_requests
from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.error_handling import raise_unexpected_error
from config import settings

from logic.models import (
    HistoricalPriceStatusResponse,
    LatestPriceItem,
    PriceStatusResponse,
    PriceUpdateRequest,
)
from logic.prices.read_model import (
    get_52week_ranges,
    get_all_latest_prices,
    get_price_range,
    get_price_status,
)
from logic.prices.refresh import PriceRefreshMode, refresh_prices
from logic.prices.service import (
    get_all_prices,
    get_historical_file_status_for_ticker,
    update_all_prices,
)
from logic.prices.storage import PricePersistenceError, list_historical_tickers
# Currency rates are returned by get_exchange_rates endpoint

logger = logging.getLogger(__name__)

# Rate limiter for this module
limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


@router.get("/api/prices/latest", response_model=Dict[str, LatestPriceItem])
async def latest_prices():
    """
    Get all latest prices in one request.
    
    Optimized for frontend:
    - Single HTTP request for all prices
    - Minimal payload (no age_hours, status calculations)
    - Uses mtime-based cache (fast, invalidated on file change)
    
    Response: {
        "AAPL": {"price": 185.64, "date": "2026-01-10", "currency": "USD"},
        "VWCE.DE": {"price": 125.30, "date": "2026-01-10", "currency": "EUR"}
    }
    """
    try:
        prices = get_all_latest_prices()
        return prices
    except Exception as e:
        raise_unexpected_error(logger, "Error getting latest prices", e, str(e))


@router.get("/api/prices/{ticker}/range")
async def prices_range(
    ticker: str,
    from_date: str,
    to_date: Optional[str] = None
):
    """
    Get historical prices for a ticker within date range.
    
    Use this when you need historical data (charts, TWR calculations).
    For current prices, use /api/prices/latest instead.
    
    Args:
        ticker: Stock ticker (e.g., AAPL, VWCE.DE)
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD), defaults to today
    
    Response: [
        {"date": "2026-01-01", "close": 180.50},
        {"date": "2026-01-02", "close": 182.30}
    ]
    """
    try:
        return get_price_range(ticker, from_date, to_date)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"No price data for {ticker.upper().strip()}",
        )
    except Exception as e:
        raise_unexpected_error(logger, f"Error getting price range for {ticker}", e, str(e))


@router.get("/api/prices/52week-range")
async def prices_52week_range() -> Dict[str, Dict[str, Any]]:
    """
    Get 52-week high/low for every ticker with cached history.

    Single request, minimal payload. Window is the trailing 52 weeks
    (365 days) relative to each ticker's most recent close date, so
    partial histories still return a meaningful range.

    Response: {
        "AAPL": {"high": 210.12, "low": 161.03, "as_of": "2026-01-10", "currency": "USD"},
        ...
    }

    Tickers with no cached history are omitted from the response.
    """
    try:
        return get_52week_ranges()
    except Exception as e:
        raise_unexpected_error(logger, "Error computing 52-week ranges", e, str(e))


@router.get("/api/prices/status", response_model=PriceStatusResponse)
async def prices_status(details: bool = False) -> PriceStatusResponse:
    """
    Get price status summary.

    Returns summary counts by default (fast, small payload).
    Use ?details=true for full per-ticker list (large payload for many tickers).

    Response:
    - has_prices: bool
    - prices_count: total ticker count
    - last_update: most recent price fetch timestamp (snapshot or CSV fallback)
    - status_counts: {cached, recent, stale} counts
    - prices: (only if details=true) full ticker list
    """
    try:
        return get_price_status(details=details, prices=get_all_prices())
    except Exception as e:
        raise_unexpected_error(logger, "Error getting price status", e, str(e))


@router.get("/api/prices/historical-status", response_model=HistoricalPriceStatusResponse)
async def historical_price_status(
    tickers: Optional[str] = None, 
    refresh_only: bool = False
) -> HistoricalPriceStatusResponse:
    """
    Report which tickers have historical CSV price coverage
    
    LocalStorage-only architecture:
    - Accepts optional comma-separated ticker list
    - refresh_only=true: Only returns portfolio tickers (fast, for refreshing)
    - refresh_only=false: Returns all CSV files + portfolio tickers (slower, for initial load)
    """
    try:
        requested: List[str] = []
        if tickers:
            requested = sorted({t.strip().upper() for t in tickers.split(",") if t.strip()})

        # Get portfolio ticker status
        portfolio = [get_historical_file_status_for_ticker(t) for t in requested] if requested else []
        logger.info(f"📊 Portfolio tickers requested: {len(requested)}, status fetched: {len(portfolio)}")
        if portfolio:
            with_csv = [p for p in portfolio if p.get('has_csv')]
            without_csv = [p for p in portfolio if not p.get('has_csv')]
            logger.info(f"   - With CSV: {len(with_csv)}, Without CSV: {len(without_csv)}")
            if without_csv:
                logger.warning(f"   - Tickers missing CSV: {[p.get('ticker') for p in without_csv]}")
        
        # Only exclude tickers that HAVE CSV files (not just requested tickers)
        portfolio_with_csv = {row.get("ticker") for row in portfolio if row.get("has_csv")}
        
        # If refresh_only, skip scanning all CSV files (much faster)
        csv_only = []
        if not refresh_only:
            csv_tickers = list_historical_tickers()
            logger.info(f"📁 CSV files found on server: {len(csv_tickers)}")
            csv_status_by_ticker = {t: get_historical_file_status_for_ticker(t) for t in csv_tickers}
            csv_only = [
                csv_status_by_ticker[t]
                for t in sorted(csv_status_by_ticker.keys())
                if t not in portfolio_with_csv  # Only exclude tickers that have CSV AND are in portfolio
            ]
            logger.info(f"📤 Returning: portfolio={len(portfolio)}, csv_only={len(csv_only)}")
        
        return {
            "success": True,
            "portfolio": portfolio,
            "csv_only": csv_only,
        }

    except Exception as e:
        raise_unexpected_error(logger, "Error getting historical price status", e, str(e))


@router.post("/api/prices/update")
@limiter.limit("10/minute")
async def update_prices(request: Request, price_request: PriceUpdateRequest = None, force: bool = False):
    """
    Update intraday price snapshots with smart caching.
    
    Rate limit: 10 requests/minute (expensive external API calls)
    
    Historical CSV files remain one-row-per-day close history only.
    This endpoint refreshes the mutable intraday snapshot layer used by the UI.
    """
    try:
        tickers = None
        force_refresh = force

        if price_request:
            tickers = price_request.tickers
            force_refresh = price_request.force or force

        if tickers:
            try:
                report = refresh_prices(
                    tickers,
                    mode=PriceRefreshMode.MANUAL,
                    force_refresh=force_refresh,
                )
            except PricePersistenceError as exc:
                logger.error(f"Price refresh persistence failed: {exc}")
                raise HTTPException(
                    status_code=503,
                    detail=f"Fetched price data but could not persist it to disk: {exc}",
                ) from exc

            return report.to_http_response()

        return update_all_prices(force_refresh=force_refresh)

    except HTTPException:
        # Re-raise so FastAPI returns the structured status/detail we set above.
        raise
    except Exception as e:
        raise_unexpected_error(logger, "Error updating prices", e, str(e))


@router.get("/api/exchange-rates")
async def get_exchange_rates():
    """Get current exchange rates (updated daily by cron job)"""
    try:
        # Read from file (updated daily by cron job)
        rates_file = Path(settings.DATA_DIR) / 'exchange_rates.json'
        
        if rates_file.exists():
            with open(rates_file, 'r') as f:
                data = json.load(f)
                return {
                    "success": True,
                    "rates": {
                        "EUR_USD": data.get("EUR_USD", 1.09),
                        "USD_EUR": data.get("USD_EUR", 0.92)
                    },
                    "updated_at": data.get("updated_at"),
                    "source": "daily_cron"
                }
        
        # Fallback to default rates if file doesn't exist
        logger.warning("Exchange rates file not found, using defaults")
        return {
            "success": True,
            "rates": {
                "EUR_USD": 1.09,
                "USD_EUR": 0.92
            },
            "updated_at": None,
            "source": "default"
        }
    except Exception as e:
        raise_unexpected_error(logger, "Error getting exchange rates", e, str(e))


# ============================================================================
# TICKER PROFILE ENDPOINTS (Sector, Industry, Country, ETF detection)
# ============================================================================

# ETF patterns for detection (suffix-based)
ETF_PATTERNS = ['.DE', 'VWCE', 'SXR', 'IWDA', 'EUNL', 'CSPX', 'VOO', 'VTI', 'QQQ', 'SPY', 'IVV', 'VUG', 'VTV', 'VGT']

# Region detection from exchange/country
REGION_MAP = {
    'US': 'US', 'United States': 'US',
    'DE': 'EU', 'Germany': 'EU', 'FR': 'EU', 'France': 'EU', 
    'NL': 'EU', 'Netherlands': 'EU', 'IT': 'EU', 'Italy': 'EU',
    'GB': 'EU', 'UK': 'EU', 'United Kingdom': 'EU',
    'IE': 'EU', 'Ireland': 'EU', 'ES': 'EU', 'Spain': 'EU',
    'CN': 'Asia/EM', 'China': 'Asia/EM', 'HK': 'Asia/EM', 'Hong Kong': 'Asia/EM',
    'JP': 'Asia/EM', 'Japan': 'Asia/EM', 'TW': 'Asia/EM', 'Taiwan': 'Asia/EM',
    'KR': 'Asia/EM', 'South Korea': 'Asia/EM', 'IN': 'Asia/EM', 'India': 'Asia/EM',
    'BR': 'Asia/EM', 'Brazil': 'Asia/EM', 'MX': 'Asia/EM', 'Mexico': 'Asia/EM',
}

# Sector normalization (Finnhub uses different names)
SECTOR_NORMALIZE = {
    # Tech-related
    'Technology': 'Tech',
    'Information Technology': 'Tech',
    
    # Finance-related (keep Banking separate for visibility)
    'Financials': 'Finance',
    'Financial Services': 'Finance',
    # 'Banking' stays as 'Banking' - has its own color
    
    # Consumer-related (keep Retail separate for visibility)
    'Consumer Cyclical': 'Consumer',
    'Consumer Discretionary': 'Consumer',
    'Consumer Defensive': 'Consumer',
    'Consumer Staples': 'Consumer',
    # 'Retail' stays as 'Retail' - has its own color
    
    # Healthcare
    'Healthcare': 'Healthcare',
    'Health Care': 'Healthcare',
    
    # Industrials
    'Industrials': 'Cyclicals',
    'Industrial Goods': 'Cyclicals',
    
    # Materials
    'Basic Materials': 'Materials',
    # 'Materials' stays as 'Materials' - has its own color
    
    # Energy
    'Energy': 'Energy',
    'Utilities': 'Utilities',  # Keep separate
    
    # Communications / Media (keep as-is for visibility)
    'Communication Services': 'Communications',
    # 'Media' stays as 'Media' - has its own color
    
    # Real Estate
    'Real Estate': 'Real Estate',  # Keep as-is
    
    # Semiconductors (keep as-is - common and important)
    # 'Semiconductors' stays as 'Semiconductors' - has its own color
    
    # Travel & Leisure (cruise lines, hotels, airlines)
    'Hotels, Restaurants & Leisure': 'Travel',
    'Leisure Products': 'Travel',
    'Leisure Facilities': 'Travel',
    'Airlines': 'Travel',
    'Hotels & Motels': 'Travel',
    'Casinos & Gaming': 'Travel',
    'Resorts & Casinos': 'Travel',
}


def _is_etf_by_pattern(ticker: str) -> bool:
    """Detect ETF by ticker pattern (fallback)"""
    upper = ticker.upper()
    for pattern in ETF_PATTERNS:
        if pattern in upper:
            return True
    # Common ETF suffixes
    if ticker.endswith('.DE') and any(x in ticker.upper() for x in ['SXR', 'VWCE', 'IWDA', 'EUNL']):
        return True
    return False


def _get_region_from_country(country: str) -> str:
    """Map country to region"""
    if not country:
        return 'US'  # Default
    return REGION_MAP.get(country, REGION_MAP.get(country[:2].upper(), 'US'))


def _normalize_sector(sector: str) -> str:
    """Normalize sector names to our standard set"""
    if not sector:
        return 'Other'
    return SECTOR_NORMALIZE.get(sector, sector if len(sector) < 15 else 'Other')


@router.get("/api/tickers/{ticker}/profile")
@limiter.limit("60/minute")
async def get_ticker_profile(request: Request, ticker: str):
    """
    Get ticker profile with sector, industry, country, and ETF classification.
    
    Uses Finnhub API when available, falls back to pattern-based detection.
    Results should be cached in frontend localStorage for fast subsequent access.
    
    Returns:
        - ticker: string
        - name: string (company/fund name)
        - sector: string (normalized: Tech, Finance, Consumer, Healthcare, Cyclicals, Energy, Other, ETF/Index)
        - industry: string (detailed industry)
        - country: string (2-letter code)
        - region: string (US, EU, Asia/EM)
        - isETF: boolean
        - exchange: string
        - source: string (finnhub, fallback)
    """
    ticker = ticker.upper().strip()
    
    # Try Finnhub first
    finnhub_key = getattr(settings, "FINNHUB_API_KEY", "")
    
    if finnhub_key:
        try:
            # Finnhub stock profile endpoint
            url = "https://finnhub.io/api/v1/stock/profile2"
            params = {"symbol": ticker, "token": finnhub_key}
            
            resp = http_requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            
            if data and data.get("name"):
                # Detect if ETF (Finnhub doesn't have explicit field, use patterns)
                is_etf = _is_etf_by_pattern(ticker)
                
                country = data.get("country", "US")
                sector = _normalize_sector(data.get("finnhubIndustry", ""))
                
                # ETFs get special sector
                if is_etf:
                    sector = "ETF/Index"
                
                return {
                    "success": True,
                    "ticker": ticker,
                    "name": data.get("name", ticker),
                    "sector": sector,
                    "industry": data.get("finnhubIndustry", ""),
                    "country": country,
                    "region": _get_region_from_country(country),
                    "isETF": is_etf,
                    "exchange": data.get("exchange", ""),
                    "currency": data.get("currency", "USD"),
                    "source": "finnhub"
                }
        except Exception as e:
            logger.warning(f"Finnhub profile fetch failed for {ticker}: {e}")
    
    # Fallback: pattern-based detection
    is_etf = _is_etf_by_pattern(ticker)
    
    # Detect region from ticker suffix
    region = "US"
    if ticker.endswith('.DE') or ticker.endswith('.F'):
        region = "EU"
    elif ticker.endswith('.PA') or ticker.endswith('.AS') or ticker.endswith('.MI') or ticker.endswith('.L'):
        region = "EU"
    elif ticker.endswith('.HK') or ticker.endswith('.T') or ticker.endswith('.SS'):
        region = "Asia/EM"
    
    return {
        "success": True,
        "ticker": ticker,
        "name": ticker,  # Unknown without API
        "sector": "ETF/Index" if is_etf else "Other",
        "industry": "",
        "country": "DE" if region == "EU" else ("HK" if region == "Asia/EM" else "US"),
        "region": region,
        "isETF": is_etf,
        "exchange": "",
        "currency": "EUR" if region == "EU" else "USD",
        "source": "fallback"
    }


@router.post("/api/tickers/profiles/batch")
@limiter.limit("20/minute")
async def get_ticker_profiles_batch(request: Request, tickers: List[str]):
    """
    Get profiles for multiple tickers in one request.
    
    Uses Finnhub API with rate limiting (60/min).
    Frontend should cache results in localStorage.
    
    Returns:
        - profiles: dict of ticker -> profile data
        - errors: list of tickers that failed
    """
    import time
    
    if len(tickers) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tickers per batch")
    
    profiles = {}
    errors = []
    
    finnhub_key = getattr(settings, "FINNHUB_API_KEY", "")
    
    for i, ticker in enumerate(tickers):
        ticker = ticker.upper().strip()
        
        # Rate limiting: small delay between requests
        if i > 0 and finnhub_key:
            time.sleep(0.1)  # 100ms delay = max 600/min (under Finnhub's 60/min limit is per endpoint)
        
        try:
            if finnhub_key:
                url = "https://finnhub.io/api/v1/stock/profile2"
                params = {"symbol": ticker, "token": finnhub_key}
                
                resp = http_requests.get(url, params=params, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                
                if data and data.get("name"):
                    is_etf = _is_etf_by_pattern(ticker)
                    country = data.get("country", "US")
                    sector = _normalize_sector(data.get("finnhubIndustry", ""))
                    
                    if is_etf:
                        sector = "ETF/Index"
                    
                    profiles[ticker] = {
                        "ticker": ticker,
                        "name": data.get("name", ticker),
                        "sector": sector,
                        "industry": data.get("finnhubIndustry", ""),
                        "country": country,
                        "region": _get_region_from_country(country),
                        "isETF": is_etf,
                        "exchange": data.get("exchange", ""),
                        "currency": data.get("currency", "USD"),
                        "source": "finnhub"
                    }
                    continue
            
            # Fallback for this ticker
            is_etf = _is_etf_by_pattern(ticker)
            region = "US"
            if ticker.endswith('.DE') or ticker.endswith('.F'):
                region = "EU"
            elif ticker.endswith('.PA') or ticker.endswith('.AS'):
                region = "EU"
            
            profiles[ticker] = {
                "ticker": ticker,
                "name": ticker,
                "sector": "ETF/Index" if is_etf else "Other",
                "industry": "",
                "country": "DE" if region == "EU" else "US",
                "region": region,
                "isETF": is_etf,
                "exchange": "",
                "currency": "EUR" if region == "EU" else "USD",
                "source": "fallback"
            }
            
        except Exception as e:
            logger.warning(f"Failed to get profile for {ticker}: {e}")
            errors.append(ticker)
    
    return {
        "success": True,
        "profiles": profiles,
        "errors": errors,
        "count": len(profiles)
    }
