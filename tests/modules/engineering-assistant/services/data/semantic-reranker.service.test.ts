/**
 * Semantic Re-Ranker Service Tests
 * Tests for LLM-based relevance validation of RAG results
 */

import { semanticRerankerService, ReRankedResult } from '../../../../../src/modules/engineering-assistant/services/data/semantic-reranker.service';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { logger } from '../../../../../src/utils/logger';

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

describe('Semantic Re-Ranker Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockResults = [
        {
            content: 'Oil production increased due to well optimization',
            metadata: { source: 'doc1' },
            similarity: 0.92,
        },
        {
            content: 'Water injection rates and pressure management strategies',
            metadata: { source: 'doc2' },
            similarity: 0.88,
        },
        {
            content: 'General information about cooking oils',
            metadata: { source: 'doc3' },
            similarity: 0.75,
        },
    ];

    describe('reRankResults', () => {
        it('should return empty array for empty results', async () => {
            const result = await semanticRerankerService.reRankResults('query', []);
            expect(result).toEqual([]);
        });

        it('should call LLM service for re-ranking', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.95, reasoning: 'Highly relevant' },
                    { index: 1, relevance_score: 0.80, reasoning: 'Somewhat relevant' },
                    { index: 2, relevance_score: 0.40, reasoning: 'Not relevant' },
                ],
            });

            await semanticRerankerService.reRankResults('oil production optimization', mockResults);

            expect(llmService.chatJson).toHaveBeenCalled();
        });

        it('should filter results by threshold', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.92, reasoning: 'Highly relevant' },
                    { index: 1, relevance_score: 0.88, reasoning: 'Relevant' },
                    { index: 2, relevance_score: 0.45, reasoning: 'Not relevant' },
                ],
            });

            const result = await semanticRerankerService.reRankResults(
                'oil production',
                mockResults,
                0.65
            );

            expect(result.length).toBeLessThanOrEqual(mockResults.length);
            expect(result.every((r) => r.relevanceScore > 0.65)).toBe(true);
        });

        it('should include re-ranked scores in results', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.95, reasoning: 'Highly relevant' },
                    { index: 1, relevance_score: 0.80, reasoning: 'Somewhat relevant' },
                    { index: 2, relevance_score: 0.40, reasoning: 'Not relevant' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults);

            result.forEach((r) => {
                expect(r).toHaveProperty('relevanceScore');
                expect(r).toHaveProperty('reasoning');
                expect(typeof r.relevanceScore).toBe('number');
                expect(typeof r.reasoning).toBe('string');
            });
        });

        it('should preserve original content and metadata', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.95, reasoning: 'Relevant' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults);

            result.forEach((r) => {
                const original = mockResults.find((m) => m.content === r.content);
                if (original) {
                    expect(r.metadata).toEqual(original.metadata);
                    expect(r.similarity).toBe(original.similarity);
                }
            });
        });

        it('should assign rank numbers', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.95, reasoning: 'Most relevant' },
                    { index: 1, relevance_score: 0.80, reasoning: 'Second' },
                    { index: 2, relevance_score: 0.40, reasoning: 'Not relevant' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults);

            result.forEach((r, idx) => {
                expect(r.rank).toBe(idx + 1);
            });
        });

        it('should handle LLM errors gracefully', async () => {
            (llmService.chatJson as jest.Mock).mockRejectedValue(new Error('LLM Error'));

            const result = await semanticRerankerService.reRankResults('query', mockResults);

            expect(result).toBeDefined();
        });

        it('should return ReRankedResult with all required properties', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.95, reasoning: 'Relevant' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', [mockResults[0]]);

            expect(result[0]).toHaveProperty('content');
            expect(result[0]).toHaveProperty('metadata');
            expect(result[0]).toHaveProperty('similarity');
            expect(result[0]).toHaveProperty('relevanceScore');
            expect(result[0]).toHaveProperty('rank');
            expect(result[0]).toHaveProperty('reasoning');
        });
    });

    describe('Threshold handling', () => {
        it('should use default threshold of 0.65', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.70, reasoning: 'Above threshold' },
                    { index: 1, relevance_score: 0.60, reasoning: 'Below threshold' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults);

            expect(result.every((r) => r.relevanceScore >= 0.65)).toBe(true);
        });

        it('should support custom thresholds', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.95, reasoning: 'High' },
                    { index: 1, relevance_score: 0.80, reasoning: 'Medium' },
                    { index: 2, relevance_score: 0.40, reasoning: 'Low' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults, 0.85);

            expect(result.every((r) => r.relevanceScore >= 0.85)).toBe(true);
        });

        it('should handle threshold of 0', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.95, reasoning: 'High' },
                    { index: 1, relevance_score: 0.80, reasoning: 'Medium' },
                    { index: 2, relevance_score: 0.10, reasoning: 'Low' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults, 0);

            expect(result.length).toBeGreaterThan(0);
        });

        it('should handle threshold of 1', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 1.0, reasoning: 'Perfect' },
                    { index: 1, relevance_score: 0.99, reasoning: 'Almost perfect' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults, 1.0);

            expect(result.every((r) => r.relevanceScore >= 1.0)).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('should handle results with empty content', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [{ index: 0, relevance_score: 0.50, reasoning: 'Low' }],
            });

            const emptyResult = {
                content: '',
                metadata: {},
                similarity: 0.5,
            };

            const result = await semanticRerankerService.reRankResults('query', [emptyResult]);

            expect(result).toBeDefined();
        });

        it('should handle very long query strings', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.85, reasoning: 'Relevant' },
                ],
            });

            const longQuery = 'a'.repeat(10000);
            const result = await semanticRerankerService.reRankResults(longQuery, mockResults);

            expect(result).toBeDefined();
        });

        it('should handle very long content snippets', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.85, reasoning: 'Relevant' },
                ],
            });

            const longContent = {
                content: 'a'.repeat(50000),
                metadata: {},
                similarity: 0.9,
            };

            const result = await semanticRerankerService.reRankResults('query', [longContent]);

            expect(result).toBeDefined();
        });

        it('should handle large number of results', async () => {
            const manyResults = Array(100).fill(null).map((_, i) => ({
                content: `Result ${i} about topic`,
                metadata: { index: i },
                similarity: 0.9 - i * 0.005,
            }));

            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: manyResults.map((_, i) => ({
                    index: i,
                    relevance_score: 0.9 - i * 0.01,
                    reasoning: `Result ${i}`,
                })),
            });

            const result = await semanticRerankerService.reRankResults('query', manyResults);

            expect(result).toBeDefined();
        });

        it('should handle special characters in content', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.85, reasoning: 'Relevant' },
                ],
            });

            const specialContent = {
                content: 'Content with !@#$%^&*() and "quotes" and \\backslashes',
                metadata: {},
                similarity: 0.9,
            };

            const result = await semanticRerankerService.reRankResults('query', [specialContent]);

            expect(result).toBeDefined();
        });
    });

    describe('Logging and monitoring', () => {
        it('should log debug information when re-ranking', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.85, reasoning: 'Relevant' },
                ],
            });

            await semanticRerankerService.reRankResults('test oil production', mockResults);

            expect(logger.debug).toHaveBeenCalled();
        });

        it('should handle logging errors gracefully', async () => {
            (llmService.chatJson as jest.Mock).mockResolvedValue({
                content: [
                    { index: 0, relevance_score: 0.85, reasoning: 'Relevant' },
                ],
            });

            const result = await semanticRerankerService.reRankResults('query', mockResults);

            expect(result).toBeDefined();
        });
    });
});
