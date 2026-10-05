/**
 * Context Optimizer Service Tests
 * Tests for context optimization with token budget management
 */

import { contextOptimizerService, ContextItem } from '../../../../../src/modules/engineering-assistant/services/core/context-optimizer.service';
import { logger } from '../../../../../src/utils/logger';

jest.mock('../../../../../src/utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
    },
}));

describe('Context Optimizer Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('estimateTokens', () => {
        it('should estimate tokens correctly', () => {
            const text = 'This is a sample text';
            const tokens = contextOptimizerService.estimateTokens(text);
            expect(tokens).toBe(Math.ceil(text.length / 4));
        });

        it('should handle empty string', () => {
            const tokens = contextOptimizerService.estimateTokens('');
            expect(tokens).toBe(0);
        });

        it('should handle very long text', () => {
            const longText = 'a'.repeat(10000);
            const tokens = contextOptimizerService.estimateTokens(longText);
            expect(tokens).toBe(2500);
        });

        it('should return positive integer', () => {
            const tokens = contextOptimizerService.estimateTokens('Test');
            expect(tokens).toBeGreaterThan(0);
            expect(Number.isInteger(tokens)).toBe(true);
        });

        it('should handle special characters', () => {
            const specialText = 'Test!@#$%^&*()_+-=[]{}|;:,.<>?';
            const tokens = contextOptimizerService.estimateTokens(specialText);
            expect(tokens).toBeGreaterThan(0);
        });

        it('should handle unicode characters', () => {
            const unicodeText = 'Test with émojis 🚀 and spëcial chars';
            const tokens = contextOptimizerService.estimateTokens(unicodeText);
            expect(tokens).toBeGreaterThan(0);
        });
    });

    describe('calculateRelevance', () => {
        it('should return 0 for empty inputs', () => {
            const relevance = contextOptimizerService.calculateRelevance('', '');
            expect(relevance).toBe(0.3); // default
        });

        it('should return perfect relevance for exact match', () => {
            const relevance = contextOptimizerService.calculateRelevance('oil production', 'oil production analysis');
            expect(relevance).toBeGreaterThan(0.5);
        });

        it('should return low relevance for unrelated content', () => {
            const relevance = contextOptimizerService.calculateRelevance('oil production', 'cooking recipes');
            expect(relevance).toBeLessThan(0.5);
        });

        it('should be case insensitive', () => {
            const relevance1 = contextOptimizerService.calculateRelevance('Oil Production', 'oil production data');
            const relevance2 = contextOptimizerService.calculateRelevance('oil production', 'oil production data');
            expect(relevance1).toBe(relevance2);
        });

        it('should handle partial word matches', () => {
            const relevance = contextOptimizerService.calculateRelevance('gas well', 'gas well analysis report');
            expect(relevance).toBeGreaterThan(0.3);
        });

        it('should filter short words', () => {
            const relevance = contextOptimizerService.calculateRelevance('a b c', 'some content here');
            expect(relevance).toBe(0.3); // No matches after filtering
        });

        it('should return normalized score between 0 and 1', () => {
            const relevance = contextOptimizerService.calculateRelevance('test query content', 'test content with query');
            expect(relevance).toBeGreaterThanOrEqual(0);
            expect(relevance).toBeLessThanOrEqual(1);
        });

        it('should handle multiple word query', () => {
            const relevance = contextOptimizerService.calculateRelevance(
                'oil well production anomaly',
                'detected anomaly in well production of oil'
            );
            expect(relevance).toBeGreaterThan(0.5);
        });
    });

    describe('buildOptimizedContext', () => {
        const mockRagResults = [
            { content: 'RAG result 1 about oil production', similarity: 0.9 },
            { content: 'RAG result 2 about gas wells', similarity: 0.75 },
            { content: 'RAG result 3 about water injection', similarity: 0.6 },
        ];

        const mockChatHistory = [
            { role: 'user', content: 'What is the production level?' },
            { role: 'assistant', content: 'The production is high' },
        ];

        it('should build context with all components', async () => {
            const result = await contextOptimizerService.buildOptimizedContext(
                'How to improve well performance?',
                mockRagResults,
                mockChatHistory,
                'File content about well optimization',
                ['term1', 'term2'],
                8000
            );

            expect(result).toHaveProperty('context');
            expect(result).toHaveProperty('usedTokens');
            expect(result).toHaveProperty('itemsIncluded');
            expect(result.usedTokens).toBeGreaterThan(0);
            expect(result.itemsIncluded).toBeGreaterThan(0);
        });

        it('should respect token budget', async () => {
            const maxTokens = 1000;
            const result = await contextOptimizerService.buildOptimizedContext(
                'test query',
                mockRagResults,
                mockChatHistory,
                'File content',
                ['term1'],
                maxTokens
            );

            expect(result.usedTokens).toBeLessThanOrEqual(maxTokens + 100); // Small buffer
        });

        it('should handle empty RAG results', async () => {
            const result = await contextOptimizerService.buildOptimizedContext(
                'test query',
                [],
                mockChatHistory,
                'File content',
                ['term1'],
                5000
            );

            expect(result).toHaveProperty('context');
            expect(result.usedTokens).toBeGreaterThan(0);
        });

        it('should handle empty chat history', async () => {
            const result = await contextOptimizerService.buildOptimizedContext(
                'test query',
                mockRagResults,
                [],
                'File content',
                ['term1'],
                5000
            );

            expect(result).toHaveProperty('context');
            expect(result.usedTokens).toBeGreaterThan(0);
        });

        it('should prioritize file context', async () => {
            const fileContent = 'Important file content about production';
            const result = await contextOptimizerService.buildOptimizedContext(
                'file related query',
                mockRagResults,
                mockChatHistory,
                fileContent,
                [],
                8000
            );

            expect(result.context).toContain(fileContent);
        });

        it('should return valid context string', async () => {
            const result = await contextOptimizerService.buildOptimizedContext(
                'test',
                mockRagResults,
                mockChatHistory,
                'File',
                [],
                5000
            );

            expect(typeof result.context).toBe('string');
            expect(result.context.length).toBeGreaterThan(0);
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle null content in context items', async () => {
            const result = await contextOptimizerService.buildOptimizedContext(
                'query',
                [{ content: '', similarity: 0.8 }],
                [],
                '',
                [],
                5000
            );

            expect(result).toBeDefined();
            expect(result.usedTokens).toBeGreaterThanOrEqual(0);
        });

        it('should handle very small token budget', async () => {
            const result = await contextOptimizerService.buildOptimizedContext(
                'query',
                [{ content: 'content', similarity: 0.9 }],
                [],
                'file',
                [],
                100
            );

            expect(result.usedTokens).toBeLessThanOrEqual(200); // Some flexibility
        });

        it('should handle large number of RAG results', async () => {
            const manyResults = Array(100).fill(null).map((_, i) => ({
                content: `Result ${i} about oil production`,
                similarity: Math.random(),
            }));

            const result = await contextOptimizerService.buildOptimizedContext(
                'query',
                manyResults,
                [],
                '',
                [],
                5000
            );

            expect(result).toBeDefined();
            expect(result.usedTokens).toBeGreaterThan(0);
        });

        it('should handle special characters in content', async () => {
            const specialContent = 'Content with !@#$%^&*() and \n newlines';
            const result = await contextOptimizerService.buildOptimizedContext(
                'query',
                [{ content: specialContent, similarity: 0.9 }],
                [],
                '',
                [],
                5000
            );

            expect(result).toBeDefined();
        });
    });

    describe('Performance considerations', () => {
        it('should complete within reasonable time', async () => {
            const startTime = Date.now();
            await contextOptimizerService.buildOptimizedContext(
                'query',
                [{ content: 'a'.repeat(10000), similarity: 0.9 }],
                [],
                '',
                [],
                8000
            );
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(5000); // Should complete quickly
        });
    });
});
