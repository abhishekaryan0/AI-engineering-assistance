import { OperationalRecommendationsTool } from '../../../../../src/modules/engineering-assistant/tools/operational-recommendations/operational-recommendations.tool';
import { prisma } from '../../../../../src/config/db';
import { logger } from '../../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    operation_suggestion: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('OperationalRecommendationsTool', () => {
  let tool: OperationalRecommendationsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new OperationalRecommendationsTool();
  });

  describe('execute', () => {
    it('should return recommendations', async () => {
      const mockDate = new Date('2023-01-01T10:00:00Z');
      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue([
        { id: 1, suggestion: 'Optimize production', status: 'New', created_at: mockDate },
      ]);

      const result = await tool.execute({ limit: 5, organization_id: 'org-123' });

      expect(result).toContain('Found 1 operational recommendations');
      expect(result).toContain('Optimize production');
      expect(prisma.operation_suggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organization_id: 'org-123' } })
      );
    });

    it('should handle filters', async () => {
      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue([]);
      await tool.execute({ status: 'New', priority: 'HIGH', organization_id: 'org-123' });
      expect(prisma.operation_suggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'New', priority: 'HIGH', organization_id: 'org-123' },
        })
      );
    });

    it('should handle no results', async () => {
      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue([]);
      const result = await tool.execute({ organization_id: 'org-123' });
      expect(result).toContain('No operational recommendations found');
    });

    it('should handle errors', async () => {
      (prisma.operation_suggestion.findMany as jest.Mock).mockRejectedValue(
        new Error('Prisma error')
      );
      const result = await tool.execute({});
      expect(result).toContain('Error fetching recommendations: Prisma error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('should validate valid JSON', () => {
      const result = tool.validate('Reports:\n[{"id": 1}]');
      expect(result.isValid).toBe(true);
    });

    it('should invalidate empty result', () => {
      const result = tool.validate('');
      expect(result.isValid).toBe(false);
    });
  });

  describe('getFallbackMessage', () => {
    it('should return standard fallback', () => {
      const msg = tool.getFallbackMessage(new Error('err'));
      expect(msg).toContain('temporarily unavailable');
    });
  });
});
