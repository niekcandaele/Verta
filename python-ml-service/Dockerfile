FROM python:3.11-slim

# Add image metadata
LABEL org.opencontainers.image.source="https://github.com/niekcandaele/Verta"
LABEL org.opencontainers.image.description="Verta ML Service - Python-based machine learning service"
LABEL org.opencontainers.image.licenses="MIT"

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create directory for model cache
RUN mkdir -p /models

# Set model cache environment variables
ENV HF_HOME=/models
ENV TRANSFORMERS_CACHE=/models
ENV SENTENCE_TRANSFORMERS_HOME=/models

# Copy download script and download models during build
COPY download_models.py .
RUN python download_models.py

# Copy application code
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ML_SERVICE_HOST=0.0.0.0
ENV ML_SERVICE_PORT=8000

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "app.py"]