import logging
import base64
import io
import time
import asyncio
import aiohttp
from typing import Dict, List, Optional, Any
from PIL import Image
import requests

logger = logging.getLogger(__name__)


class OpenRouterOCRModel:
    """
    Handles OCR text extraction using OpenRouter's free vision models.
    """
    
    def __init__(self, api_key: str):
        """
        Initialize OpenRouter OCR model.
        
        Args:
            api_key: OpenRouter API key
        """
        self.api_key = api_key
        self.available_models = []
        self.loaded = False
        self.base_url = "https://openrouter.ai/api/v1"
        self.last_refresh = 0
        
        # Exponential backoff delays in seconds
        self.retry_delays = [1, 2, 4, 8, 16, 32]
        
        # Help channel-focused prompt for text extraction with relevant context
        self.ocr_prompt = """This image was posted in a help/support channel. Provide a helpful analysis for troubleshooting.

First, briefly describe what you see that's relevant for troubleshooting (1-2 sentences):
- What type of interface or window is shown (game, browser, terminal, error dialog, etc.)
- What application or system is being used
- The general state or situation (error screen, settings menu, log output, etc.)

Then extract ALL visible text, including:
- Error messages, warnings, or system notifications
- Code snippets, commands, or configuration text
- Log output or console messages
- UI text showing settings, options, or status
- Chat messages or dialogue boxes
- Version numbers, IDs, or technical identifiers
- File paths, URLs, or server addresses
- Game/application text, stats, or values
- Instructions, tooltips, or help text
- Any other text visible in the image

Transcribe text exactly as shown, preserving formatting and spacing.
If parts are unclear, mark with [unclear].
If no text is visible, mention that in your response.

Remember: This is from a help channel, so both the context and extracted text are important for troubleshooting."""
        
    async def refresh_models(self) -> None:
        """
        Refresh the list of available free vision models from OpenRouter.
        """
        try:
            logger.info("Refreshing OpenRouter free vision models...")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": "https://verta.app",
                "X-Title": "Verta ML Service"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/models",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status != 200:
                        text = await response.text()
                        raise RuntimeError(f"Failed to fetch models: {response.status} - {text}")
                    
                    data = await response.json()
                    all_models = data.get("data", [])
                    
                    # Filter for free vision models
                    new_models = []
                    for model in all_models:
                        # Check if model is free (pricing.prompt = 0 or "0")
                        pricing = model.get("pricing", {})
                        prompt_price = pricing.get("prompt", "1")
                        
                        # Handle both string and numeric values
                        try:
                            is_free = float(str(prompt_price)) == 0
                        except (ValueError, TypeError):
                            is_free = False
                        
                        # Check if model supports images
                        modalities = model.get("architecture", {}).get("modality", "")
                        supports_images = "image" in modalities.lower() or "multimodal" in modalities.lower()
                        
                        # Also check context_length to ensure it's reasonable
                        context_length = model.get("context_length", 0)
                        
                        if is_free and supports_images and context_length > 0:
                            new_models.append({
                                "id": model["id"],
                                "name": model.get("name", model["id"]),
                                "context_length": context_length
                            })
                            logger.info(f"Found free vision model: {model['id']}")
            
            if not new_models:
                # Fallback to known free vision models if discovery fails
                logger.warning("No free vision models found via API, using fallback list")
                new_models = [
                    {"id": "google/gemini-2.0-flash-exp:free", "name": "Gemini 2.0 Flash Exp", "context_length": 1048576},
                    {"id": "google/gemini-flash-1.5-8b", "name": "Gemini Flash 1.5 8B", "context_length": 1048576},
                    {"id": "meta-llama/llama-3.2-11b-vision-instruct:free", "name": "Llama 3.2 11B Vision", "context_length": 131072}
                ]
            
            # Update the models list atomically
            self.available_models = new_models
            self.last_refresh = time.time()
            logger.info(f"Successfully refreshed {len(self.available_models)} free vision models")
            
        except Exception as e:
            logger.error(f"Failed to refresh OpenRouter models: {e}")
            # Keep existing models on refresh failure
            logger.info(f"Keeping existing models: {[m['id'] for m in self.available_models]}")
    
    async def load(self) -> None:
        """
        Initial load of available free vision models from OpenRouter.
        """
        # Use fallback models initially
        self.available_models = [
            {"id": "google/gemini-2.0-flash-exp:free", "name": "Gemini 2.0 Flash Exp", "context_length": 1048576},
            {"id": "google/gemini-flash-1.5-8b", "name": "Gemini Flash 1.5 8B", "context_length": 1048576},
            {"id": "meta-llama/llama-3.2-11b-vision-instruct:free", "name": "Llama 3.2 11B Vision", "context_length": 131072}
        ]
        self.loaded = True
        
        # Then try to refresh with actual API data
        await self.refresh_models()
    
    def _load_image_from_url(self, url: str, timeout: int = 10) -> Image.Image:
        """
        Download and load image from URL.
        
        Args:
            url: URL of the image
            timeout: Request timeout in seconds
            
        Returns:
            PIL Image object
        """
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            return Image.open(io.BytesIO(response.content))
        except Exception as e:
            logger.error(f"Failed to load image from URL: {e}")
            raise ValueError(f"Could not load image from URL: {e}")
    
    def _load_image_from_base64(self, base64_string: str) -> Image.Image:
        """
        Load image from base64 string.
        
        Args:
            base64_string: Base64 encoded image (with or without data URI prefix)
            
        Returns:
            PIL Image object
        """
        try:
            # Remove data URI prefix if present
            if base64_string.startswith('data:'):
                base64_string = base64_string.split(',')[1]
            
            image_data = base64.b64decode(base64_string)
            return Image.open(io.BytesIO(image_data))
        except Exception as e:
            logger.error(f"Failed to load image from base64: {e}")
            raise ValueError(f"Could not decode base64 image: {e}")
    
    def _image_to_base64(self, image: Image.Image, format: str = "PNG") -> str:
        """
        Convert PIL Image to base64 string.
        
        Args:
            image: PIL Image object
            format: Image format (PNG or JPEG)
            
        Returns:
            Base64 encoded string with data URI prefix
        """
        buffered = io.BytesIO()
        
        # Convert RGBA to RGB if saving as JPEG
        if format == "JPEG" and image.mode in ("RGBA", "LA", "P"):
            # Create a white background
            rgb_image = Image.new("RGB", image.size, (255, 255, 255))
            # Paste the image on the white background using alpha channel as mask
            if image.mode == "P":
                image = image.convert("RGBA")
            rgb_image.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
            image = rgb_image
        
        image.save(buffered, format=format)
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        mime_type = "image/png" if format == "PNG" else "image/jpeg"
        return f"data:{mime_type};base64,{img_base64}"
    
    async def _call_openrouter(
        self,
        model_id: str,
        image_base64_uri: str,
        prompt: str
    ) -> Dict[str, Any]:
        """
        Call OpenRouter API with image and prompt.
        
        Args:
            model_id: OpenRouter model ID
            image_base64_uri: Base64 encoded image with data URI prefix
            prompt: Text prompt for the model
            
        Returns:
            API response
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://verta.app",
            "X-Title": "Verta ML Service",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model_id,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_base64_uri
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ],
            "temperature": 0.1,  # Low temperature for more consistent text extraction
            "max_tokens": 4096
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                response_text = await response.text()
                
                if response.status == 429:
                    # Rate limit error
                    logger.warning(f"Rate limited on model {model_id}")
                    raise Exception("RATE_LIMIT")
                
                if response.status != 200:
                    logger.error(f"OpenRouter API error: {response.status} - {response_text}")
                    raise Exception(f"API error: {response.status}")
                
                try:
                    data = await response.json()
                    return data
                except Exception as e:
                    logger.error(f"Failed to parse response: {response_text}")
                    raise Exception(f"Invalid response format: {e}")
    
    async def extract_text_with_retry(
        self,
        image: Image.Image
    ) -> Dict[str, Any]:
        """
        Extract text from image with exponential retry and model rotation.
        
        Args:
            image: PIL Image object
            
        Returns:
            Extraction result
        """
        if not self.available_models:
            raise RuntimeError("No vision models available")
        
        # Convert image to base64
        # Try JPEG first for smaller size, fallback to PNG if needed
        try:
            image_base64 = self._image_to_base64(image, format="JPEG")
        except Exception:
            image_base64 = self._image_to_base64(image, format="PNG")
        
        last_error = None
        models_to_try = self.available_models.copy()
        attempt_count = 0
        
        for delay_index, delay in enumerate(self.retry_delays):
            for model_index, model in enumerate(models_to_try):
                attempt_count += 1
                model_id = model["id"]
                
                logger.info(f"Attempting OCR with model {model_id} (attempt {attempt_count})")
                
                try:
                    start_time = time.time()
                    result = await self._call_openrouter(
                        model_id,
                        image_base64,
                        self.ocr_prompt
                    )
                    
                    processing_time_ms = int((time.time() - start_time) * 1000)
                    
                    # Extract the text from the response
                    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    
                    # Store the entire response as-is
                    text_content = content.strip()
                    visual_context = ""  # Not used anymore, keeping for compatibility
                    
                    # Check if no text was found
                    if "no text" in text_content.lower() and "visible" in text_content.lower():
                        # Still store the full response even if no text was found
                        # The context might still be useful
                        pass
                    
                    logger.info(f"OCR successful with {model_id} in {processing_time_ms}ms")
                    
                    return {
                        "text": text_content,
                        "full_response": content,
                        "visual_context": visual_context,
                        "model_used": model_id,
                        "model_name": model["name"],
                        "processing_time_ms": processing_time_ms,
                        "attempts": attempt_count
                    }
                    
                except Exception as e:
                    error_msg = str(e)
                    last_error = e
                    
                    if "RATE_LIMIT" in error_msg:
                        logger.warning(f"Rate limit hit for {model_id}, trying next model or waiting...")
                        # Try next model immediately
                        continue
                    else:
                        logger.error(f"Error with model {model_id}: {error_msg}")
                        # Try next model immediately
                        continue
            
            # If we've tried all models and still failing, wait before next round
            if delay_index < len(self.retry_delays) - 1:
                logger.info(f"All models failed, waiting {delay}s before retry...")
                await asyncio.sleep(delay)
        
        # All attempts failed
        raise RuntimeError(f"OCR failed after {attempt_count} attempts: {last_error}")
    
    async def extract_text(
        self,
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
        preprocessing: bool = True  # Kept for compatibility
    ) -> Dict:
        """
        Extract text from image using OCR.
        Async method for FastAPI compatibility.
        
        Args:
            image_url: URL of the image to process
            image_base64: Base64 encoded image
            preprocessing: Ignored, kept for compatibility
            
        Returns:
            Dictionary with extracted text and metadata
        """
        if not self.loaded:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        if not image_url and not image_base64:
            raise ValueError("Either image_url or image_base64 must be provided")
        
        try:
            # Load image using asyncio.to_thread for sync operations
            if image_url:
                image = await asyncio.to_thread(self._load_image_from_url, image_url)
            else:
                image = await asyncio.to_thread(self._load_image_from_base64, image_base64)
            
            # Validate image size (max 20MB estimated)
            if image.width * image.height > 20_000_000:
                # Resize if too large
                max_dimension = 4000
                if image.width > max_dimension or image.height > max_dimension:
                    await asyncio.to_thread(image.thumbnail, (max_dimension, max_dimension), Image.Resampling.LANCZOS)
                    logger.info(f"Resized image to {image.width}x{image.height}")
            
            # Now we can directly await the async method
            result = await self.extract_text_with_retry(image)
            
            return {
                "text": result["text"],
                "confidence": 0.95,  # Fixed confidence since we don't get this from vision models
                "blocks": [],  # No bounding boxes from vision models
                "processing_time_ms": result["processing_time_ms"],
                "model_used": result["model_used"],
                "model_name": result["model_name"],
                "full_response": result["full_response"],
                "visual_context": result.get("visual_context", ""),
                "attempts": result["attempts"]
            }
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            raise RuntimeError(f"OCR extraction failed: {e}")
    
    async def batch_extract(
        self,
        images: List[Dict[str, str]],
        preprocessing: bool = True
    ) -> List[Dict]:
        """
        Extract text from multiple images.
        
        Args:
            images: List of dicts with 'image_url' or 'image_base64' keys
            preprocessing: Ignored, kept for compatibility
            
        Returns:
            List of extraction results
        """
        if not self.loaded:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        results = []
        for image_spec in images:
            try:
                result = await self.extract_text(
                    image_url=image_spec.get('image_url'),
                    image_base64=image_spec.get('image_base64'),
                    preprocessing=preprocessing
                )
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to process image in batch: {e}")
                results.append({
                    "text": "",
                    "confidence": 0.0,
                    "blocks": [],
                    "error": str(e)
                })
        
        return results


# Global instance for singleton pattern
_ocr_instance = None


def get_ocr_model() -> OpenRouterOCRModel:
    """
    Get the singleton instance of the OCR model.
    """
    global _ocr_instance
    if _ocr_instance is None:
        from config import settings
        if not settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY not configured")
        _ocr_instance = OpenRouterOCRModel(api_key=settings.openrouter_api_key)
    return _ocr_instance