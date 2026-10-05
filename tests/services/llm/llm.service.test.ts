import OpenAI from 'openai'; // for types
import { env } from '../../../src/config/config';
import { logger } from '../../../src/utils/logger';
import { AppError } from '../../../src/utils/AppError';

// Mock Dependencies
jest.mock('../../../src/config/config', () => ({
  env: {
    AI_MODEL_NAME: 'test-model',
    AI_MODEL_EMBEDDING: 'embedding-model',
    AI_MODEL_DECISION: 'decision-model',
    AI_MODEL_VISION: 'vision-model',
    OPENROUTER_BASE: 'https://test.url',
    OPENROUTER_API_KEY: 'test-key',
  },
}));
jest.mock('../../../src/utils/logger');

// Define mocks at module level
const mockCreateChat = jest.fn();
const mockCreateEmbedding = jest.fn();

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: class OpenAI {
      chat = {
        completions: {
          create: mockCreateChat,
        },
      };
      embeddings = {
        create: mockCreateEmbedding,
      };
      constructor() {
        console.log('DEBUG: OpenAI Mock Constructor Called');
      }
    },
  };
});

// Import service AFTER mock definition
import { llmService } from '../../../src/services/llm/llm.service';

describe('LLM Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('embed', () => {
    it('should generate embeddings successfully', async () => {
      mockCreateEmbedding.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 10 },
      });

      const result = await llmService.embed('test text');

      expect(mockCreateEmbedding).toHaveBeenCalledWith({
        model: 'embedding-model',
        input: 'test text',
        encoding_format: 'float',
      });
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.usage).toEqual({ total_tokens: 10 });
    });

    it('should handle embedding errors', async () => {
      mockCreateEmbedding.mockRejectedValue(new Error('API Error'));
      await expect(llmService.embed('test')).rejects.toThrow('API Error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('atRiskAssistantChat', () => {
    it('should return chat completion and remove think tags', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: '<think>Thoughts</think> AtRisk Answer' } }],
        usage: { total_tokens: 30 },
      });

      const result = await llmService.atRiskAssistantChat([{ role: 'user', content: 'Hi' }]);

      expect(mockCreateChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0.3,
        })
      );
      expect(result.content).toBe('AtRisk Answer');
    });

    it('should not set temperature for o1- model', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: 'o1 Answer' } }],
        usage: { total_tokens: 15 },
      });

      await llmService.atRiskAssistantChat([{ role: 'user', content: 'Hi' }], 'o1-mini');

      expect(mockCreateChat).toHaveBeenCalledWith(
        expect.not.objectContaining({ temperature: expect.anything() })
      );
    });

    it('should throw error on API failure', async () => {
      mockCreateChat.mockRejectedValue(new Error('API Limit'));
      await expect(llmService.atRiskAssistantChat([])).rejects.toThrow('API Limit');
    });
  });

  describe('chat', () => {
    it('should return chat completion', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: 'Hello user' } }],
        usage: { total_tokens: 20 },
      });

      const result = await llmService.chat([{ role: 'user', content: 'Hi' }]);

      expect(mockCreateChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      );
      expect(result.content).toBe('Hello user');
    });

    it('should remove <think> tags from content', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: '<think>Thoughts</think> Final Answer' } }],
        usage: { total_tokens: 25 },
      });

      const result = await llmService.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('Final Answer');
    });

    it('should handle 401 error (Invalid Key)', async () => {
      const error: any = new Error('Unauthorized');
      error.status = 401;
      mockCreateChat.mockRejectedValue(error);

      await expect(llmService.chat([])).rejects.toThrow('Invalid API Key');
    });

    it('should handle 429 error (Rate Limit)', async () => {
      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return {} as any;
      });

      const error: any = new Error('Rate Limit');
      error.status = 429;
      mockCreateChat.mockRejectedValue(error);

      await expect(llmService.chat([])).rejects.toThrow('System busy');
    });

    it('should retry on 500 errors', async () => {
      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return {} as any;
      });

      const error: any = new Error('Server Error');
      error.status = 502;

      mockCreateChat.mockRejectedValueOnce(error).mockResolvedValue({
        choices: [{ message: { content: 'Success after retry' } }],
      });

      const result = await llmService.chat([]);

      expect(result.content).toBe('Success after retry');
      expect(mockCreateChat).toHaveBeenCalledTimes(2);
    });

    it('should handle 429 quota error explicitly', async () => {
      const error: any = new Error('insufficient_quota');
      error.status = 429;
      error.code = 'insufficient_quota';
      mockCreateChat.mockRejectedValue(error);

      await expect(llmService.chat([])).rejects.toThrow('AI Usage Limit Reached');
    });

    it('should handle 400 Context Length error', async () => {
      const error: any = new Error('maximum context length');
      error.status = 400;
      mockCreateChat.mockRejectedValue(error);

      await expect(llmService.chat([])).rejects.toThrow('too long');
    });

    it('should not retry on missing cause errors', async () => {
      const error: any = new Error('Unknown Error');
      mockCreateChat.mockRejectedValue(error);
      await expect(llmService.chat([])).rejects.toThrow('Unknown Error');
    });

    it('should handle citations parsing', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: 'Citations exist' }, citations: ['cite1'] }],
      });

      const result = await llmService.chat([]);
      expect(result.citations).toEqual(['cite1']);
    });

    it('should drop temperature if model is o1', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: 'Hi' } }],
      });

      await llmService.chat([], 'o1-preview');
      expect(mockCreateChat).toHaveBeenCalledWith(
        expect.not.objectContaining({ temperature: expect.anything() })
      );
    });
  });

  describe('chatStream', () => {
    it('should return a stream object', async () => {
      const mockStream = { iterator: true };
      mockCreateChat.mockResolvedValue(mockStream);

      const result = await llmService.chatStream([{ role: 'user', content: 'Hi' }]);

      expect(mockCreateChat).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
        })
      );
      expect(result).toBe(mockStream);
    });

    it('should handle stream errors', async () => {
      mockCreateChat.mockRejectedValue(new Error('Stream failed'));
      await expect(llmService.chatStream([])).rejects.toThrow('Stream failed');
    });
  });

  describe('chatJson', () => {
    it('should parse JSON response', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: '{"key": "value"}' } }],
      });

      const result = await llmService.chatJson([{ role: 'user', content: 'json' }]);
      expect(result.content).toEqual({ key: 'value' });
    });

    it('should handle malformed JSON', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: 'invalid json' } }],
      });

      await expect(llmService.chatJson([])).rejects.toThrow();
    });
  });

  describe('vision', () => {
    it('should send image correctly', async () => {
      mockCreateChat.mockResolvedValue({
        choices: [{ message: { content: 'An image of a cat' } }],
      });

      const result = await llmService.vision('base64data', 'Describe this');

      expect(mockCreateChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'vision-model',
          messages: [
            expect.objectContaining({
              content: expect.arrayContaining([
                { type: 'text', text: 'Describe this' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,base64data' } },
              ]),
            }),
          ],
        })
      );
      expect(result.content).toBe('An image of a cat');
    });

    it('should handle empty choices', async () => {
      mockCreateChat.mockResolvedValue({ choices: [] }); // Empty choices
      const result = await llmService.vision('data', 'prompt');
      expect(result.content).toBe('');
    });

    it('should throw on vision API error', async () => {
      mockCreateChat.mockRejectedValue(new Error('Vision error'));
      await expect(llmService.vision('data', 'prompt')).rejects.toThrow('Vision error');
    });
  });
});
