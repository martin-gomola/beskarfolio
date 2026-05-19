"""
Centralized configuration for BeskarFolio backend
All environment variables and constants should be defined here

BeskarFolio is localStorage-only (no database).
All user data is stored in the browser's localStorage.
Backend provides stateless calculation services only.
"""
import os
import re
from typing import List, Optional

# Application version - single source of truth
APP_VERSION = "1.8.0"


class Settings:
    """Application settings from environment variables"""

    # Historical price fetching safety switch:
    # - When true, transaction add/edit/import may schedule background yfinance history fetches.
    # - On public deployments, set this to false to prevent abuse and only fetch via terminal/cron.
    AUTO_FETCH_HISTORICAL: bool = os.getenv("AUTO_FETCH_HISTORICAL", "true").lower() in ("true", "1", "yes")

    # ==========================================================================
    # SECURITY CONFIGURATION
    # ==========================================================================
    
    # API Key for external access (optional but recommended for public deployments)
    # Set via environment variable: BESKARFOLIO_API_KEY=your-secret-key
    # Requests from allowed CORS origins (browser) don't need the key
    # External requests (curl, scripts) need: X-API-Key header
    API_KEY: Optional[str] = os.getenv("BESKARFOLIO_API_KEY", "").strip() or None
    
    # CORS Configuration - allowed browser origins (comma-separated in .env)
    # Default: localhost only (safe default)
    _cors_env = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8080")
    CORS_ORIGINS: List[str] = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]
    
    # Trusted hosts - bypass API key check (comma-separated in .env)
    # Default: localhost only (safe default)
    _trusted_env = os.getenv("TRUSTED_HOSTS", "localhost,127.0.0.1")
    TRUSTED_HOSTS: List[str] = [host.strip() for host in _trusted_env.split(",") if host.strip()]

    # Data Directories
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(BASE_DIR, "data")
    HISTORICAL_PRICES_DIR = os.path.join(DATA_DIR, "historical_prices")
    LATEST_PRICES_FILE = os.path.join(DATA_DIR, "latest_prices.json")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Yahoo Finance (retry strategy for failed requests)
    YF_RETRY_ATTEMPTS: int = 3
    YF_BACKOFF_FACTOR: int = 1

    # Price Provider (optional)
    #
    # - PRICE_PROVIDER=auto (default): use FMP if FMP_API_KEY is set, otherwise use Yahoo (yfinance)
    # - PRICE_PROVIDER=fmp: force FMP (requires FMP_API_KEY)
    # - PRICE_PROVIDER=finnhub: force Finnhub (requires FINNHUB_API_KEY)
    # - PRICE_PROVIDER=yahoo: force Yahoo (yfinance)
    #
    # Note: FMP free tier (post Aug 31, 2025) uses /stable endpoint, not /api/v3
    PRICE_PROVIDER: str = os.getenv("PRICE_PROVIDER", "auto").strip().lower()
    FMP_API_KEY: str = os.getenv("FMP_API_KEY", "").strip()
    FMP_BASE_URL: str = os.getenv("FMP_BASE_URL", "https://financialmodelingprep.com/stable").strip()

    # Finnhub API (60 calls/minute free tier - excellent for personal use)
    FINNHUB_API_KEY: str = os.getenv("FINNHUB_API_KEY", "").strip()
    FINNHUB_BASE_URL: str = "https://finnhub.io/api/v1"

    # Twelve Data API (800 calls/day free tier, good EU/international coverage)
    TWELVE_DATA_API_KEY: str = os.getenv("TWELVE_DATA_API_KEY", "").strip()

    # Price snapshot freshness (hours)
    # We refresh intraday snapshots at most once every 4 hours during trading
    # hours. Historical CSV files remain daily-close history only.
    PRICE_CACHE_HOURS: float = float(os.getenv("PRICE_CACHE_HOURS", "4.0"))

    # Request Throttling (prevents rate limiting)
    # Add random delays between API calls to avoid pattern detection
    PRICE_FETCH_DELAY_MIN: float = float(os.getenv("PRICE_FETCH_DELAY_MIN", "0.5"))
    PRICE_FETCH_DELAY_MAX: float = float(os.getenv("PRICE_FETCH_DELAY_MAX", "1.5"))

    @classmethod
    def sanitize_ticker(cls, ticker: str) -> str:
        """
        Sanitize ticker symbol to prevent path traversal attacks.
        
        Security: Removes any characters that could be used for path traversal
        (e.g., '../', '/', '\\') and only allows alphanumeric + dots.
        
        Examples:
            'AAPL' -> 'AAPL'
            'VWCE.DE' -> 'VWCE.DE'
            '../etc/passwd' -> 'etcpasswd' (sanitized)
            'AAPL/../../etc' -> 'AAPLetc' (sanitized)
        """
        if not ticker:
            return ""
        # Remove path separators and dangerous characters first
        sanitized = ticker.replace('/', '').replace('\\', '').replace('..', '')
        # Only allow alphanumeric characters and dots (for European tickers like VWCE.DE)
        sanitized = re.sub(r'[^a-zA-Z0-9.]', '', sanitized)
        # Remove leading/trailing dots (prevent hidden files)
        sanitized = sanitized.strip('.')
        # Limit length to prevent extremely long filenames
        return sanitized[:20].upper()

    @classmethod
    def get_historical_price_path(cls, ticker: str) -> str:
        """
        Get path to historical price CSV for a ticker
        Single source of truth: historical_prices/*.csv (latest row = current price)
        
        Security: Ticker is sanitized to prevent path traversal attacks.
        """
        safe_ticker = cls.sanitize_ticker(ticker)
        if not safe_ticker:
            raise ValueError(f"Invalid ticker: {ticker}")
        filename = f"{safe_ticker.replace('.', '_')}_prices.csv"
        return os.path.join(cls.HISTORICAL_PRICES_DIR, filename)


# Singleton instance
settings = Settings()
