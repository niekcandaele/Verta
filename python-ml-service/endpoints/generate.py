"""
Endpoint for generating responses from search results using LLM
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Literal
import logging
from services.llm import get_llm_service

logger = logging.getLogger(__name__)

router = APIRouter()

class SearchResult(BaseModel):
    type: Literal['golden_answer', 'message', 'knowledge_base']
    score: float
    content: Optional[str] = None
    excerpt: Optional[str] = None
    message_id: Optional[str] = None
    metadata: Dict[str, Any] = {}

class GenerateRequest(BaseModel):
    question: str
    search_results: List[SearchResult]
    context: Optional[str] = None
    max_response_length: int = 1800  # Discord has 2000 char limit, leave room for formatting

class GenerateResponse(BaseModel):
    response: str
    confidence: Literal['high', 'medium', 'low']
    sources_used: int
    model: str = "gemini-1.5-flash"

@router.post("/api/ml/generate", response_model=GenerateResponse)
async def generate_response(request: GenerateRequest):
    """
    Generate a natural language response to a question using search results
    
    This endpoint uses Google Gemini Flash to synthesize search results
    into a coherent, helpful response for Discord bot responses.
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
        
        # Build the prompt for response generation
        prompt = _build_generation_prompt(request.question, request.search_results, request.context)
        
        # Use the existing LLM infrastructure
        from litellm import completion
        
        response = completion(
            model=llm_service.model,
            messages=[
                {
                    "role": "system", 
                    "content": """You are Verta, a helpful Discord bot assistant. Generate concise, accurate responses based on provided search results. 

Rules:
1. Answer directly and helpfully
2. Stay under 1800 characters total
3. Use provided sources only
4. If sources don't answer the question, say "I couldn't find specific information about that"
5. Be conversational but professional
6. Don't mention "based on search results" - just answer naturally"""
                },
                {"role": "user", "content": prompt}
            ],
            api_key=llm_service.api_key,
            temperature=0.3,
            max_tokens=2000  # Increased for Gemini 2.5 Pro's capabilities
        )
        
        # Extract the response
        generated_response = response.choices[0].message.content.strip()
        
        # Calculate confidence and sources used
        confidence = _calculate_confidence(request.search_results, generated_response)
        sources_used = len([r for r in request.search_results if r.score > 0.3])  # Count relevant sources
        
        return GenerateResponse(
            response=generated_response,
            confidence=confidence,
            sources_used=sources_used,
            model=llm_service.model.split("/")[-1]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate response: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate response: {str(e)}"
        )

def _build_generation_prompt(question: str, search_results: List[SearchResult], context: Optional[str]) -> str:
    """Build the prompt for response generation"""
    
    # Sort results by score (highest first)
    sorted_results = sorted(search_results, key=lambda x: x.score, reverse=True)
    
    # Build sources section - with more context for Gemini 2.5 Pro
    sources_text = ""
    for i, result in enumerate(sorted_results, 1):  # Use all results
        content = result.content or result.excerpt or ""
        if content:
            source_type = "Golden Answer" if result.type == "golden_answer" else "Documentation" if result.type == "knowledge_base" else "Discussion"
            # Include more content for better context
            sources_text += f"\n{i}. [{source_type}] {content[:500]}..."
            if len(sources_text) > 10000:  # Safety limit
                sources_text += "\n... (additional sources omitted for brevity)"
                break
    
    prompt = f"""Question: {question}

Available information:
{sources_text}"""
    
    if context:
        prompt += f"\n\nAdditional context: {context}"
    
    prompt += "\n\nGenerate a helpful response:"
    
    return prompt

def _calculate_confidence(search_results: List[SearchResult], response: str) -> Literal['high', 'medium', 'low']:
    """Calculate confidence level based on search results and response"""
    
    if not search_results:
        return 'low'
    
    # Check for golden answers with high scores
    golden_answers = [r for r in search_results if r.type == 'golden_answer' and r.score > 0.7]
    if golden_answers:
        return 'high'
    
    # Check for high-scoring results
    high_scores = [r for r in search_results if r.score > 0.6]
    if len(high_scores) >= 2:
        return 'high'
    elif len(high_scores) >= 1:
        return 'medium'
    
    # Check if response indicates uncertainty
    uncertainty_phrases = ["couldn't find", "not sure", "might", "possibly", "I don't know"]
    if any(phrase in response.lower() for phrase in uncertainty_phrases):
        return 'low'
    
    return 'medium'