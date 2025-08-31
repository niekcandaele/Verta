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
        
        prompt = f"""Task: Extract the CORE question from these messages. Be concise.

Rules:
1. Focus on the main problem or issue only
2. Remove ALL specific details (error codes, file names, tool names)
3. Keep it under 15 words if possible
4. Use simple, general language
5. If messages aren't a question, return "NOT_A_QUESTION"

Examples:
- Instead of: "Why does my Discord bot receive a 403 error when sending items to players?"
- Write: "Why does my bot get permission errors?"

- Instead of: "How do I configure CSMM on a separate server and adjust zombie settings?"
- Write: "How do I configure the server management tool?"

Messages to extract from:
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