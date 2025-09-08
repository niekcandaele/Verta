import logging
from typing import List, Dict, Any, Optional
import json
import os
import torch
from transformers import AutoModelForSequenceClassification

logger = logging.getLogger(__name__)


class RerankService:
    """Service for reranking search results using Jina reranker model."""
    
    def __init__(self):
        self.model = None
        self.model_name = 'jinaai/jina-reranker-v2-base-multilingual'
        self.loaded = False
        self.device = 'cpu'
    
    def load_model(self):
        """Load the reranker model if not already loaded."""
        if not self.loaded:
            try:
                logger.info(f"Loading reranker model: {self.model_name}")
                
                # Try to load model only (without separate tokenizer)
                # The Jina model has a compute_score method that handles tokenization internally
                # Use cache directory if available
                cache_dir = os.environ.get('HF_HOME', '/models')
                self.model = AutoModelForSequenceClassification.from_pretrained(
                    self.model_name,
                    trust_remote_code=True,
                    torch_dtype="auto",
                    cache_dir=cache_dir
                ).to(self.device).eval()
                
                self.loaded = True
                logger.info("Reranker model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load reranker model: {e}")
                self.model = None
                self.loaded = False
    
    async def rerank_results(
        self,
        query: str,
        results: List[Dict[str, Any]],
        top_k: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Rerank search results using LLM to improve relevance.
        
        Args:
            query: User's search query
            results: List of search results to rerank
            top_k: Number of results to return after reranking
            
        Returns:
            Reranked list of results
        """
        if not results:
            return []
        
        if len(results) <= 1:
            return results
        
        # If we have few results, skip reranking
        if len(results) <= 3:
            return results[:top_k]
        
        try:
            # Load model if not already loaded
            if not self.loaded:
                self.load_model()
            
            # If model failed to load, return original results
            if not self.model:
                logger.warning("Reranker model not available, returning original order")
                return results[:top_k]
            
            # Prepare query-document pairs for reranking
            pairs = []
            indices = []
            
            for i, result in enumerate(results[:20]):  # Limit to top 20 for reranking
                if result['type'] == 'golden_answer':
                    content = result['content']
                else:  # message
                    content = result['excerpt']
                
                # Create [query, document] pair for the reranker
                pairs.append([query, content])
                indices.append(i)
            
            # Get reranking scores from the model
            import time
            start = time.time()
            logger.info(f"Starting reranking of {len(pairs)} results")
            scores = self._compute_scores(pairs)
            end = time.time()
            logger.info(f"Reranking completed in {end - start:.2f}s")
            
            # Create list of (index, score) tuples and sort by score (descending)
            scored_results = list(zip(indices, scores))
            scored_results.sort(key=lambda x: x[1], reverse=True)
            
            # Reorder results based on reranking scores
            reranked = []
            for idx, score in scored_results[:top_k]:
                result = results[idx].copy()
                # Update score with reranking score (normalized to 0-1)
                # Jina reranker returns raw scores, not probabilities
                result['rerank_score'] = float(score)
                reranked.append(result)
            
            logger.debug(f"Reranking complete, returning {len(reranked)} results")
            return reranked
            
        except Exception as e:
            logger.error(f"Reranking failed: {e}")
            # Fall back to original ordering
            return results[:top_k]
    
    def _compute_scores(self, pairs: List[List[str]]) -> List[float]:
        """Compute reranking scores for query-document pairs."""
        try:
            # Use the model's compute_score method if available (Jina models have this)
            if hasattr(self.model, 'compute_score'):
                import time
                start = time.time()
                
                # Process in batches for better performance
                batch_size = 8  # Adjust based on memory constraints
                all_scores = []
                
                for i in range(0, len(pairs), batch_size):
                    batch = pairs[i:i + batch_size]
                    batch_start = time.time()
                    batch_scores = self.model.compute_score(batch, max_length=512)
                    
                    # Convert to list if necessary
                    if isinstance(batch_scores, torch.Tensor):
                        batch_scores = batch_scores.cpu().numpy().tolist()
                    elif not isinstance(batch_scores, list):
                        batch_scores = list(batch_scores)
                    
                    all_scores.extend(batch_scores)
                    batch_end = time.time()
                    logger.debug(f"Batch {i//batch_size + 1} processed in {batch_end - batch_start:.2f}s")
                
                end = time.time()
                logger.info(f"All batches processed in {end - start:.2f}s")
                return all_scores
            else:
                # Fallback: this shouldn't happen with Jina models
                logger.error("Model doesn't have compute_score method")
                return [0.5] * len(pairs)
                
        except Exception as e:
            logger.error(f"Failed to compute scores: {e}")
            # Return equal scores if computation fails
            return [0.5] * len(pairs)


# Global rerank service instance
rerank_service = RerankService()