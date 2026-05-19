# =============================================================================
# PURPOSE: Portfolio Allocation & Rebalancing Calculator
# =============================================================================
# Calculates how to adjust holdings to match target allocation while
# minimizing taxes (prioritize tax-free shares) and avoiding tiny trades.
#
# KEY FEATURES:
# 1. Calculate current allocation (% by EUR value)
# 2. Calculate drift from target allocation
# 3. Generate buy/sell recommendations
# 4. Prioritize tax-free shares for selling (Slovak 365-day rule)
# 5. Support cash injection & self-funding rebalancing
#
# =============================================================================

import logging
from typing import List, Dict, Tuple
from decimal import Decimal

from logic.currency_service import convert_to_eur
from logic.tax_free import calculate_tax_free_from_transactions  # Existing FIFO logic

logger = logging.getLogger(__name__)

# Constants
MIN_TRADE_VALUE_EUR = 100.0  # Ignore trades < €100
REBALANCE_THRESHOLD_PCT = 5.0  # Only suggest rebalancing if drift > 5%
TAX_RATE_PCT = 19.0  # Slovak tax rate for gains on shares held < 365 days

# =============================================================================
# STEP 1: Calculate Current Allocation
# =============================================================================

def calculate_current_allocation(
    holdings: List[dict],
    prices: Dict[str, float]
) -> Dict:
    """
    Calculate current portfolio allocation by EUR value
    
    INPUT:
      holdings: [
        {'ticker': 'AAPL', 'total_shares': 10, 'avg_buy_price': 150, 'currency': 'USD'},
        ...
      ]
      prices: {'AAPL': 180.0, 'GOOGL': 150.0, ...}
      
    OUTPUT:
      {
        'total_value_eur': 6624.00,
        'allocations': {
          'AAPL': {
            'shares': 10.0,
            'currency': 'USD',
            'price': 180.0,
            'value_eur': 1656.00,
            'weight_pct': 25.0
          },
          ...
        }
      }
      
    EXAMPLE:
      holdings = [{'ticker': 'AAPL', 'total_shares': 10, 'currency': 'USD', ...}]
      prices = {'AAPL': 180.0}
      
      result = calculate_current_allocation(holdings, prices)
      # AAPL: 10 shares * $180 * 0.92 EUR/USD = €1,656
      # Weight: €1,656 / €6,624 total = 25%
    """
    total_value_eur = Decimal('0')
    allocations = {}
    
    # Calculate EUR value for each holding
    for holding in holdings:
        ticker = holding['ticker']
        shares = Decimal(str(holding.get('total_shares', 0)))
        currency = holding.get('currency', 'EUR')
        price_data = prices.get(ticker)
        
        # Extract price from price_data dict
        if not price_data or shares <= 0:
            continue
        
        # prices.get(ticker) returns {'price': 123.45, 'currency': 'USD', ...}
        price = price_data.get('price') if isinstance(price_data, dict) else price_data
        
        if not price or price <= 0:
            logger.warning(f"Invalid price for {ticker}: {price_data}")
            continue
        
        # Calculate value in native currency
        value_native = shares * Decimal(str(price))
        
        # Convert to EUR
        value_eur = Decimal(str(convert_to_eur(float(value_native), currency)))
        total_value_eur += value_eur
        
        allocations[ticker] = {
            'shares': float(shares),
            'currency': currency,
            'price': float(price),
            'value_eur': float(value_eur),
            'weight_pct': 0.0  # Will calculate after total is known
        }
    
    # Calculate weight % for each holding
    if total_value_eur > 0:
        for ticker, data in allocations.items():
            data['weight_pct'] = float((Decimal(str(data['value_eur'])) / total_value_eur) * 100)
    
    logger.info(f"📊 Current allocation calculated: {len(allocations)} positions, €{float(total_value_eur):.2f} total")
    
    return {
        'total_value_eur': float(total_value_eur),
        'allocations': allocations
    }


# =============================================================================
# STEP 2: Calculate Drift
# =============================================================================

def calculate_drift(
    current_allocations: Dict,
    target_allocations: Dict[str, float],
    total_value_eur: float
) -> List[dict]:
    """
    Calculate drift between current and target allocation
    
    INPUT:
      current_allocations: {
        'AAPL': {'value_eur': 1656.00, 'weight_pct': 25.0, ...},
        ...
      }
      target_allocations: {'AAPL': 20.0, 'GOOGL': 15.0, ...}
      total_value_eur: 6624.00
      
    OUTPUT:
      [
        {
          'ticker': 'AAPL',
          'current_weight_pct': 25.0,
          'target_weight_pct': 20.0,
          'drift_pct': +5.0,
          'drift_value_eur': 331.20,
          'action': 'sell'
        },
        ...
      ]
      
    DRIFT CALCULATION:
      drift_pct = current_weight - target_weight
      drift_value_eur = (drift_pct / 100) * total_value
      
      Positive drift = overweight (need to sell)
      Negative drift = underweight (need to buy)
      
    ACTION DETERMINATION:
      - drift_pct > +1%: 'sell' (overweight)
      - drift_pct < -1%: 'buy' (underweight)
      - Otherwise: 'hold' (within tolerance)
    """
    drift_data = []
    
    # Get all unique tickers (from current holdings and target allocation)
    all_tickers = set(list(current_allocations.keys()) + list(target_allocations.keys()))
    
    for ticker in all_tickers:
        current = current_allocations.get(ticker, {})
        current_weight = current.get('weight_pct', 0.0)
        current_value = current.get('value_eur', 0.0)
        
        target_weight = target_allocations.get(ticker, 0.0)
        
        # Calculate drift
        drift_pct = current_weight - target_weight
        drift_value_eur = (drift_pct / 100.0) * total_value_eur if total_value_eur > 0 else 0.0
        
        # Determine action
        if drift_pct > 1.0:
            action = 'sell'
        elif drift_pct < -1.0:
            action = 'buy'
        else:
            action = 'hold'
        
        drift_data.append({
            'ticker': ticker,
            'currency': current.get('currency', 'EUR'),
            'current_shares': current.get('shares', 0.0),
            'current_value_eur': current_value,
            'current_weight_pct': round(current_weight, 2),
            'target_weight_pct': round(target_weight, 2),
            'drift_pct': round(drift_pct, 2),
            'drift_value_eur': round(drift_value_eur, 2),
            'action': action
        })
    
    # Sort by absolute drift (largest first)
    drift_data.sort(key=lambda x: abs(x['drift_pct']), reverse=True)
    
    # Calculate total drift (sum of absolute drifts)
    total_drift = sum(abs(d['drift_pct']) for d in drift_data)
    logger.info(f"📈 Drift calculated: {len(drift_data)} positions, {total_drift:.2f}% total drift")
    
    return drift_data


# =============================================================================
# STEP 3: Generate Rebalancing Plan (with Tax Efficiency)
# =============================================================================

def generate_rebalancing_plan(
    drift_data: List[dict],
    prices: Dict[str, float],
    transactions: List[dict],  # For tax-free calculation
    cash_available: float = 0.0,
    allow_selling: bool = True,
    min_trade_value: float = MIN_TRADE_VALUE_EUR,
    use_tax_free_only: bool = True
) -> dict:
    """
    Generate buy/sell trades to reach target allocation
    
    INPUT:
      drift_data: Output from calculate_drift()
      prices: Current prices for all tickers
      transactions: All historical transactions (for FIFO tax calculation)
      cash_available: Cash to invest (optional, default 0)
      allow_selling: Allow selling overweight positions (default True)
      min_trade_value: Minimum trade value (default €100)
      use_tax_free_only: Prioritize tax-free shares for selling (default True)
      
    OUTPUT:
      {
        'trades': [
          {
            'ticker': 'AAPL',
            'action': 'sell',
            'shares': 5.0,
            'price': 180.0,
            'eur_value': 828.00,
            'tax_free': True,
            'tax_liability_eur': 0.00,
            'reason': 'Overweight by 5.0%'
          },
          ...
        ],
        'summary': {
          'total_trades': 2,
          'total_sells_eur': 828.00,
          'total_buys_eur': 414.00,
          'cash_generated': 828.00,
          'cash_used': 414.00,
          'cash_remaining': 414.00,
          'total_tax_liability': 0.00,
          'tax_savings': 57.00  # Savings vs. selling taxable shares
        },
        'needs_rebalancing': True,
        'total_drift_pct': 12.5
      }
      
    ALGORITHM:
      1. Separate drift_data into overweight (sell) and underweight (buy)
      2. If use_tax_free_only: Filter sells to tax-free shares only
      3. Calculate sell trades (generate cash)
      4. Calculate buy trades (use cash from sells + cash_available)
      5. Filter out trades < min_trade_value
      6. Calculate tax liability and savings
    """
    # Get tax-free status for all holdings (if needed)
    tax_free_data = {}
    if use_tax_free_only and transactions:
        try:
            tax_free_results = calculate_tax_free_from_transactions(transactions)
            for item in tax_free_results:
                tax_free_data[item['ticker']] = {
                    'tax_free_shares': item.get('tax_free_shares', 0),
                    'taxable_shares': item.get('taxable_shares', 0)
                }
        except Exception as e:
            logger.warning(f"⚠️ Failed to get tax-free status: {e}")
    
    # Separate overweight and underweight positions
    overweight = [d for d in drift_data if d['action'] == 'sell' and d['drift_value_eur'] > min_trade_value]
    underweight = [d for d in drift_data if d['action'] == 'buy' and abs(d['drift_value_eur']) > min_trade_value]
    
    trades = []
    cash_generated = 0.0
    total_tax_liability = 0.0
    total_tax_savings = 0.0
    
    # SELL overweight positions (if allowed)
    if allow_selling:
        for position in overweight:
            ticker = position['ticker']
            price_data = prices.get(ticker)
            
            # Extract price from price_data dict
            price = price_data.get('price') if isinstance(price_data, dict) else price_data
            
            if not price or price <= 0:
                logger.warning(f"⚠️ No price for {ticker}, skipping sell")
                continue
            
            # Calculate shares to sell (from drift)
            eur_to_sell = position['drift_value_eur']
            shares_to_sell = eur_to_sell / price
            
            # Check tax-free status
            tax_free_available = tax_free_data.get(ticker, {}).get('tax_free_shares', 0)
            is_tax_free = shares_to_sell <= tax_free_available
            
            # If use_tax_free_only, skip if not enough tax-free shares
            if use_tax_free_only and not is_tax_free:
                logger.info(f"⏭️ Skipping {ticker}: Need {shares_to_sell:.2f} shares, only {tax_free_available:.2f} tax-free")
                continue
            
            # Calculate tax liability (if selling taxable shares)
            tax_liability = 0.0
            tax_savings = 0.0
            
            if not is_tax_free:
                # Estimate gain (simplified: assume 20% gain)
                estimated_gain = eur_to_sell * 0.20
                tax_liability = estimated_gain * (TAX_RATE_PCT / 100.0)
            else:
                # Calculate tax savings (vs. selling taxable shares)
                estimated_gain = eur_to_sell * 0.20
                tax_savings = estimated_gain * (TAX_RATE_PCT / 100.0)
            
            # Round to whole shares
            shares_to_sell = round(shares_to_sell)
            eur_value = shares_to_sell * price
            
            # Skip if too small
            if eur_value < min_trade_value:
                continue
            
            trades.append({
                'ticker': ticker,
                'action': 'sell',
                'shares': shares_to_sell,
                'price': price,
                'eur_value': round(eur_value, 2),
                'tax_free': is_tax_free,
                'tax_liability_eur': round(tax_liability, 2),
                'tax_savings_eur': round(tax_savings, 2),
                'reason': f"Overweight by {position['drift_pct']}%"
            })
            
            cash_generated += eur_value
            total_tax_liability += tax_liability
            total_tax_savings += tax_savings
    
    # BUY underweight positions (with cash from sells + new cash)
    cash_available_total = cash_generated + cash_available
    cash_used = 0.0
    
    for position in underweight:
        ticker = position['ticker']
        price_data = prices.get(ticker)
        
        # Extract price from price_data dict
        price = price_data.get('price') if isinstance(price_data, dict) else price_data
        
        if not price or price <= 0:
            logger.warning(f"⚠️ No price for {ticker}, skipping buy")
            continue
        
        # Calculate ideal shares to buy (from drift)
        eur_ideal = abs(position['drift_value_eur'])
        
        # For buy-only strategy: show ALL positions that need buying, not limited by cash
        if not allow_selling:
            # Buy-only: create trades for all underweight positions, show full ideal amount
            shares_to_buy = eur_ideal / price
            shares_to_buy = round(shares_to_buy)
            eur_value = shares_to_buy * price
            
            # Skip only if too small to be meaningful
            if eur_value < min_trade_value:
                continue
            
            trades.append({
                'ticker': ticker,
                'action': 'buy',
                'shares': shares_to_buy,
                'price': price,
                'eur_value': round(eur_value, 2),
                'tax_free': None,
                'tax_liability_eur': 0.0,
                'tax_savings_eur': 0.0,
                'reason': f"Underweight by {position['drift_pct']}%"
            })
            
            cash_used += eur_value
        else:
            # Sell-and-buy strategy: limit by available cash
            eur_to_buy = min(eur_ideal, cash_available_total - cash_used)
            
            if eur_to_buy < min_trade_value:
                continue
            
            shares_to_buy = eur_to_buy / price
            shares_to_buy = round(shares_to_buy)
            eur_value = shares_to_buy * price
            
            if eur_value < min_trade_value:
                continue
            
            trades.append({
                'ticker': ticker,
                'action': 'buy',
                'shares': shares_to_buy,
                'price': price,
                'eur_value': round(eur_value, 2),
                'tax_free': None,
                'tax_liability_eur': 0.0,
                'tax_savings_eur': 0.0,
                'reason': f"Underweight by {position['drift_pct']}%"
            })
            
            cash_used += eur_value
    
    # Calculate totals
    total_sells = sum(t['eur_value'] for t in trades if t['action'] == 'sell')
    total_buys = sum(t['eur_value'] for t in trades if t['action'] == 'buy')
    cash_remaining = cash_available_total - cash_used
    
    # For buy-only: cash_needed = sum of all buy trades (which shows full ideal amounts)
    # For sell-buy: cash_needed = cash_used (limited by available cash)
    cash_needed = total_buys if not allow_selling else cash_used
    cash_shortfall = max(0, cash_needed - cash_available_total)
    
    # Calculate total drift
    total_drift = sum(abs(d['drift_pct']) for d in drift_data)
    needs_rebalancing = total_drift > REBALANCE_THRESHOLD_PCT
    
    logger.info(f"🎯 Rebalancing plan: {len(trades)} trades, €{total_sells:.2f} sells, €{total_buys:.2f} buys")
    logger.info(f"💰 Tax liability: €{total_tax_liability:.2f}, Tax savings: €{total_tax_savings:.2f}")
    if not allow_selling and cash_shortfall > 0:
        logger.info(f"💵 Buy-only strategy: €{cash_shortfall:.2f} additional cash needed")
    
    return {
        'trades': trades,
        'summary': {
            'total_trades': len(trades),
            'total_sells_eur': round(total_sells, 2),
            'total_buys_eur': round(total_buys, 2),
            'cash_generated': round(cash_generated, 2),
            'cash_used': round(cash_used, 2),
            'cash_remaining': round(cash_remaining, 2),
            'cash_needed': round(cash_needed, 2),  # Total cash needed (for buy-only: sum of all trades)
            'cash_shortfall': round(cash_shortfall, 2),  # How much more cash is needed
            'total_tax_liability': round(total_tax_liability, 2),
            'tax_savings': round(total_tax_savings, 2)
        },
        'needs_rebalancing': needs_rebalancing,
        'total_drift_pct': round(total_drift, 2)
    }


# =============================================================================
# HELPER: Validate Target Allocation
# =============================================================================

def validate_target_allocation(allocations: Dict[str, float]) -> Tuple[bool, str]:
    """
    Validate target allocation
    
    CHECKS:
      1. Total must be 100% (strict mode)
      2. All weights must be >= 0
      3. All weights must be <= 100
      4. All tickers must be valid (non-empty strings)
      
    RETURNS:
      (is_valid, error_message)
      
    EXAMPLE:
      valid, error = validate_target_allocation({'AAPL': 50, 'GOOGL': 50})
      if not valid:
          raise ValueError(error)
    """
    if not allocations:
        return False, "Target allocation cannot be empty"
    
    # Check total
    total = sum(allocations.values())
    if abs(total - 100.0) > 0.01:
        return False, f"Total must be 100%, got {total:.2f}%"
    
    # Check each ticker
    for ticker, weight in allocations.items():
        if not ticker or not isinstance(ticker, str):
            return False, f"Invalid ticker: {ticker}"
        
        if weight < 0:
            return False, f"Weight for {ticker} cannot be negative: {weight}%"
        
        if weight > 100:
            return False, f"Weight for {ticker} cannot exceed 100%: {weight}%"
    
    return True, ""

