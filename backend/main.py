"""
BeskarFolio - Portfolio Tracker
localStorage-only architecture with stateless FastAPI backend

Backend provides calculation services only:
- Portfolio calculations (holdings, returns, performance)
- Tax-free share analysis (FIFO)
- Rebalancing recommendations
- Price fetching and caching

All user data is stored in browser's localStorage.
"""
import logging
from urllib.parse import urlparse
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import settings
from config.settings import APP_VERSION
from api import routes, admin, transactions, portfolio, prices, analytics, imports as import_routes, allocation, webmcp

# Rate limiter configuration
# Uses client IP for rate limiting (works behind reverse proxy with X-Forwarded-For)
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# Configure logging - write to console (Docker handles log files)
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Console only (Docker captures this)
    ]
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="BeskarFolio API",
    description="Stateless portfolio calculation API (localStorage-only architecture)",
    version=APP_VERSION,
)

# Configure rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS - only allow specific origins and methods
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
)


# =============================================================================
# SECURITY MIDDLEWARE
# =============================================================================

def _extract_hostname(url_or_host: str) -> str:
    """
    Safely extract hostname from a URL or host header.
    
    Examples:
        "https://example.com:8080/path" -> "example.com"
        "example.com:8080" -> "example.com"
        "localhost" -> "localhost"
        "" -> ""
    
    Security: Uses proper URL parsing to prevent bypass attacks like
    "malicious-localhost.com" matching "localhost".
    """
    if not url_or_host:
        return ""
    
    # If it looks like a full URL, parse it
    if url_or_host.startswith(("http://", "https://")):
        parsed = urlparse(url_or_host)
        return parsed.hostname or ""
    
    # Otherwise treat as host:port and extract just the host
    # Remove port if present
    if ":" in url_or_host:
        return url_or_host.split(":")[0]
    
    return url_or_host


def _is_trusted_host(origin: str, host: str, referer: str, trusted_hosts: list) -> bool:
    """
    Check if request is from a trusted host using exact matching.
    
    Security: Uses exact hostname comparison, not substring matching.
    This prevents bypass attacks where "malicious-localhost.com" would
    incorrectly match the trusted host "localhost".
    """
    # Extract hostnames from headers
    origin_host = _extract_hostname(origin)
    request_host = _extract_hostname(host)
    referer_host = _extract_hostname(referer)
    
    # Check each trusted host with exact matching
    for trusted in trusted_hosts:
        trusted_lower = trusted.lower().strip()
        if (origin_host.lower() == trusted_lower or
            request_host.lower() == trusted_lower or
            referer_host.lower() == trusted_lower):
            return True
    
    return False


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """
    Basic security middleware:
    - Allows requests from trusted hosts (same-origin browser requests)
    - Requires API key for external requests (if API_KEY is configured)
    - Always allows health check endpoint
    """
    # Always allow health check (for monitoring) and public discovery docs.
    # WebMCP/A2A manifests are intentionally public + CORS-open: they describe
    # only read-only endpoints and are fetched cross-origin by AI agents.
    if request.url.path in [
        "/health",
        "/",
        "/docs",
        "/openapi.json",
        "/.well-known/webmcp",
        "/.well-known/agent.json",
    ]:
        return await call_next(request)
    
    # Check if request is from a trusted host (same-origin)
    origin = request.headers.get("origin", "")
    host = request.headers.get("host", "")
    referer = request.headers.get("referer", "")
    
    # Use exact hostname matching (secure against bypass attacks)
    is_trusted = _is_trusted_host(origin, host, referer, settings.TRUSTED_HOSTS)
    
    # If from trusted host (browser request from our app), allow
    if is_trusted:
        return await call_next(request)
    
    # If API key is configured, require it for external requests
    if settings.API_KEY:
        api_key = request.headers.get("X-API-Key", "")
        if api_key != settings.API_KEY:
            logger.warning(f"🚫 Unauthorized request to {request.url.path} from {request.client.host}")
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Unauthorized",
                    "message": "API key required. Add X-API-Key header."
                }
            )
    
    return await call_next(request)


# Startup event
@app.on_event("startup")
async def startup_event():
    """Log startup info"""
    logger.info("🚀 BeskarFolio API started successfully")
    logger.info("📊 Architecture: localStorage-only (stateless backend)")
    logger.info(f"💾 Price cache: {settings.HISTORICAL_PRICES_DIR}")
    logger.info(f"🔒 CORS origins: {settings.CORS_ORIGINS}")
    if settings.API_KEY:
        logger.info("🔑 API key protection: ENABLED")
    else:
        logger.warning("⚠️  API key protection: DISABLED (set BESKARFOLIO_API_KEY to enable)")

# Include all route modules
app.include_router(routes.router)  # Health checks
app.include_router(transactions.router)  # Transaction CRUD
app.include_router(portfolio.router)  # Portfolio & holdings
app.include_router(prices.router)  # Price endpoints (latest, range, status, update)
app.include_router(analytics.router)  # Analytics (annual, tax-free, performance)
app.include_router(import_routes.router)  # Import endpoints (IBKR, demo)
app.include_router(allocation.router)  # Allocation & rebalancing
app.include_router(admin.router)  # Admin logs
app.include_router(webmcp.router)  # WebMCP / A2A discovery manifests

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8060, reload=True)
