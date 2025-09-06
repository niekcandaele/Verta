from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Union
from datetime import datetime
import logging

from middleware.auth import verify_api_key
from services.database import db_service
from services.search import search_service
from services.rerank import rerank_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ml", tags=["search"])


class SearchConfig(BaseModel):
    table: str
    text_field: str
    vector_field: str
    filters: dict


class SearchRequest(BaseModel):
    query: str
    embedding: List[float]
    search_configs: List[SearchConfig]
    limit: int = 20
    rerank: bool = True


class SearchResultItem(BaseModel):
    type: str  # 'golden_answer' or 'message'
    score: float
    content: Optional[str] = None  # Full content for golden answers
    excerpt: Optional[str] = None  # 200 char excerpt for messages
    message_id: Optional[str] = None  # For fetching full message
    metadata: dict


class SearchResponse(BaseModel):
    results: List[SearchResultItem]
    query: str
    total_results: int
    processing_time_ms: int


@router.post("/search", response_model=SearchResponse)
async def search(
    request: SearchRequest, 
    api_key: str = Depends(verify_api_key)
) -> SearchResponse:
    """
    Execute hybrid search across multiple tables and return reranked results.
    """
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    if not request.embedding:
        raise HTTPException(status_code=400, detail="Embedding cannot be empty")
    
    if not request.search_configs:
        raise HTTPException(status_code=400, detail="At least one search config required")
    
    # Check if TiDB hybrid search is available
    if not db_service.check_hybrid_search_available():
        logger.error("TiDB hybrid search is not available")
        raise HTTPException(
            status_code=503,
            detail="TiDB hybrid search functionality is not available. Please ensure TiDB version supports vector operations."
        )
    
    start_time = datetime.now()
    
    # Execute searches across all configured tables
    raw_results = search_service.search_all(
        search_configs=[config.dict() for config in request.search_configs],
        embedding=request.embedding,
        limit_per_source=request.limit
    )
    
    # Format results for API response
    formatted_results = search_service.format_search_results(raw_results)
    
    # Apply reranking if requested
    if request.rerank and formatted_results:
        reranked_results = await rerank_service.rerank_results(
            query=request.query,
            results=formatted_results,
            top_k=request.limit
        )
        final_results = [
            SearchResultItem(**result) for result in reranked_results
        ]
    else:
        # Return results sorted by similarity without reranking
        final_results = [
            SearchResultItem(**result) for result in formatted_results[:request.limit]
        ]
    
    processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
    
    return SearchResponse(
        results=final_results,
        query=request.query,
        total_results=len(final_results),
        processing_time_ms=processing_time
    )