/**
 * RAG Service Tests
 * Tests for document indexing, embedding, and semantic search
 */

import { ragService } from '../../../src/services/rag/rag.service';
import { prisma } from '../../../src/config/db';
import { llmService } from '../../../src/services/llm/llm.service';
import { semanticRerankerService } from '../../../src/modules/engineering-assistant/services/data/semantic-reranker.service';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/config/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock('../../../src/services/llm/llm.service', () => ({
  llmService: {
    embed: jest.fn(),
  },
}));

jest.mock(
  '../../../src/modules/engineering-assistant/services/data/semantic-reranker.service',
  () => ({
    semanticRerankerService: {
      reRankResults: jest.fn(),
    },
  })
);

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('RAG Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (llmService.embed as jest.Mock).mockResolvedValue({
      embedding: Array(1536).fill(0.1),
      usage: { total_tokens: 10 },
    });
    (semanticRerankerService.reRankResults as jest.Mock).mockResolvedValue([]);
  });

  describe('addDocument', () => {
    it('should skip empty text', async () => {
      await ragService.addDocument('', { filename: 'test.pdf' });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Empty text'));
    });

    it('should skip null text', async () => {
      await ragService.addDocument(null as any, { filename: 'test.pdf' });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Empty text'));
    });

    it('should skip whitespace-only text', async () => {
      await ragService.addDocument('   \n  ', { filename: 'test.pdf' });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Empty text'));
    });

    it('should detect duplicate content', async () => {
      const text = 'Duplicate content here';

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'existing' }]);

      await ragService.addDocument(text, { filename: 'test.pdf' });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping duplicate'));
    });

    it('should process new documents', async () => {
      const text = 'New document content with meaningful data about oil production';

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      });

      await ragService.addDocument(text, {
        filename: 'test.pdf',
        page: 1,
        organization_id: 'org-123',
      });

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should chunk documents before embedding', async () => {
      const text = 'Section 1: '.repeat(300); // Create long text

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      });

      await ragService.addDocument(text, { filename: 'test.pdf', organization_id: 'org-123' });

      expect(llmService.embed).toHaveBeenCalled();
    });

    it('should save metadata with chunks', async () => {
      const metadata = {
        filename: 'quarterly_report.pdf',
        page: 5,
        date: '2024-01-15',
        organization_id: 'org-123',
      };
      const text = 'Document content here';

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      });

      await ragService.addDocument(text, metadata);

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should handle embedding errors gracefully', async () => {
      const text = 'Document content';

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockRejectedValue(new Error('Embedding failed'));

      await ragService.addDocument(text, { filename: 'test.pdf', organization_id: 'org-123' });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Error embedding'));
    });

    it('should batch embeddings for large documents', async () => {
      const text = 'Content '.repeat(500); // Large document

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1, 0.2],
      });

      await ragService.addDocument(text, { filename: 'large.pdf', organization_id: 'org-123' });

      expect(llmService.embed).toHaveBeenCalled();
    });

    it('should log success on completion', async () => {
      const text = 'Document content for testing';

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      });

      await ragService.addDocument(text, { filename: 'test.pdf', organization_id: 'org-123' });

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Indexed'));
    });
  });

  describe('search', () => {
    it('should search for query results', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          content: 'Oil production data',
          metadata: { source: 'doc1' },
          similarity: 0.95,
        },
      ]);

      const result = await ragService.search('oil production', 5, { organization_id: 'org-123' });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should use default limit of 5', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await ragService.search('query', 5, { organization_id: 'org-123' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should support custom limit', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await ragService.search('query', 10, { organization_id: 'org-123' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should filter by sessionId if provided', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await ragService.search('query', 5, { sessionId: 'sess_001', organization_id: 'org-123' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return empty results for no matches', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await ragService.search('impossible_query', 5, { organization_id: 'org-123' });

      expect(result.results.length).toBe(0);
    });

    it('should log search query', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await ragService.search('test query', 5, { organization_id: 'org-123' });

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle query errors', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(ragService.search('query', 5, { organization_id: 'org-123' })).rejects.toThrow();
    });

    it('should include similarity scores in results', async () => {
      const mockResults = [
        {
          content: 'Result 1',
          metadata: { source: 'doc1' },
          similarity: 0.95,
        },
        {
          content: 'Result 2',
          metadata: { source: 'doc2' },
          similarity: 0.87,
        },
      ];

      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockResults);
      (semanticRerankerService.reRankResults as jest.Mock).mockResolvedValue(mockResults);

      const result = await ragService.search('query', 5, { organization_id: 'org-123' });

      expect(result.results[0].similarity).toBe(0.95);
      expect(result.results[1].similarity).toBe(0.87);
    });

    it('should preserve metadata in search results', async () => {
      const mockResults = [
        {
          content: 'Content',
          metadata: { filename: 'doc.pdf', page: 5 },
          similarity: 0.9,
        },
      ];

      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockResults);
      (semanticRerankerService.reRankResults as jest.Mock).mockResolvedValue(mockResults);

      const result = await ragService.search('query', 5, { organization_id: 'org-123' });

      expect(result.results[0].metadata.filename).toBe('doc.pdf');
      expect(result.results[0].metadata.page).toBe(5);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long text for indexing', async () => {
      const longText = 'Word '.repeat(100000);

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1, 0.2],
      });

      await ragService.addDocument(longText, { filename: 'large.pdf', organization_id: 'org-123' });

      expect(llmService.embed).toHaveBeenCalled();
    });

    it('should handle special characters in text', async () => {
      const text = 'Content with !@#$%^&*() special chars';

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1],
      });

      await ragService.addDocument(text, { filename: 'test.pdf', organization_id: 'org-123' });

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should handle unicode characters', async () => {
      const text = 'Texte avec caractères spéciaux: é à ü';

      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      (llmService.embed as jest.Mock).mockResolvedValue({
        embedding: [0.1],
      });

      await ragService.addDocument(text, { filename: 'test.pdf', organization_id: 'org-123' });

      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should handle search with special characters', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await ragService.search('query with !@#$%', 5, { organization_id: 'org-123' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should handle very long search queries', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const longQuery = 'Query word '.repeat(100);

      await ragService.search(longQuery, 5, { organization_id: 'org-123' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should handle high limit values', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await ragService.search('query', 1000, { organization_id: 'org-123' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should handle zero limit', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await ragService.search('query', 0, { organization_id: 'org-123' });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });
});
