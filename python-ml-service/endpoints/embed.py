from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from models.embeddings import get_embedding_model
from middleware.auth import verify_api_key

router = APIRouter(prefix="/api/ml", tags=["embeddings"])


class EmbedRequest(BaseModel):
    text: str
    normalize: bool = True


class EmbedResponse(BaseModel):
    embedding: List[float]
    dimensions: int


class BatchEmbedRequest(BaseModel):
    texts: List[str]
    normalize: bool = True
    batch_size: int = 32


class BatchEmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimensions: int
    count: int


class SimilarityRequest(BaseModel):
    embedding1: List[float]
    embedding2: List[float]


class SimilarityResponse(BaseModel):
    similarity: float


@router.post("/embed", response_model=EmbedResponse)
async def generate_embedding(request: EmbedRequest, api_key: str = Depends(verify_api_key)) -> EmbedResponse:
    """
    Generate embedding for a single text.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        model = get_embedding_model()
        embedding = model.generate_embedding(request.text, normalize=request.normalize)
        
        return EmbedResponse(
            embedding=embedding,
            dimensions=len(embedding)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {e}")


@router.post("/embed/batch", response_model=BatchEmbedResponse)
async def batch_generate_embeddings(request: BatchEmbedRequest, api_key: str = Depends(verify_api_key)) -> BatchEmbedResponse:
    """
    Generate embeddings for multiple texts.
    """
    if not request.texts:
        raise HTTPException(status_code=400, detail="Texts list cannot be empty")
    
    if len(request.texts) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 texts allowed per batch")
    
    if request.batch_size < 1 or request.batch_size > 100:
        raise HTTPException(status_code=400, detail="Batch size must be between 1 and 100")
    
    try:
        model = get_embedding_model()
        embeddings = model.batch_generate_embeddings(
            request.texts, 
            normalize=request.normalize,
            batch_size=request.batch_size
        )
        
        return BatchEmbedResponse(
            embeddings=embeddings,
            dimensions=len(embeddings[0]) if embeddings else 0,
            count=len(embeddings)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch embedding generation failed: {e}")


@router.post("/embed/similarity", response_model=SimilarityResponse)
async def compute_similarity(request: SimilarityRequest, api_key: str = Depends(verify_api_key)) -> SimilarityResponse:
    """
    Compute cosine similarity between two embeddings.
    """
    if not request.embedding1 or not request.embedding2:
        raise HTTPException(status_code=400, detail="Embeddings cannot be empty")
    
    if len(request.embedding1) != len(request.embedding2):
        raise HTTPException(
            status_code=400, 
            detail=f"Embedding dimensions must match ({len(request.embedding1)} != {len(request.embedding2)})"
        )
    
    try:
        model = get_embedding_model()
        similarity = model.compute_similarity(request.embedding1, request.embedding2)
        
        return SimilarityResponse(similarity=similarity)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Similarity computation failed: {e}")