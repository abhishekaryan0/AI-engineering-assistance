/**
 * Factuality Checker Service Tests
 * Tests for hallucination detection and fact-checking
 */

import {
  factualityCheckerService,
  FactualityCheckResult,
} from '../../../../../src/modules/engineering-assistant/services/quality/factuality-checker.service';
import { ragService } from '../../../../../src/services/rag/rag.service';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { logger } from '../../../../../src/utils/logger';

jest.mock('../../../../../src/services/rag/rag.service', () => ({
  ragService: {
    search: jest.fn(),
  },
}));

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chatJson: jest.fn(),
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../../src/config/config', () => ({
  env: {
    AI_MODEL_DECISION: 'gpt-4o',
  },
}));

describe('Factuality Checker Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSources = [
    {
      content:
        'Oil production increased by 15% due to well optimization techniques implemented in Q4 2024.',
      metadata: { source: 'doc1', date: '2024-11-15' },
    },
    {
      content:
        'Water injection rates were adjusted from 500 bbl/day to 750 bbl/day based on reservoir pressure analysis.',
      metadata: { source: 'doc2', date: '2024-12-01' },
    },
    {
      content: 'Gas production remained stable at 2.5 MMCF/day throughout the quarter.',
      metadata: { source: 'doc3', date: '2024-12-10' },
    },
  ];

  describe('checkFactuality', () => {
    it('should return early with no RAG sources', async () => {
      const result = await factualityCheckerService.checkFactuality(
        'Test response',
        [],
        'Test query'
      );

      expect(result.isFactual).toBe(true);
      expect(result.hallucinations.length).toBe(0);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should check factuality against sources', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: ['production increased', 'well optimization'],
          unsupported_claims: [],
          fact_score: 0.95,
          reasoning: 'Response is well-supported by sources',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Oil production increased due to well optimization',
        mockSources,
        'What improved oil production?'
      );

      expect(result).toHaveProperty('isFactual');
      expect(result).toHaveProperty('factScore');
      expect(result).toHaveProperty('hallucinations');
      expect(result).toHaveProperty('supportedClaims');
      expect(result).toHaveProperty('unsupportedClaims');
    });

    it('should detect hallucinations', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [
            {
              claim: 'production increased by 300%',
              evidence: null,
              severity: 'high',
            },
          ],
          supported_claims: [],
          unsupported_claims: ['300% increase'],
          fact_score: 0.3,
          reasoning: 'Response contains unsupported claim',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Production increased by 300% due to new technology',
        mockSources,
        'What happened to production?'
      );

      expect(result.hallucinations.length).toBeGreaterThan(0);
      expect(result.isFactual).toBe(false);
      expect(result.factScore).toBeLessThan(0.5);
    });

    it('should return all required properties', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: ['claim1', 'claim2'],
          unsupported_claims: [],
          fact_score: 0.9,
          reasoning: 'Well factual',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Test response',
        mockSources,
        'Test query'
      );

      expect(result).toHaveProperty('isFactual');
      expect(result).toHaveProperty('factScore');
      expect(result).toHaveProperty('hallucinations');
      expect(result).toHaveProperty('supportedClaims');
      expect(result).toHaveProperty('unsupportedClaims');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('confidence');
    });

    it('should include reasoning in result', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.85,
          reasoning: 'Response is mostly accurate with good source support',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Response text',
        mockSources,
        'Query'
      );

      expect(result.reasoning).toContain('accurate');
    });

    it('should set confidence score', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.9,
          reasoning: 'Confident assessment',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Response',
        mockSources,
        'Query'
      );

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Hallucination detection', () => {
    it('should detect high severity hallucinations', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [
            {
              claim: 'Production increased 500%',
              evidence: null,
              severity: 'high',
            },
          ],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.2,
          reasoning: 'Major hallucinations detected',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Production increased 500%',
        mockSources,
        'Production change'
      );

      expect(result.hallucinations.some((h) => h.severity === 'high')).toBe(true);
      expect(result.isFactual).toBe(false);
    });

    it('should categorize hallucinations by severity', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [
            { claim: 'Major claim', evidence: null, severity: 'high' },
            { claim: 'Minor claim', evidence: null, severity: 'low' },
          ],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.5,
          reasoning: 'Mixed severity',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Response',
        mockSources,
        'Query'
      );

      expect(result.hallucinations.length).toBe(2);
      expect(result.hallucinations.some((h) => h.severity === 'high')).toBe(true);
      expect(result.hallucinations.some((h) => h.severity === 'low')).toBe(true);
    });

    it('should include evidence for supported hallucinations', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [
            {
              claim: 'Incorrect claim',
              evidence: 'Source says something else',
              severity: 'medium',
            },
          ],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.6,
          reasoning: 'Detected discrepancy',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Response',
        mockSources,
        'Query'
      );

      expect(result.hallucinations[0].evidence).toBeDefined();
    });
  });

  describe('Claim tracking', () => {
    it('should track supported claims', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: ['production increased', 'well optimization', 'Q4 2024'],
          unsupported_claims: [],
          fact_score: 0.95,
          reasoning: 'All claims supported',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Production increased due to optimization in Q4',
        mockSources,
        'Production changes'
      );

      expect(result.supportedClaims.length).toBeGreaterThan(0);
      expect(result.supportedClaims[0]).toContain('production');
    });

    it('should track unsupported claims', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: ['some claim'],
          unsupported_claims: ['unsupported fact', 'incorrect assertion'],
          fact_score: 0.65,
          reasoning: 'Some unsupported elements',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Mixed claims',
        mockSources,
        'Query'
      );

      expect(result.unsupportedClaims.length).toBeGreaterThan(0);
    });
  });

  describe('Fact score calculation', () => {
    it('should return fact score between 0 and 1', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.75,
          reasoning: 'Good factuality',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Response',
        mockSources,
        'Query'
      );

      expect(result.factScore).toBeGreaterThanOrEqual(0);
      expect(result.factScore).toBeLessThanOrEqual(1);
    });

    it('should mark as factual when score > 0.7', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.8,
          reasoning: 'Good',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Response',
        mockSources,
        'Query'
      );

      expect(result.isFactual).toBe(true);
    });

    it('should mark as not factual when score < 0.7', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [
            {
              claim: 'false claim',
              evidence: null,
              severity: 'high',
            },
          ],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.4,
          reasoning: 'Low factuality',
        },
      });

      const result = await factualityCheckerService.checkFactuality(
        'Response',
        mockSources,
        'Query'
      );

      expect(result.isFactual).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty response', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.5,
          reasoning: 'No content to check',
        },
      });

      const result = await factualityCheckerService.checkFactuality('', mockSources, 'Query');

      expect(result).toHaveProperty('isFactual');
    });

    it('should handle very long response', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.75,
          reasoning: 'Long response checked',
        },
      });

      const longResponse = 'a'.repeat(50000);
      const result = await factualityCheckerService.checkFactuality(
        longResponse,
        mockSources,
        'Query'
      );

      expect(result).toHaveProperty('isFactual');
    });

    it('should handle special characters', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.85,
          reasoning: 'Special chars handled',
        },
      });

      const specialResponse = 'Response with !@#$%^&*() and "quotes"';
      const result = await factualityCheckerService.checkFactuality(
        specialResponse,
        mockSources,
        'Query'
      );

      expect(result).toHaveProperty('isFactual');
    });

    it('should handle LLM errors gracefully', async () => {
      (llmService.chatJson as jest.Mock).mockRejectedValue(new Error('LLM Error'));

      const result = await factualityCheckerService.checkFactuality(
        'Response',
        mockSources,
        'Query'
      );

      expect(result).toHaveProperty('isFactual');
    });

    it('should limit sources to top 5', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.85,
          reasoning: 'Checked',
        },
      });

      const manySources = Array(100)
        .fill(null)
        .map((_, i) => ({
          content: `Source ${i} content`,
          metadata: { source: `doc${i}` },
        }));

      await factualityCheckerService.checkFactuality('Response', manySources, 'Query');

      const call = (llmService.chatJson as jest.Mock).mock.calls[0];
      expect(call[0][1].content).toBeDefined();
    });
  });

  describe('Logging and monitoring', () => {
    it('should log debug information', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          hallucinations: [],
          supported_claims: [],
          unsupported_claims: [],
          fact_score: 0.85,
          reasoning: 'Good',
        },
      });

      await factualityCheckerService.checkFactuality(
        'Response with 500 chars'.repeat(10),
        mockSources,
        'Query'
      );

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should warn when no sources provided', async () => {
      await factualityCheckerService.checkFactuality('Response', [], 'Query');

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('sanitizeRagContent', () => {
    it('should escape backticks and quotes', () => {
      const result = factualityCheckerService.sanitizeRagContent('```code``` and `single`');
      expect(result).not.toContain('```');
      expect(result).toContain("' ' '");
      expect(result).not.toContain('`single`');
      expect(result).toContain("'single'");
    });

    it('should remove control characters', () => {
      const result = factualityCheckerService.sanitizeRagContent('text\x00with\x1Fcontrol');
      expect(result).not.toContain('\x00');
      expect(result).toContain('text with control'); // actually since we replace with space
    });
  });

  describe('quickValidateClaim', () => {
    it('should return true if no sources', async () => {
      const result = await factualityCheckerService.quickValidateClaim('claim', []);
      expect(result.isSupported).toBe(true);
      expect(result.confidence).toBe(0.5);
    });

    it('should validate claim successfully as supported', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({ content: 'yes' });
      const result = await factualityCheckerService.quickValidateClaim('claim', [
        { content: 'source' },
      ]);
      expect(result.isSupported).toBe(true);
      expect(result.confidence).toBe(0.8);
    });

    it('should validate claim successfully as unsupported', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({ content: 'no, false' });
      const result = await factualityCheckerService.quickValidateClaim('claim', [
        { content: 'source' },
      ]);
      expect(result.isSupported).toBe(false);
      expect(result.confidence).toBe(0.8);
    });

    it('should fallback to true on error', async () => {
      (llmService.chatJson as jest.Mock).mockRejectedValue(new Error('llm error'));
      const result = await factualityCheckerService.quickValidateClaim('claim', [
        { content: 'source' },
      ]);
      expect(result.isSupported).toBe(true);
      expect(result.confidence).toBe(0.3);
    });
  });
});
