"""
Mock models for testing without downloading large ML models.
Replace with real models for production.
"""
import logging
import random
import hashlib
from typing import List, Tuple

logger = logging.getLogger(__name__)


class MockQuestionClassifier:
    """Mock classifier for demo purposes."""
    
    def __init__(self):
        self.loaded = False
        
    def load(self):
        logger.info("Loading mock question classifier")
        self.loaded = True
        
    def classify(self, text: str) -> Tuple[bool, float]:
        if not self.loaded:
            raise RuntimeError("Model not loaded")
        
        # Simple heuristic: questions often start with question words or end with ?
        text_lower = text.lower().strip()
        is_question = (
            text_lower.endswith('?') or
            text_lower.startswith(('what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'can', 'could', 'would', 'should', 'do', 'does'))
        )
        
        # Generate consistent confidence based on text hash
        confidence = 0.7 + (hash(text) % 30) / 100
        
        return is_question, confidence
    
    def batch_classify(self, texts: list) -> list:
        return [self.classify(text) for text in texts]


class MockEmbeddingModel:
    """Mock embedding model for demo purposes."""
    
    def __init__(self):
        self.loaded = False
        self.embedding_dimension = 768
        
    def load(self):
        logger.info("Loading mock embedding model")
        self.loaded = True
        
    def generate_embedding(self, text: str, normalize: bool = True) -> List[float]:
        if not self.loaded:
            raise RuntimeError("Model not loaded")
        
        # Generate deterministic embedding based on text hash
        random.seed(hashlib.md5(text.encode()).hexdigest())
        embedding = [random.random() * 2 - 1 for _ in range(self.embedding_dimension)]
        
        if normalize:
            # Simple normalization
            magnitude = sum(x**2 for x in embedding) ** 0.5
            if magnitude > 0:
                embedding = [x / magnitude for x in embedding]
        
        return embedding
    
    def batch_generate_embeddings(self, texts: List[str], normalize: bool = True, batch_size: int = 32) -> List[List[float]]:
        return [self.generate_embedding(text, normalize) for text in texts]
    
    def compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        # Simple cosine similarity
        dot_product = sum(a * b for a, b in zip(embedding1, embedding2))
        mag1 = sum(x**2 for x in embedding1) ** 0.5
        mag2 = sum(x**2 for x in embedding2) ** 0.5
        
        if mag1 == 0 or mag2 == 0:
            return 0.0
        
        return dot_product / (mag1 * mag2)