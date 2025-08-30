"""
LLM service for rephrasing multi-part questions using OpenRouter via LiteLLM
"""
import os
import logging
import asyncio
from typing import List, Dict, Optional
from dataclasses import dataclass

from litellm import acompletion, completion

logger = logging.getLogger(__name__)

@dataclass
class Message:
    text: str
    author_id: str
    timestamp: str

class LLMService:
    def __init__(self):
        # Check for OpenRouter API key
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not set, LLM features will be disabled")
            self.enabled = False
            return
        
        self.enabled = True
        # Use Gemini Flash via OpenRouter for fast, cost-effective processing
        self.model = "openrouter/google/gemini-flash-1.5"
        
        # Configure generation settings
        self.temperature = 0.3  # Low temperature for consistent rephrasing
        self.max_tokens = 512
        
        logger.info(f"LLM service initialized with model: {self.model}")
    
    def is_available(self) -> bool:
        """Check if LLM service is available"""
        return self.enabled
    
    async def rephrase_messages(
        self,
        messages: List[Message],
        context: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Rephrase a series of messages into a coherent question
        
        Args:
            messages: List of messages to rephrase
            context: Optional context about the conversation
            
        Returns:
            Dictionary with rephrased text and metadata
        """
        if not self.is_available():
            raise RuntimeError("LLM service is not available - OPENROUTER_API_KEY not configured")
        
        # Build the prompt
        prompt = self._build_rephrase_prompt(messages, context)
        
        try:
            # Use async completion for better performance
            response = await acompletion(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that rephrases multi-part questions from Discord conversations into clear, coherent questions."},
                    {"role": "user", "content": prompt}
                ],
                api_key=self.api_key,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            
            # Extract the rephrased text
            rephrased_text = response.choices[0].message.content.strip()
            
            # Calculate confidence based on response quality
            confidence = self._calculate_confidence(messages, rephrased_text)
            
            return {
                "rephrased_text": rephrased_text,
                "original_messages": [msg.text for msg in messages],
                "confidence": confidence,
                "model": self.model.split("/")[-1],  # Extract just the model name
            }
        except Exception as e:
            logger.error(f"Failed to rephrase messages: {e}")
            raise
    
    def rephrase_messages_sync(
        self,
        messages: List[Message],
        context: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Synchronous version of rephrase_messages for compatibility
        """
        if not self.is_available():
            raise RuntimeError("LLM service is not available - OPENROUTER_API_KEY not configured")
        
        # Build the prompt
        prompt = self._build_rephrase_prompt(messages, context)
        
        try:
            # Use sync completion
            response = completion(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that rephrases multi-part questions from Discord conversations into clear, coherent questions."},
                    {"role": "user", "content": prompt}
                ],
                api_key=self.api_key,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            
            # Extract the rephrased text
            rephrased_text = response.choices[0].message.content.strip()
            
            # Calculate confidence based on response quality
            confidence = self._calculate_confidence(messages, rephrased_text)
            
            return {
                "rephrased_text": rephrased_text,
                "original_messages": [msg.text for msg in messages],
                "confidence": confidence,
                "model": self.model.split("/")[-1],
            }
        except Exception as e:
            logger.error(f"Failed to rephrase messages: {e}")
            raise
    
    def _build_rephrase_prompt(
        self,
        messages: List[Message],
        context: Optional[str]
    ) -> str:
        """Build the prompt for rephrasing messages"""
        
        # Format messages for the prompt
        message_text = "\n".join([
            f"[{msg.timestamp}] User {msg.author_id}: {msg.text}"
            for msg in messages
        ])
        
        prompt = f"""Task: Combine and rephrase the following messages into a single, clear, coherent question.

Rules:
1. Preserve the original intent and meaning
2. Combine related parts into one comprehensive question
3. Remove Discord-specific language (mentions, emojis, etc.)
4. Fix typos and grammar issues
5. Make the question standalone (no context needed to understand it)
6. If messages aren't actually a question, return "NOT_A_QUESTION"

Messages to rephrase:
{message_text}
"""
        
        if context:
            prompt += f"\n\nAdditional context: {context}\n"
        
        prompt += "\nRephrased question (or NOT_A_QUESTION):"
        
        return prompt
    
    def _calculate_confidence(
        self,
        messages: List[Message],
        rephrased_text: str
    ) -> float:
        """
        Calculate confidence score for the rephrasing
        
        Simple heuristic based on:
        - Whether rephrasing succeeded
        - Length similarity
        - NOT_A_QUESTION detection
        """
        if rephrased_text == "NOT_A_QUESTION":
            return 0.0
        
        # Calculate total original length
        original_length = sum(len(msg.text) for msg in messages)
        rephrased_length = len(rephrased_text)
        
        # Reasonable rephrasing should be somewhat shorter but not too short
        if rephrased_length < original_length * 0.3:
            return 0.6  # Too short, might have lost information
        elif rephrased_length > original_length * 1.5:
            return 0.7  # Too long, might have added information
        else:
            return 0.9  # Good length ratio

# Singleton instance
_llm_service: Optional[LLMService] = None

def get_llm_service() -> LLMService:
    """Get or create the LLM service instance"""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service