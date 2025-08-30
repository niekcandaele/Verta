import logging
from typing import Dict, Tuple

try:
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    REAL_MODELS_AVAILABLE = True
except ImportError:
    REAL_MODELS_AVAILABLE = False

logger = logging.getLogger(__name__)


class QuestionClassifier:
    """
    Handles question vs statement classification using HuggingFace model.
    """
    
    def __init__(self, model_name: str = "shahrukhx01/question-vs-statement-classifier"):
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        if REAL_MODELS_AVAILABLE:
            self.device = torch.device("cpu")  # CPU-only as specified
        else:
            self.device = None
        self.loaded = False
        
    def load(self) -> None:
        """
        Load the model and tokenizer from HuggingFace.
        """
        try:
            logger.info(f"Loading question classifier model: {self.model_name}")
            
            if REAL_MODELS_AVAILABLE:
                try:
                    # Try to load real model from cache
                    cache_dir = "/models"
                    self.tokenizer = AutoTokenizer.from_pretrained(self.model_name, cache_dir=cache_dir)
                    self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name, cache_dir=cache_dir)
                    
                    # Move model to CPU and set to evaluation mode
                    self.model.to(self.device)
                    self.model.eval()
                except Exception as e:
                    # Fall back to mock model for demo
                    logger.warning(f"Could not load real model, using mock: {e}")
                    from models.mock_models import MockQuestionClassifier
                    self._mock = MockQuestionClassifier()
                    self._mock.load()
            else:
                # Use mock model when torch is not available
                logger.warning("Torch not available, using mock model")
                from models.mock_models import MockQuestionClassifier
                self._mock = MockQuestionClassifier()
                self._mock.load()
            
            self.loaded = True
            logger.info(f"Successfully loaded model: {self.model_name}")
            
        except Exception as e:
            logger.error(f"Failed to load question classifier model: {e}")
            raise RuntimeError(f"Model loading failed: {e}")
    
    def classify(self, text: str) -> Tuple[bool, float]:
        """
        Classify text as question or statement.
        
        Args:
            text: Text to classify
            
        Returns:
            Tuple of (is_question, confidence_score)
        """
        if not self.loaded:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        # Use mock if available
        if hasattr(self, '_mock'):
            return self._mock.classify(text)
        
        try:
            # Tokenize input
            inputs = self.tokenizer(
                text, 
                return_tensors="pt",
                truncation=True,
                max_length=512,
                padding=True
            )
            
            # Move inputs to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Perform inference
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probabilities = torch.softmax(logits, dim=-1)
                
                # Get prediction and confidence
                predicted_class = torch.argmax(probabilities, dim=-1).item()
                confidence = probabilities[0][predicted_class].item()
                
                # Model outputs: 0 = statement, 1 = question
                is_question = predicted_class == 1
                
            logger.debug(f"Classified '{text[:50]}...' as {'question' if is_question else 'statement'} (confidence: {confidence:.2f})")
            
            return is_question, confidence
            
        except Exception as e:
            logger.error(f"Classification failed: {e}")
            raise RuntimeError(f"Classification failed: {e}")
    
    def batch_classify(self, texts: list) -> list:
        """
        Classify multiple texts at once for efficiency.
        
        Args:
            texts: List of texts to classify
            
        Returns:
            List of (is_question, confidence) tuples
        """
        if not self.loaded:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        if not texts:
            return []
        
        try:
            # Tokenize all inputs at once
            inputs = self.tokenizer(
                texts,
                return_tensors="pt",
                truncation=True,
                max_length=512,
                padding=True
            )
            
            # Move inputs to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Perform batch inference
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probabilities = torch.softmax(logits, dim=-1)
                
                # Get predictions and confidences
                predicted_classes = torch.argmax(probabilities, dim=-1)
                confidences = torch.max(probabilities, dim=-1).values
                
                results = []
                for pred_class, conf in zip(predicted_classes, confidences):
                    is_question = pred_class.item() == 1
                    confidence = conf.item()
                    results.append((is_question, confidence))
            
            return results
            
        except Exception as e:
            logger.error(f"Batch classification failed: {e}")
            raise RuntimeError(f"Batch classification failed: {e}")


# Global instance for singleton pattern
_classifier_instance = None


def get_classifier() -> QuestionClassifier:
    """
    Get the singleton instance of the question classifier.
    """
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = QuestionClassifier()
    return _classifier_instance