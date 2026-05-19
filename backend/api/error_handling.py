"""
Shared API error handling helpers.
"""
from __future__ import annotations

import logging
import traceback
from fastapi import HTTPException


def raise_invalid_request(
    logger: logging.Logger,
    context: str,
    error: Exception,
    detail_prefix: str = "Invalid request data",
) -> None:
    """Log and raise a standardized 400 HTTPException."""
    logger.warning(f"{context}: {error}")
    raise HTTPException(status_code=400, detail=f"{detail_prefix}: {str(error)}")


def raise_unexpected_error(
    logger: logging.Logger,
    context: str,
    error: Exception,
    public_detail: str,
    include_traceback: bool = False,
) -> None:
    """Log and raise a standardized 500 HTTPException."""
    logger.error(f"{context}: {type(error).__name__}: {error}")
    if include_traceback:
        logger.debug(f"Traceback: {traceback.format_exc()}")
    raise HTTPException(status_code=500, detail=public_detail)
