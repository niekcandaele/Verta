import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Service configuration
    service_name: str = "ML Service"
    service_version: str = "1.0.0"
    debug: bool = False
    
    # Server configuration
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4
    
    # API configuration
    api_key: Optional[str] = os.getenv("ADMIN_API_KEY")
    
    # Model configuration
    model_cache_dir: str = "/models"
    question_classifier_model: str = "shahrukhx01/question-vs-statement-classifier"
    embedding_model: str = "BAAI/bge-m3"
    
    # OpenRouter configuration for LLM
    openrouter_api_key: Optional[str] = os.getenv("OPENROUTER_API_KEY")
    openrouter_model: str = "google/gemini-2.0-flash-thinking-exp-1219"
    
    # Clustering configuration
    similarity_threshold: float = 0.85
    context_window_size: int = 5
    batch_processing_size: int = 100
    message_age_min_days: int = 7
    message_age_max_days: int = 30
    
    # Database configuration
    database_url: Optional[str] = os.getenv("DATABASE_URL")
    database_pool_size: int = 10
    database_timeout: int = 30
    
    class Config:
        env_file = ".env"
        env_prefix = "ML_SERVICE_"


settings = Settings()