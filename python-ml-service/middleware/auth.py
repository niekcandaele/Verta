import logging
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

# API key header configuration
api_key_header = APIKeyHeader(
    name="X-API-Key",
    auto_error=False
)


async def verify_api_key(api_key: Optional[str] = Security(api_key_header)) -> str:
    """
    Verify API key for protected endpoints.
    
    Args:
        api_key: API key from request header
        
    Returns:
        The validated API key
        
    Raises:
        HTTPException: If API key is invalid or missing
    """
    # If no API key is configured, allow all requests (development mode)
    if not settings.api_key:
        logger.warning("API key authentication is disabled (no key configured)")
        return "development"
    
    # Check if API key is provided
    if not api_key:
        logger.warning("Request missing API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key is required",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    
    # Validate API key
    if api_key != settings.api_key:
        logger.warning(f"Invalid API key attempted: {api_key[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    
    return api_key


# Optional dependency for endpoints that can work with or without auth
optional_api_key = APIKeyHeader(
    name="X-API-Key",
    auto_error=False
)


async def get_optional_api_key(api_key: Optional[str] = Security(optional_api_key)) -> Optional[str]:
    """
    Optional API key verification for endpoints that support both authenticated and anonymous access.
    
    Args:
        api_key: Optional API key from request header
        
    Returns:
        The API key if provided and valid, None otherwise
    """
    if not api_key or not settings.api_key:
        return None
    
    if api_key == settings.api_key:
        return api_key
    
    return None