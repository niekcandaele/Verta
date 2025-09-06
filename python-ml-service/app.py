import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from models.classifier import get_classifier
from models.embeddings import get_embedding_model
from models.openrouter_ocr import get_ocr_model
from services.rerank import rerank_service
from endpoints import classify, embed, rephrase, ocr, search
from middleware.auth import verify_api_key

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str
    models_loaded: bool = False


async def refresh_ocr_models_periodically():
    """Background task to refresh OCR models every 30 minutes."""
    while True:
        try:
            await asyncio.sleep(30 * 60)  # Wait 30 minutes
            logger.info("Running periodic OCR model refresh...")
            ocr_model = get_ocr_model()
            await ocr_model.refresh_models()
        except asyncio.CancelledError:
            logger.info("OCR model refresh task cancelled")
            break
        except Exception as e:
            logger.error(f"Error during OCR model refresh: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.service_name} v{settings.service_version}")
    logger.info(f"Debug mode: {settings.debug}")
    logger.info(f"API endpoint: http://{settings.host}:{settings.port}")
    
    # Store startup time for health checks
    app.state.startup_time = datetime.utcnow()
    app.state.models_loaded = False
    
    # Load ML models
    try:
        logger.info("Loading ML models...")
        
        # Load question classifier
        logger.info("Getting classifier instance...")
        classifier = get_classifier()
        logger.info("Loading classifier...")
        classifier.load()
        logger.info("Classifier loaded successfully")
        
        # Load embedding model
        logger.info("Getting embedding model instance...")
        embedding_model = get_embedding_model()
        logger.info("Loading embedding model...")
        embedding_model.load()
        logger.info("Embedding model loaded successfully")
        
        # Load OCR model (OpenRouter)
        logger.info("Getting OpenRouter OCR model instance...")
        ocr_model = get_ocr_model()
        logger.info("Discovering free vision models from OpenRouter...")
        await ocr_model.load()
        logger.info("OpenRouter OCR model loaded successfully")
        
        # Start background task to refresh OCR models periodically
        refresh_task = asyncio.create_task(refresh_ocr_models_periodically())
        app.state.refresh_task = refresh_task
        logger.info("Started OCR model refresh background task")
        
        # Load reranker model (optional - don't fail if it can't load)
        try:
            logger.info("Loading reranker model...")
            rerank_service.load_model()
            if rerank_service.loaded:
                logger.info("Reranker model loaded successfully")
            else:
                logger.warning("Reranker model could not be loaded, reranking will be disabled")
        except Exception as e:
            logger.warning(f"Failed to load reranker model: {e}")
            logger.warning("Search will work but without reranking")
        
        app.state.models_loaded = True
        logger.info("All ML models loaded successfully")
        
    except Exception as e:
        logger.error(f"Failed to load ML models: {e}")
        logger.warning("Service will start but ML endpoints will return 503")
    
    yield
    
    # Shutdown
    logger.info(f"Shutting down {settings.service_name}")
    
    # Cancel background task
    if hasattr(app.state, 'refresh_task'):
        app.state.refresh_task.cancel()
        try:
            await app.state.refresh_task
        except asyncio.CancelledError:
            pass


# Create FastAPI app
app = FastAPI(
    title=settings.service_name,
    version=settings.service_version,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with authentication
app.include_router(
    classify.router,
    dependencies=[Depends(verify_api_key)]
)
app.include_router(
    embed.router,
    dependencies=[Depends(verify_api_key)]
)
app.include_router(
    rephrase.router,
    dependencies=[Depends(verify_api_key)]
)
app.include_router(
    ocr.router,
    dependencies=[Depends(verify_api_key)]
)
app.include_router(
    search.router,
    dependencies=[Depends(verify_api_key)]
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint to verify service is running.
    """
    return HealthResponse(
        status="healthy",
        service=settings.service_name,
        version=settings.service_version,
        timestamp=datetime.utcnow().isoformat(),
        models_loaded=getattr(app.state, "models_loaded", False)
    )


@app.get("/")
async def root() -> Dict[str, str]:
    """
    Root endpoint with basic service information.
    """
    return {
        "service": settings.service_name,
        "version": settings.service_version,
        "health_endpoint": "/health",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        workers=1 if settings.debug else settings.workers
    )