"""
Endpoint for rephrasing multi-part questions using LLM
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging
from services.llm import get_llm_service, Message

logger = logging.getLogger(__name__)

router = APIRouter()

class MessageInput(BaseModel):
    text: str
    author_id: str
    timestamp: str

class RephraseRequest(BaseModel):
    messages: List[MessageInput]
    context: Optional[str] = None

class RephraseResponse(BaseModel):
    rephrased_text: str
    original_messages: List[str]
    confidence: float
    model: str = "gemini-1.5-flash"

@router.post("/api/ml/rephrase", response_model=RephraseResponse)
async def rephrase_messages(request: RephraseRequest):
    """
    Rephrase multi-part questions from a series of messages
    
    This endpoint uses Google Gemini Flash to combine and rephrase
    multiple messages into a single coherent question.
    """
    try:
        # Get the LLM service
        llm_service = get_llm_service()
        
        if not llm_service.is_available():
            logger.error("LLM service not available - OPENROUTER_API_KEY not configured")
            raise HTTPException(
                status_code=503,
                detail="LLM service is not available - OPENROUTER_API_KEY not configured"
            )
        
        # Convert request messages to service format
        messages = [
            Message(
                text=msg.text,
                author_id=msg.author_id,
                timestamp=msg.timestamp
            )
            for msg in request.messages
        ]
        
        # Perform rephrasing (use sync version for now)
        logger.info("Calling LLM service for rephrasing")
        result = llm_service.rephrase_messages_sync(
            messages=messages,
            context=request.context
        )
        
        return RephraseResponse(**result)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rephrase messages: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to rephrase messages: {str(e)}"
        )