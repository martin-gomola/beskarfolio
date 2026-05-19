"""
API routes for BeskarFolio - Health check endpoints only

LocalStorage-only architecture:
- All user data stored in browser's localStorage
- Backend provides stateless calculation services
"""
import logging
from fastapi import APIRouter
from config.settings import APP_VERSION

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def root():
    """Root endpoint - basic health check"""
    return {
        "status": "healthy",
        "service": "BeskarFolio API",
        "version": APP_VERSION
    }


@router.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": "BeskarFolio API",
        "version": APP_VERSION,
        "architecture": "localStorage-only"
    }
