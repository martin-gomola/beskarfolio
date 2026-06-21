# BeskarFolio Context

## Domain Terms

### Browser portfolio state

The browser-owned source of truth for a visitor's portfolio. It includes localStorage transactions, cached portfolio calculations, offline fallback behavior, and derived reads that must reflect this browser's data.

This term exists because BeskarFolio is intentionally stateless on the backend: the browser owns transactions, while the backend calculates results from submitted data.

### Price read model

The backend-owned projection of cached price data for read-only callers. It includes latest prices, historical ranges, 52-week ranges, freshness status, snapshot-vs-CSV precedence, and market-date semantics.

This term exists because price correctness is shared by holdings, performance, allocation, AI prompts, and settings. Provider fetching and CSV persistence are separate write paths; the price read model is the read seam.
