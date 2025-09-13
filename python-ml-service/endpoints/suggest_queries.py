"""
Endpoint for suggesting follow-up search queries based on initial results
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Literal
import logging
from services.llm import get_llm_service
from litellm import completion
import json

logger = logging.getLogger(__name__)

router = APIRouter()

class SearchResult(BaseModel):
    type: Literal['golden_answer', 'message', 'knowledge_base']
    score: float
    content: Optional[str] = None
    excerpt: Optional[str] = None
    message_id: Optional[str] = None
    metadata: Dict[str, Any] = {}

class SuggestQueriesRequest(BaseModel):
    question: str
    search_results: List[SearchResult]
    max_queries: int = 5

class SuggestQueriesResponse(BaseModel):
    queries: List[str]
    reasoning: Optional[str] = None

@router.post("/api/ml/suggest-queries", response_model=SuggestQueriesResponse)
async def suggest_queries(request: SuggestQueriesRequest):
    """
    Suggest follow-up search queries based on initial search results
    
    This endpoint uses the LLM to analyze initial search results and suggest
    additional queries that could provide more comprehensive information.
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
        
        # Build the prompt for query suggestion
        prompt = _build_suggestion_prompt(request.question, request.search_results, request.max_queries)
        
        # Use a very simple prompt to avoid token issues
        simple_prompt = f"Question: {request.question}\nSuggest 3 brief follow-up queries as JSON:\n"

        response = completion(
            model=llm_service.model,
            messages=[
                {
                    "role": "system",
                    "content": "Output only: {\"queries\":[\"q1\",\"q2\",\"q3\"]}"
                },
                {"role": "user", "content": simple_prompt}
            ],
            api_key=llm_service.api_key,
            temperature=0.3,
            max_tokens=1000
        )
        
        # Parse the response
        try:
            # Log raw response for debugging
            raw_response = response.choices[0].message.content
            logger.info(f"Full response object: {response}")
            logger.info(f"Response choices: {response.choices}")
            logger.info(f"First choice: {response.choices[0]}")
            logger.info(f"Message object: {response.choices[0].message}")
            logger.info(f"Raw LLM response (first 200 chars): {raw_response[:200]}...")
            logger.info(f"Response type: {type(raw_response)}, length: {len(raw_response)}")
            logger.info(f"Full raw response: {repr(raw_response)}")

            # Strip markdown code blocks if present
            cleaned_response = raw_response.strip()
            if cleaned_response.startswith('```'):
                # Remove opening ```json or ```
                cleaned_response = cleaned_response.split('\n', 1)[1] if '\n' in cleaned_response else cleaned_response[3:]
                # Remove closing ```
                if cleaned_response.endswith('```'):
                    cleaned_response = cleaned_response[:-3].strip()

            result = json.loads(cleaned_response)
            queries = result.get("queries", [])[:request.max_queries]
            reasoning = None  # Removed from simplified prompt
            
            # Validate queries
            validated_queries = []
            for query in queries:
                if isinstance(query, str) and len(query.strip()) > 0:
                    validated_queries.append(query.strip())
            
            logger.info(f"Generated {len(validated_queries)} follow-up queries for: {request.question}")
            
            return SuggestQueriesResponse(
                queries=validated_queries,
                reasoning=reasoning
            )
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.error(f"Failed to parse LLM response: {e}")
            # Fallback to empty queries
            return SuggestQueriesResponse(queries=[], reasoning="Failed to generate follow-up queries")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to suggest queries: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to suggest queries: {str(e)}"
        )

def _build_suggestion_prompt(question: str, search_results: List[SearchResult], max_queries: int) -> str:
    """Build the prompt for query suggestion"""
    
    # Summarize what we found
    result_summary = []
    for result in search_results[:10]:  # Limit to top 10 results
        if result.type == 'golden_answer':
            result_summary.append(f"- Golden Answer: {result.content[:100] if result.content else result.excerpt[:100]}")
        elif result.type == 'knowledge_base':
            title = result.metadata.get('title', 'Unknown')
            result_summary.append(f"- Documentation ({title}): {result.excerpt[:100] if result.excerpt else ''}")
        else:
            result_summary.append(f"- Discussion: {result.excerpt[:100] if result.excerpt else ''}")
    
    prompt = f"""Original question: {question}

Current search results summary:
{chr(10).join(result_summary)}

Based on these initial results, suggest up to {max_queries} follow-up search queries that would help provide a more comprehensive answer. Consider:
- What aspects of the question aren't well covered?
- What related topics would be helpful?
- What specific details might be missing?

Remember: Return ONLY the JSON object, nothing else."""
    
    return prompt