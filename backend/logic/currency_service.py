"""
Currency conversion service for BeskarFolio
"""
import json
import logging
import requests
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional

from config import settings

logger = logging.getLogger(__name__)

# Simple in-memory cache for exchange rates
_rate_cache = {
    'rates': {},
    'last_update': None
}

# Cache duration: 1 hour
CACHE_DURATION = timedelta(hours=1)

# Path to persistent exchange rates file (updated by cron job)
RATES_FILE = Path(settings.DATA_DIR) / 'exchange_rates.json'


def get_exchange_rate(from_currency: str, to_currency: str) -> float:
    """
    Get exchange rate from one currency to another.
    Uses exchangerate-api.com free tier (1500 requests/month).
    Falls back to a default rate if API fails.
    """
    if from_currency == to_currency:
        return 1.0

    # Check cache first
    cache_key = f"{from_currency}_{to_currency}"
    if _is_cache_valid():
        cached_rate = _rate_cache['rates'].get(cache_key)
        if cached_rate is not None:
            logger.debug(f"Using cached exchange rate: {from_currency} -> {to_currency} = {cached_rate}")
            return cached_rate

    # Try to fetch from API
    try:
        rate = _fetch_exchange_rate(from_currency, to_currency)
        if rate is not None:
            # Update cache
            _rate_cache['rates'][cache_key] = rate
            _rate_cache['last_update'] = datetime.now()
            logger.info(f"Fetched exchange rate: {from_currency} -> {to_currency} = {rate}")
            return rate
    except Exception as e:
        logger.warning(f"Failed to fetch exchange rate from API: {e}")

    # Fallback to approximate rate
    fallback_rate = _get_fallback_rate(from_currency, to_currency)
    logger.warning(f"Using fallback exchange rate: {from_currency} -> {to_currency} = {fallback_rate}")
    return fallback_rate


def _is_cache_valid() -> bool:
    """Check if cached rates are still valid"""
    if _rate_cache['last_update'] is None:
        return False

    age = datetime.now() - _rate_cache['last_update']
    return age < CACHE_DURATION


def _fetch_exchange_rate(from_currency: str, to_currency: str) -> Optional[float]:
    """Fetch exchange rate from API"""
    try:
        # Using exchangerate-api.com free tier
        url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"
        response = requests.get(url, timeout=5)
        response.raise_for_status()

        data = response.json()
        rates = data.get('rates', {})
        rate = rates.get(to_currency)

        return float(rate) if rate is not None else None
    except Exception as e:
        logger.error(f"Error fetching exchange rate: {e}")
        return None


def _load_rates_from_file() -> Dict[str, float]:
    """Load exchange rates from persistent file (updated daily by cron)"""
    try:
        if RATES_FILE.exists():
            with open(RATES_FILE, 'r') as f:
                data = json.load(f)
                # Return only the rate mappings, ignore metadata
                return {k: v for k, v in data.items() if k.endswith(('_USD', '_EUR', '_GBP'))}
    except Exception as e:
        logger.debug(f"Could not load rates from file: {e}")
    return {}


def _get_fallback_rate(from_currency: str, to_currency: str) -> float:
    """
    Get fallback exchange rate.
    Priority: 1) File (updated daily), 2) Hardcoded defaults
    """
    # Try to load from file first (updated daily by cron job)
    file_rates = _load_rates_from_file()
    key = f"{from_currency}_{to_currency}"
    
    if key in file_rates:
        logger.info(f"Using daily-updated rate from file: {key} = {file_rates[key]}")
        return file_rates[key]
    
    # Fallback to hardcoded rates (last resort)
    default_rates = {
        'USD_EUR': 0.92,  # 1 USD = ~0.92 EUR
        'EUR_USD': 1.09,  # 1 EUR = ~1.09 USD
        'GBP_EUR': 1.17,  # 1 GBP = ~1.17 EUR
        'EUR_GBP': 0.85,  # 1 EUR = ~0.85 GBP
    }

    return default_rates.get(key, 1.0)


def convert_to_eur(amount: float, from_currency: str) -> float:
    """Convert any currency amount to EUR"""
    if from_currency == 'EUR':
        return amount

    rate = get_exchange_rate(from_currency, 'EUR')
    return amount * rate


def get_current_rates() -> Dict[str, float]:
    """Get all cached exchange rates"""
    if _is_cache_valid():
        return _rate_cache['rates'].copy()
    return {}
