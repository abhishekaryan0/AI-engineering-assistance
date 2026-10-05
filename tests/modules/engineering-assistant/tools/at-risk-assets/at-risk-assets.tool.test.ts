import { AtRiskAssetsTool } from '../../../../../src/modules/engineering-assistant/tools/at-risk-assets/at-risk-assets.tool';
import { prisma } from '../../../../../src/config/db';
import { logger } from '../../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    anomaly_suggestions: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('AtRiskAssetsTool', () => {
  let tool: AtRiskAssetsTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new AtRiskAssetsTool();
  });

  describe('execute', () => {
    it('should return at-risk assets', async () => {
      const mockDate = new Date('2023-01-01T10:00:00Z');
      (prisma.anomaly_suggestions.findMany as jest.Mock).mockResolvedValue([
        { id: 1, asset_name: 'Well A', confidence: 0.95, timestamp: mockDate },
      ]);

      const result = await tool.execute({ limit: 5, organization_id: 'org-123' });

      expect(result).toContain('Found 1 at-risk assets');
      expect(result).toContain('Well A');
      expect(prisma.anomaly_suggestions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, where: { organization_id: 'org-123' } })
      );
    });

    it('should handle no suggestions', async () => {
      (prisma.anomaly_suggestions.findMany as jest.Mock).mockResolvedValue([]);
      const result = await tool.execute({ organization_id: 'org-123' });
      expect(result).toBe('No at-risk assets found.');
    });

    it('should handle errors', async () => {
      (prisma.anomaly_suggestions.findMany as jest.Mock).mockRejectedValue(
        new Error('Connection failed')
      );
      const result = await tool.execute({});
      expect(result).toContain('Error fetching at-risk assets: Connection failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('should validate valid response', () => {
      const result = tool.validate('Found assets:\n[{"id": 1}]');
      expect(result.isValid).toBe(true);
    });

    it('should invalidate empty result', () => {
      const result = tool.validate('');
      expect(result.isValid).toBe(false);
    });

    it('should invalidate empty JSON', () => {
      const result = tool.validate('Found assets:\n[]');
      expect(result.isValid).toBe(false);
    });
  });

  describe('getFallbackMessage', () => {
    it('should return standard fallback', () => {
      const msg = tool.getFallbackMessage(new Error('error'));
      expect(msg).toContain('Unable to fetch at-risk assets');
    });

    it('should return timeout specifically', () => {
      const msg = tool.getFallbackMessage(new Error('timeout'));
      expect(msg).toContain('took too long');
    });
  });
});
