from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from models.openrouter_ocr import get_ocr_model
from middleware.auth import verify_api_key

router = APIRouter(prefix="/api/ml", tags=["ocr"])


class OCRRequest(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    options: Optional[Dict] = None


class OCRResponse(BaseModel):
    text: str
    full_response: str
    visual_context: str
    confidence: float
    processing_time_ms: int
    model_used: str
    model_name: str
    attempts: int


class BatchOCRRequest(BaseModel):
    images: List[Dict[str, str]]
    options: Optional[Dict] = None


class BatchOCRResponse(BaseModel):
    results: List[OCRResponse]


@router.post("/ocr", response_model=OCRResponse)
async def extract_text(request: OCRRequest, api_key: str = Depends(verify_api_key)) -> OCRResponse:
    """
    Extract text from an image using OCR.
    """
    if not request.image_url and not request.image_base64:
        raise HTTPException(
            status_code=400, 
            detail="Either image_url or image_base64 must be provided"
        )
    
    if request.image_url and request.image_base64:
        raise HTTPException(
            status_code=400,
            detail="Only one of image_url or image_base64 should be provided"
        )
    
    try:
        ocr_model = get_ocr_model()
        
        # Extract preprocessing option if provided
        preprocessing = True
        if request.options and 'preprocessing' in request.options:
            preprocessing = request.options['preprocessing']
        
        # Now await the async method
        result = await ocr_model.extract_text(
            image_url=request.image_url,
            image_base64=request.image_base64,
            preprocessing=preprocessing
        )
        
        return OCRResponse(
            text=result['text'],
            full_response=result.get('full_response', result['text']),
            visual_context=result.get('visual_context', ''),
            confidence=result['confidence'],
            processing_time_ms=result['processing_time_ms'],
            model_used=result.get('model_used', 'unknown'),
            model_name=result.get('model_name', 'unknown'),
            attempts=result.get('attempts', 1)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {e}")


@router.post("/ocr/batch", response_model=BatchOCRResponse)
async def batch_extract_text(request: BatchOCRRequest, api_key: str = Depends(verify_api_key)) -> BatchOCRResponse:
    """
    Extract text from multiple images using OCR.
    """
    if not request.images:
        raise HTTPException(status_code=400, detail="Images list cannot be empty")
    
    if len(request.images) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images allowed per batch")
    
    try:
        ocr_model = get_ocr_model()
        
        # Extract preprocessing option if provided
        preprocessing = True
        if request.options and 'preprocessing' in request.options:
            preprocessing = request.options['preprocessing']
        
        # Now await the async method
        results = await ocr_model.batch_extract(request.images, preprocessing)
        
        return BatchOCRResponse(
            results=[
                OCRResponse(
                    text=result.get('text', ''),
                    full_response=result.get('full_response', result.get('text', '')),
                    visual_context=result.get('visual_context', ''),
                    confidence=result.get('confidence', 0.0),
                    processing_time_ms=result.get('processing_time_ms', 0),
                    model_used=result.get('model_used', 'unknown'),
                    model_name=result.get('model_name', 'unknown'),
                    attempts=result.get('attempts', 1)
                )
                for result in results
            ]
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch OCR extraction failed: {e}")