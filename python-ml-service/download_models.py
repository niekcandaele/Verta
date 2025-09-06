#!/usr/bin/env python3
"""
Download ML models during Docker build to avoid runtime downloads.
This script is run during the Docker build process to cache models.
"""
import os
import sys
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Set cache directory
CACHE_DIR = "/models"
os.environ["HF_HOME"] = CACHE_DIR
os.environ["TRANSFORMERS_CACHE"] = CACHE_DIR
os.environ["SENTENCE_TRANSFORMERS_HOME"] = CACHE_DIR

def download_models():
    """Download and cache all required models."""
    
    logger.info(f"Starting model downloads to {CACHE_DIR}")
    
    # Download question classifier model
    logger.info("Downloading question classifier model...")
    try:
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        
        model_name = "shahrukhx01/question-vs-statement-classifier"
        tokenizer = AutoTokenizer.from_pretrained(model_name, cache_dir=CACHE_DIR)
        model = AutoModelForSequenceClassification.from_pretrained(model_name, cache_dir=CACHE_DIR)
        
        logger.info(f"✓ Successfully downloaded {model_name}")
        
        # Clean up to save memory
        del tokenizer
        del model
        
    except Exception as e:
        logger.error(f"Failed to download question classifier: {e}")
        sys.exit(1)
    
    # Download embedding model
    logger.info("Downloading BGE-M3 embedding model...")
    try:
        from sentence_transformers import SentenceTransformer
        
        model_name = "BAAI/bge-m3"
        # Download model and move to cache directory
        model = SentenceTransformer(model_name, cache_folder=CACHE_DIR)
        
        # Test the model to ensure it's fully downloaded
        test_embedding = model.encode("test", convert_to_numpy=True)
        logger.info(f"✓ Successfully downloaded {model_name} (dimension: {len(test_embedding)})")
        
        # Clean up
        del model
        
    except Exception as e:
        logger.error(f"Failed to download embedding model: {e}")
        sys.exit(1)
    
    # Download Jina reranker model
    logger.info("Downloading Jina reranker model...")
    try:
        from transformers import AutoModelForSequenceClassification
        import shutil
        
        model_name = "jinaai/jina-reranker-v2-base-multilingual"
        
        # Clear any existing cache for this model to ensure clean download
        cache_path = os.path.join(CACHE_DIR, f"models--{model_name.replace('/', '--')}")
        if os.path.exists(cache_path):
            logger.info(f"Clearing existing cache at {cache_path}")
            shutil.rmtree(cache_path)
        # Download with trust_remote_code since it uses custom architecture
        model = AutoModelForSequenceClassification.from_pretrained(
            model_name,
            trust_remote_code=True,
            cache_dir=CACHE_DIR
        )
        
        # Test the model to ensure it's fully downloaded
        if hasattr(model, 'compute_score'):
            logger.info(f"✓ Successfully downloaded {model_name} with compute_score method")
        else:
            logger.info(f"✓ Successfully downloaded {model_name}")
        
        # Clean up
        del model
        
    except Exception as e:
        logger.warning(f"Failed to download reranker model: {e}")
        logger.warning("Reranking will be disabled at runtime")
        # Don't exit - reranking is optional
    
    logger.info("All models downloaded successfully!")
    
    # List downloaded files for verification
    logger.info(f"Cache directory contents:")
    for root, dirs, files in os.walk(CACHE_DIR):
        level = root.replace(CACHE_DIR, '').count(os.sep)
        indent = ' ' * 2 * level
        logger.info(f"{indent}{os.path.basename(root)}/")
        subindent = ' ' * 2 * (level + 1)
        for file in files[:5]:  # Show first 5 files per directory
            logger.info(f"{subindent}{file}")
        if len(files) > 5:
            logger.info(f"{subindent}... and {len(files) - 5} more files")

if __name__ == "__main__":
    download_models()