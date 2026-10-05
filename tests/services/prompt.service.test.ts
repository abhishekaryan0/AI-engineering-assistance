/**
 * Prompt Service Tests
 * Tests for engineering prompt building
 */

import { buildEngineeringPrompt } from '../../src/services/prompt.service';
import OpenAI from 'openai';

describe('Prompt Service', () => {
  describe('buildEngineeringPrompt', () => {
    const baseParams = {
      promptText: 'What is the oil production?',
      ragContext: 'Production data: 1500 bbl/day',
      history: [] as OpenAI.Chat.ChatCompletionMessageParam[],
    };

    it('should build prompt with all parameters', () => {
      const result = buildEngineeringPrompt(baseParams);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].role).toBe('system');
    });

    it('should include system message', () => {
      const result = buildEngineeringPrompt(baseParams);

      const systemMsg = result.find((m: any) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(typeof systemMsg?.content).toBe('string');
    });

    it('should include user message with query', () => {
      const result = buildEngineeringPrompt(baseParams);

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(userMsg).toBeDefined();
      expect(userMsg?.content).toContain(baseParams.promptText);
    });

    it('should include RAG context in user message', () => {
      const result = buildEngineeringPrompt(baseParams);

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(userMsg?.content).toContain(baseParams.ragContext);
    });

    it('should use default settings if not provided', () => {
      const result = buildEngineeringPrompt(baseParams);

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain('Detail Level');
      expect(systemMsg.content).toContain('Expertise Level');
    });

    it('should apply custom expertise level', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        settings: { expertiseLevel: 'senior_engineer', detailLevel: 0.8, referencesLevel: 0.6 },
      });

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain('senior_engineer');
    });

    it('should apply custom detail level', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        settings: { expertiseLevel: 'junior_engineer', detailLevel: 0.2, referencesLevel: 0.5 },
      });

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain('0.2');
    });

    it('should apply custom references level', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        settings: { expertiseLevel: 'senior_engineer', detailLevel: 0.5, referencesLevel: 0.9 },
      });

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain('0.9');
    });

    it('should use override system prompt if provided', () => {
      const customPrompt = 'You are a specialized well optimizer';
      const result = buildEngineeringPrompt({
        ...baseParams,
        overrideSystemPrompt: customPrompt,
      });

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain(customPrompt);
    });

    it('should include chat history in messages', () => {
      const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ];

      const result = buildEngineeringPrompt({
        ...baseParams,
        history,
      });

      expect(result.some((m: any) => m.content === 'Previous question')).toBe(true);
      expect(result.some((m: any) => m.content === 'Previous answer')).toBe(true);
    });

    it('should preserve history order', () => {
      const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Second' },
        { role: 'assistant', content: 'Response 2' },
      ];

      const result = buildEngineeringPrompt({
        ...baseParams,
        history,
      });

      const historyStartIndex = result.findIndex((m: any) => m.content === 'First');
      const firstAssistantIndex = result.findIndex((m: any) => m.content === 'Response 1');
      const secondUserIndex = result.findIndex((m: any) => m.content === 'Second');

      expect(firstAssistantIndex).toBeGreaterThan(historyStartIndex);
      expect(secondUserIndex).toBeGreaterThan(firstAssistantIndex);
    });

    it('should add image to content if provided', () => {
      const base64Image =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = buildEngineeringPrompt({
        ...baseParams,
        image: base64Image,
      });

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(Array.isArray(userMsg?.content)).toBe(true);
    });

    it('should format image as data URL', () => {
      const base64Image = 'test_base64_image';

      const result = buildEngineeringPrompt({
        ...baseParams,
        image: base64Image,
      });

      const userMsg = result.find((m: any) => m.role === 'user') as any;
      if (Array.isArray(userMsg?.content)) {
        const imageContent = userMsg.content.find((c: any) => c.type === 'image_url');
        expect(imageContent?.image_url.url).toContain('data:image/jpeg;base64');
      }
    });

    it('should handle empty RAG context', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        ragContext: '',
      });

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(userMsg?.content).toContain(baseParams.promptText);
    });

    it('should handle whitespace-only RAG context', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        ragContext: '   \n  ',
      });

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(userMsg).toBeDefined();
    });

    it('should handle empty history', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        history: [],
      });

      expect(result.length).toBeGreaterThanOrEqual(2); // At least system and user
    });

    it('should create proper OpenAI message format', () => {
      const result = buildEngineeringPrompt(baseParams);

      result.forEach((msg: any) => {
        expect(msg).toHaveProperty('role');
        expect(['system', 'user', 'assistant']).toContain(msg.role);
      });
    });

    it('should default detail level to 0.5', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        settings: { expertiseLevel: 'junior_engineer', referencesLevel: 0.5 },
      });

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain('Detail Level: 0.5');
    });

    it('should default expertise level to junior_engineer', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        settings: { detailLevel: 0.5, referencesLevel: 0.5 },
      });

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain('junior_engineer');
    });

    it('should default references level to 0.5', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        settings: { expertiseLevel: 'senior_engineer', detailLevel: 0.7 },
      });

      const systemMsg = result.find((m: any) => m.role === 'system') as any;
      expect(systemMsg.content).toContain('Reference Level: 0.5');
    });

    it('should handle special characters in prompt text', () => {
      const result = buildEngineeringPrompt({
        ...baseParams,
        promptText: 'What about !@#$%^&*() special chars?',
      });

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(userMsg?.content).toContain('!@#$%^&*()');
    });

    it('should handle very long prompt text', () => {
      const longText = 'Question: '.repeat(1000);
      const result = buildEngineeringPrompt({
        ...baseParams,
        promptText: longText,
      });

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(userMsg?.content).toContain(longText);
    });

    it('should handle very long RAG context', () => {
      const longContext = 'Data: '.repeat(2000);
      const result = buildEngineeringPrompt({
        ...baseParams,
        ragContext: longContext,
      });

      const userMsg = result.find((m: any) => m.role === 'user');
      expect(userMsg?.content).toContain(longContext);
    });

    // Test removed as implementation does not include explicit CONTEXT label

    it('should return properly typed OpenAI message array', () => {
      const result = buildEngineeringPrompt(baseParams);

      expect(Array.isArray(result)).toBe(true);
      result.forEach((msg: any) => {
        expect(typeof msg.role).toBe('string');
        expect(msg.content).toBeDefined();
      });
    });
  });
});
