/**
 * Suggestion Service Tests
 * Tests for the new Suggestion Policy Engine (Rule + AI)
 */

import {
  suggestionService,
  Suggestion,
} from '../../../../../src/modules/engineering-assistant/services/quality/suggestion.service';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { logger } from '../../../../../src/utils/logger';

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chatJson: jest.fn(),
  },
}));

describe('Suggestion Service (Policy Engine)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFallbackSuggestions', () => {
    it('should return exactly 3 fallback suggestions', () => {
      const suggestions = suggestionService.getFallbackSuggestions();
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBe(3);
      suggestions.forEach((s) => {
        expect(s).toHaveProperty('text');
        expect(s).toHaveProperty('score');
        expect(s).toHaveProperty('type');
        expect(['text', 'chart', 'action']).toContain(s.type);
      });
    });
  });

  describe('generateSuggestions', () => {
    const userQuery = 'How is the well performing?';
    const aiResponse = 'Well 42 is experiencing a 15% pressure drop.';

    it('should return empty suggestions if intent is chat', async () => {
      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'chat'
      );
      expect(suggestions.length).toBe(0);
      expect(llmService.chatJson).not.toHaveBeenCalled();
    });

    it('should return empty suggestions if intent is chat_only', async () => {
      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'chat_only'
      );
      expect(suggestions.length).toBe(0);
      expect(llmService.chatJson).not.toHaveBeenCalled();
    });

    it('should return empty suggestions if response is a refusal', async () => {
      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        "I'm sorry, I can only assist with Oil & Gas topics.",
        [],
        'research'
      );
      expect(suggestions.length).toBe(0);
      expect(llmService.chatJson).not.toHaveBeenCalled();
    });

    it('should query LLM and parse valid JSON array for non-chat intents', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: [
          'Check pressure for Well 42',
          'Compare with historical data',
          'Schedule maintenance',
        ],
      });

      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'research'
      );

      expect(llmService.chatJson).toHaveBeenCalled();
      expect(suggestions.length).toBe(3);
      expect(suggestions[0].text).toBe('Check pressure for Well 42');
      expect(suggestions[1].text).toBe('Compare with historical data');
      expect(suggestions[1].type).toBe('chart'); // Should map 'compare' to chart
      expect(suggestions[2].text).toBe('Schedule maintenance');
    });

    it('should map chart type if hasChartData is true', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: ['Suggestion 1', 'Suggestion 2', 'Suggestion 3'],
      });

      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'research',
        true
      );

      expect(suggestions.length).toBe(3);
      suggestions.forEach((s) => {
        expect(s.type).toBe('chart');
      });
    });

    it('should map action type for specific keywords', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: ['Recommend a fix', 'Next step', 'Take action'],
      });

      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'research',
        false
      );

      expect(suggestions.length).toBe(3);
      expect(suggestions[0].type).toBe('action');
      expect(suggestions[1].type).toBe('action');
      expect(suggestions[2].type).toBe('action');
    });

    it('should unpack nested json array format gracefully', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: { suggestions: ['Fix pressure', 'Compare metrics', 'Recommend parts'] },
      });

      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'research'
      );

      expect(suggestions.length).toBe(3);
      expect(suggestions[0].text).toBe('Fix pressure');
      expect(suggestions[2].text).toBe('Recommend parts');
    });

    it('should return fallback if LLM response is invalid format', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: 'I am sorry, I cannot do that.',
      });

      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'research'
      );

      expect(suggestions.length).toBe(3);
      // Verify first suggestion is one of the valid fallbacks
      const fallbackTexts = suggestionService._getFallbackPool().map((p) => p.text);
      expect(fallbackTexts).toContain(suggestions[0].text);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('LLM returned only'));
    });

    it('should return fallback if llmService throws an error', async () => {
      (llmService.chatJson as jest.Mock).mockRejectedValue(new Error('LLM Error'));

      const suggestions = await suggestionService.generateSuggestions(
        userQuery,
        'mockContext',
        aiResponse,
        [],
        'research'
      );

      expect(suggestions.length).toBe(3);
      const fallbackTexts = suggestionService._getFallbackPool().map((p) => p.text);
      expect(fallbackTexts).toContain(suggestions[0].text);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Suggestion Engine error'));
    });
  });
});
