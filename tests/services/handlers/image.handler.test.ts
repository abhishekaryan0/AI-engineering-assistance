/**
 * Image Handler Tests
 * Tests for image processing and vision analysis
 */

import { ImageHandler } from '../../../src/services/handlers/image.handler';
import { llmService } from '../../../src/services/llm/llm.service';
import { logger } from '../../../src/utils/logger';
import sharp from 'sharp';

// Mock dependencies
jest.mock('sharp', () => {
  const mSharp = {
    resize: jest.fn().mockReturnThis(),
    toFormat: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image')),
  };
  return jest.fn(() => mSharp);
});

jest.mock('../../../src/services/llm/llm.service', () => ({
  llmService: {
    vision: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Image Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should process image and return text content', async () => {
      const buffer = Buffer.from('image-content');
      const sessionId = 'test-session';
      const filename = 'test.jpg';
      const mockContent = 'Extracted text from image';
      const mockUsage = { total_tokens: 100 };

      (llmService.vision as jest.Mock).mockResolvedValue({
        content: mockContent,
        usage: mockUsage,
      });

      const result = await ImageHandler.process(buffer, sessionId, filename);

      expect(sharp).toHaveBeenCalledWith(buffer);
      expect(llmService.vision).toHaveBeenCalledWith(
        expect.any(String), // base64
        expect.stringContaining('Analyze this image')
      );
      expect(result).toEqual({ textContent: mockContent, usage: mockUsage });
    });

    it('should handle empty content from vision service', async () => {
      const buffer = Buffer.from('image-content');

      (llmService.vision as jest.Mock).mockResolvedValue({
        content: '',
        usage: undefined,
      });

      const result = await ImageHandler.process(buffer, 'sess', 'file.jpg');

      expect(result.textContent).toContain('Error: The image could not be analyzed');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Received empty content'));
    });

    it('should handle image processing errors', async () => {
      const buffer = Buffer.from('bad-image');

      (sharp as unknown as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Sharp error');
      });

      await expect(ImageHandler.process(buffer, 'sess', 'file.jpg')).rejects.toThrow(
        'Failed to process image: Sharp error'
      );

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle LLM service errors', async () => {
      const buffer = Buffer.from('image');

      (llmService.vision as jest.Mock).mockRejectedValue(new Error('LLM error'));

      await expect(ImageHandler.process(buffer, 'sess', 'file.jpg')).rejects.toThrow(
        'Failed to process image: LLM error'
      );
    });

    it('should use correct prompt with filename', async () => {
      const buffer = Buffer.from('image');
      const filename = 'specific-file.png';

      (llmService.vision as jest.Mock).mockResolvedValue({ content: 'ok' });

      await ImageHandler.process(buffer, 'sess', filename);

      expect(llmService.vision).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(filename)
      );
    });
  });
});
