import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from models.classifier import get_classifier
from models.embeddings import get_embedding_model
from endpoints import classify, embed, rephrase
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
        
        app.state.models_loaded = True
        logger.info("All ML models loaded successfully")
        
    except Exception as e:
        logger.error(f"Failed to load ML models: {e}")
        logger.warning("Service will start but ML endpoints will return 503")
    
    yield
    
    # Shutdown
    logger.info(f"Shutting down {settings.service_name}")


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