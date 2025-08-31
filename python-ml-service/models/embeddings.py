import logging
from typing import List, Union
import numpy as np

try:
    import torch
    from sentence_transformers import SentenceTransformer
    REAL_MODELS_AVAILABLE = True
except ImportError:
    REAL_MODELS_AVAILABLE = False

logger = logging.getLogger(__name__)


class EmbeddingModel:
    """
    Handles text embedding generation using BGE-M3 model.
    """
    
    def __init__(self, model_name: str = "BAAI/bge-m3"):
        self.model_name = model_name
        self.model = None
        self.device = "cpu"  # CPU-only as specified
        self.loaded = False
        self.embedding_dimension = 1024  # BGE-M3 default dimension
        
    def load(self) -> None:
        """
        Load the embedding model from HuggingFace.
        """
        try:
            logger.info(f"Loading embedding model: {self.model_name}")
            
            if REAL_MODELS_AVAILABLE:
                try:
                    logger.info("Creating SentenceTransformer instance...")
                    # Load model directly from cached folder
                    import os
                    model_path = "/models/BAAI_bge-m3"
                    if os.path.exists(model_path):
                        logger.info(f"Loading from cached path: {model_path}")
                        self.model = SentenceTransformer(model_path, device=self.device)
                    else:
                        logger.info(f"Cached path not found, loading from HF with cache")
                        self.model = SentenceTransformer(
                            self.model_name,
                            device=self.device,
                            cache_folder="/models"
                        )
                    logger.info("SentenceTransformer instance created")
                    
                    # Set model to evaluation mode
                    self.model.eval()
                    logger.info("Model set to eval mode")
                    
                    # Verify embedding dimension
                    logger.info("Testing embedding generation...")
                    test_embedding = self.model.encode("test", convert_to_numpy=True)
                    self.embedding_dimension = len(test_embedding)
                    logger.info(f"Test embedding successful, dimension: {self.embedding_dimension}")
                except Exception as e:
                    # Fall back to mock model for demo
                    logger.warning(f"Could not load real model, using mock: {e}")
                    from models.mock_models import MockEmbeddingModel
                    self._mock = MockEmbeddingModel()
                    self._mock.load()
                    self.embedding_dimension = self._mock.embedding_dimension
            else:
                # Use mock model when SentenceTransformer is not available
                logger.warning("SentenceTransformer not available, using mock model")
                from models.mock_models import MockEmbeddingModel
                self._mock = MockEmbeddingModel()
                self._mock.load()
                self.embedding_dimension = self._mock.embedding_dimension
            
            self.loaded = True
            logger.info(f"Successfully loaded embedding model: {self.model_name} (dimension: {self.embedding_dimension})")
            
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise RuntimeError(f"Embedding model loading failed: {e}")
    
    def generate_embedding(self, text: str, normalize: bool = True) -> List[float]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text to embed
            normalize: Whether to normalize the embedding vector
            
        Returns:
            List of float values representing the embedding
        """
        if not self.loaded:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        # Use mock if available
        if hasattr(self, '_mock'):
            return self._mock.generate_embedding(text, normalize)
        
        try:
            # Generate embedding
            embedding = self.model.encode(
                text,
                convert_to_numpy=True,
                normalize_embeddings=normalize,
                show_progress_bar=False
            )
            
            # Convert to list for JSON serialization
            embedding_list = embedding.tolist()
            
            logger.debug(f"Generated embedding for text (length: {len(text)}, dimension: {len(embedding_list)})")
            
            return embedding_list
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise RuntimeError(f"Embedding generation failed: {e}")
    
    def batch_generate_embeddings(
        self, 
        texts: List[str], 
        normalize: bool = True,
        batch_size: int = 32
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to embed
            normalize: Whether to normalize the embedding vectors
            batch_size: Processing batch size
            
        Returns:
            List of embedding vectors
        """
        if not self.loaded:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        if not texts:
            return []
        
        # Filter out empty texts
        valid_texts = [t for t in texts if t and t.strip()]
        if not valid_texts:
            raise ValueError("All texts are empty")
        
        try:
            # Generate embeddings in batches
            embeddings = self.model.encode(
                valid_texts,
                convert_to_numpy=True,
                normalize_embeddings=normalize,
                batch_size=batch_size,
                show_progress_bar=False
            )
            
            # Convert to list for JSON serialization
            embeddings_list = embeddings.tolist()
            
            logger.debug(f"Generated {len(embeddings_list)} embeddings (batch_size: {batch_size})")
            
            return embeddings_list
            
        except Exception as e:
            logger.error(f"Batch embedding generation failed: {e}")
            raise RuntimeError(f"Batch embedding generation failed: {e}")
    
    def compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """
        Compute cosine similarity between two embeddings.
        
        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector
            
        Returns:
            Similarity score between -1 and 1
        """
        try:
            # Convert to numpy arrays
            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)
            
            # Compute cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            similarity = dot_product / (norm1 * norm2)
            
            return float(similarity)
            
        except Exception as e:
            logger.error(f"Similarity computation failed: {e}")
            raise RuntimeError(f"Similarity computation failed: {e}")


# Global instance for singleton pattern
_embedding_model_instance = None


def get_embedding_model() -> EmbeddingModel:
    """
    Get the singleton instance of the embedding model.
    """
    global _embedding_model_instance
    if _embedding_model_instance is None:
        _embedding_model_instance = EmbeddingModel()
    return _embedding_model_instance