import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import { MlClientService, OcrRequest, OcrResult } from '../MlClientService.js';

vi.mock('axios');

describe('MlClientService', () => {
  let service: MlClientService;
  let mockAxiosInstance: Partial<AxiosInstance>;
  let mockPost: Mock;

  beforeEach(() => {
    mockPost = vi.fn();
    mockAxiosInstance = {
      post: mockPost,
      get: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn(),
        },
        response: {
          use: vi.fn(),
        },
      },
    } as any;

    (axios.create as Mock).mockReturnValue(mockAxiosInstance);
    (axios.isAxiosError as any) = vi.fn().mockReturnValue(false);

    service = new MlClientService({
      baseUrl: 'http://localhost:8000',
      apiKey: 'test-api-key',
      timeout: 5000,
      maxRetries: 2,
      retryDelay: 100,
    });
  });

  describe('OCR methods', () => {
    describe('ocr', () => {
      it('should extract text from image URL', async () => {
        const mockResponse: OcrResult = {
          text: 'Extracted text from image',
          full_response: 'Extracted text from image',
          visual_context: 'Image shows text',
          confidence: 0.95,
          processing_time_ms: 1234,
          model_used: 'openrouter',
          model_name: 'gemini-flash',
          attempts: 1,
        };

        mockPost.mockResolvedValueOnce({ data: mockResponse });

        const request: OcrRequest = {
          image_url: 'https://example.com/image.png',
        };

        const result = await service.ocr(request);

        expect(mockPost).toHaveBeenCalledWith('/api/ml/ocr', request);
        expect(result).toEqual(mockResponse);
        expect(result.text).toBe('Extracted text from image');
        expect(result.confidence).toBe(0.95);
        expect(result.model_used).toBe('openrouter');
      });

      it('should extract text from base64 image', async () => {
        const mockResponse: OcrResult = {
          text: 'Base64 image text',
          full_response: 'Base64 image text',
          visual_context: 'Image shows text',
          confidence: 0.92,
          processing_time_ms: 890,
          model_used: 'openrouter',
          model_name: 'gemini-flash',
          attempts: 1,
        };

        mockPost.mockResolvedValueOnce({ data: mockResponse });

        const request: OcrRequest = {
          image_base64: 'data:image/png;base64,iVBORw0KGgo...',
        };

        const result = await service.ocr(request);

        expect(mockPost).toHaveBeenCalledWith('/api/ml/ocr', request);
        expect(result).toEqual(mockResponse);
        expect(result.text).toBe('Base64 image text');
      });

      it('should retry on transient failures', async () => {
        const mockResponse: OcrResult = {
          text: 'Success after retry',
          full_response: 'Success after retry',
          visual_context: 'Image shows text',
          confidence: 0.88,
          processing_time_ms: 2000,
          model_used: 'openrouter',
          model_name: 'gemini-flash',
          attempts: 2,
        };

        // First call fails, second succeeds
        mockPost
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({ data: mockResponse });

        const request: OcrRequest = {
          image_url: 'https://example.com/image.png',
        };

        const result = await service.ocr(request);

        expect(mockPost).toHaveBeenCalledTimes(2);
        expect(result).toEqual(mockResponse);
      });

      it('should not retry on client errors', async () => {
        const clientError = {
          response: {
            status: 400,
            data: { detail: 'Invalid image format' },
          },
          isAxiosError: true,
        };

        (axios.isAxiosError as any).mockReturnValue(true);
        mockPost.mockRejectedValueOnce(clientError);

        const request: OcrRequest = {
          image_url: 'https://example.com/invalid.txt',
        };

        await expect(service.ocr(request)).rejects.toEqual(clientError);
        expect(mockPost).toHaveBeenCalledTimes(1);
      });

      it('should throw after max retries', async () => {
        mockPost
          .mockRejectedValueOnce(new Error('Error 1'))
          .mockRejectedValueOnce(new Error('Error 2'));

        const request: OcrRequest = {
          image_url: 'https://example.com/image.png',
        };

        await expect(service.ocr(request)).rejects.toThrow('Error 2');
        expect(mockPost).toHaveBeenCalledTimes(2);
      });
    });

    describe('ocrBatch', () => {
      it('should process multiple images', async () => {
        const mockResponse = {
          results: [
            {
              text: 'First image text',
              confidence: 0.91,
              blocks: [],
              processing_time_ms: 1100,
            },
            {
              text: 'Second image text',
              confidence: 0.93,
              blocks: [],
              processing_time_ms: 1200,
            },
          ],
        };

        mockPost.mockResolvedValueOnce({ data: mockResponse });

        const request = {
          images: [
            { image_url: 'https://example.com/image1.png' },
            { image_url: 'https://example.com/image2.png' },
          ],
        };

        const results = await service.ocrBatch(request);

        expect(mockPost).toHaveBeenCalledWith('/api/ml/ocr/batch', request);
        expect(results).toEqual(mockResponse.results);
        expect(results).toHaveLength(2);
        expect(results[0].text).toBe('First image text');
        expect(results[1].text).toBe('Second image text');
      });

      it('should handle mixed URL and base64 images', async () => {
        const mockResponse = {
          results: [
            {
              text: 'URL image',
              confidence: 0.9,
              blocks: [],
              processing_time_ms: 1000,
            },
            {
              text: 'Base64 image',
              confidence: 0.92,
              blocks: [],
              processing_time_ms: 1100,
            },
          ],
        };

        mockPost.mockResolvedValueOnce({ data: mockResponse });

        const request = {
          images: [
            { image_url: 'https://example.com/image.png' },
            { image_base64: 'data:image/png;base64,iVBORw0KGgo...' },
          ],
        };

        const results = await service.ocrBatch(request);

        expect(mockPost).toHaveBeenCalledWith('/api/ml/ocr/batch', request);
        expect(results).toHaveLength(2);
        expect(results[0].text).toBe('URL image');
        expect(results[1].text).toBe('Base64 image');
      });

      it('should retry batch operations on failure', async () => {
        const mockResponse = {
          results: [
            {
              text: 'Success',
              confidence: 0.89,
              blocks: [],
              processing_time_ms: 900,
            },
          ],
        };

        mockPost
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce({ data: mockResponse });

        const request = {
          images: [{ image_url: 'https://example.com/image.png' }],
        };

        const results = await service.ocrBatch(request);

        expect(mockPost).toHaveBeenCalledTimes(2);
        expect(results).toEqual(mockResponse.results);
      });
    });
  });

  describe('Circuit breaker', () => {
    it('should open circuit after failure threshold', async () => {
      // Mock 5 consecutive failures (threshold is 5)
      for (let i = 0; i < 5; i++) {
        mockPost.mockRejectedValueOnce(new Error(`Error ${i}`));
      }

      const request: OcrRequest = {
        image_url: 'https://example.com/image.png',
      };

      // First 5 attempts should fail normally
      for (let i = 0; i < 5; i++) {
        await expect(service.ocr(request)).rejects.toThrow();
      }

      // Circuit should now be open, next attempt should fail immediately
      await expect(service.ocr(request)).rejects.toThrow(
        'Circuit breaker is OPEN - ML service is unavailable'
      );
    });
  });
});
