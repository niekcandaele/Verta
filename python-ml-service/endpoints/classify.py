from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from models.classifier import get_classifier
from middleware.auth import verify_api_key

router = APIRouter(prefix="/api/ml", tags=["classification"])


class ClassifyRequest(BaseModel):
    text: str


class ClassifyResponse(BaseModel):
    is_question: bool
    confidence: float


class BatchClassifyRequest(BaseModel):
    texts: List[str]


class BatchClassifyResponse(BaseModel):
    results: List[ClassifyResponse]


@router.post("/classify", response_model=ClassifyResponse)
async def classify_text(request: ClassifyRequest, api_key: str = Depends(verify_api_key)) -> ClassifyResponse:
    """
    Classify a single text as question or statement.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        classifier = get_classifier()
        is_question, confidence = classifier.classify(request.text)
        
        return ClassifyResponse(
            is_question=is_question,
            confidence=confidence
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")


@router.post("/classify/batch", response_model=BatchClassifyResponse)
async def batch_classify_texts(request: BatchClassifyRequest, api_key: str = Depends(verify_api_key)) -> BatchClassifyResponse:
    """
    Classify multiple texts as questions or statements.
    """
    if not request.texts:
        raise HTTPException(status_code=400, detail="Texts list cannot be empty")
    
    if len(request.texts) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 texts allowed per batch")
    
    try:
        classifier = get_classifier()
        results = classifier.batch_classify(request.texts)
        
        return BatchClassifyResponse(
            results=[
                ClassifyResponse(is_question=is_q, confidence=conf)
                for is_q, conf in results
            ]
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch classification failed: {e}")