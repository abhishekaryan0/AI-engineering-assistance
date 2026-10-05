import { intentClassifierService } from '../../../../../src/modules/engineering-assistant/services/core/intent-classifier.service';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { logger } from '../../../../../src/utils/logger';
import { z } from 'zod';

// Mock the LLM service to avoid real API calls during tests
jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chatJson: jest.fn(),
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('IntentClassifierService', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    // Silence intentional fallback error logs during the test
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger as any);
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rule-Based Classification', () => {
    it('should classify greetings as chat', () => {
      const result = intentClassifierService.classifyByRules('Hello, how are you?');
      expect(result?.intent).toBe('chat');
    });

    it('should classify greeting typos like "hy" as chat', () => {
      const result = intentClassifierService.classifyByRules('hy');
      expect(result?.intent).toBe('chat');
    });

    it('should classify basic research questions', () => {
      const result = intentClassifierService.classifyByRules('What is a pump jack?');
      expect(result?.intent).toBe('research');
    });

    it('should classify action/procedure requests', () => {
      const result = intentClassifierService.classifyByRules('How do I build a workflow?');
      expect(result?.intent).toBe('action');
    });

    it('should classify data analysis questions', () => {
      const result = intentClassifierService.classifyByRules('Analyze this PDF document');
      expect(result?.intent).toBe('analysis');
    });

    it('should classify smart action (anomalies/alerts)', () => {
      const result = intentClassifierService.classifyByRules('Show me the latest anomalies');
      expect(result?.intent).toBe('smart_action');
    });

    it('should return null for unknown or ambiguous patterns', () => {
      const result = intentClassifierService.classifyByRules('The quick brown fox');
      expect(result).toBeNull();
    });
  });

  describe('LLM-Based Classification (Zod Schema Resilience)', () => {
    it('should parse strict string booleans and nullable optional fields from LLM gracefully', async () => {
      // Mock LLM returning strange but acceptable string types and nulls
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          domain_allowed: 'true', // stringified boolean
          intent: 'smart_action',
          researchMode: null, // nullable property
          confidence: '0.98', // stringified number
          reasoning: 'User asked about database metrics.',
        },
      });

      const result = await intentClassifierService.classifyByLLM('give me last 5 sensor readings');
      expect(result.domain_allowed).toBe(true);
      expect(result.intent).toBe('smart_action');
      expect(result.confidence).toBe(0.98);
      expect(result.method).toBe('llm');
    });

    it('should fallback to rule-based classification on complete LLM schema failure', async () => {
      // Mock LLM returning complete garbage that breaks Zod
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          potato: 123,
          random: 'data',
        },
      });

      // The LLM fails zod, so it falls back to rules.
      const result = await intentClassifierService.classifyByLLM('Show me the latest anomalies');
      expect(result.intent).toBe('smart_action');
      expect(result.method).toBe('rules'); // Fell back successfully
    });
  });

  describe('Ensemble Classification', () => {
    it('should rely on rules immediately if confidence is very high', async () => {
      // It won't even call LLM
      const result = await intentClassifierService.classifyWithEnsemble('hi there');
      expect(result.intent).toBe('chat');
      expect(result.method).toBe('rules');
      expect(llmService.chatJson).not.toHaveBeenCalled();
    });

    it('should call LLM if rule intent is ambiguous', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          domain_allowed: true,
          intent: 'research',
          researchMode: 'simple',
          confidence: 0.9,
          reasoning: 'Ambiguous request needing LLM',
        },
      });

      // Provide a vague prompt that doesn't trigger the rule engine strongly
      const result = await intentClassifierService.classifyWithEnsemble(
        'can you provide more context?'
      );
      expect(llmService.chatJson).toHaveBeenCalledTimes(1);
      expect(result.intent).toBe('research');
    });
  });
});
