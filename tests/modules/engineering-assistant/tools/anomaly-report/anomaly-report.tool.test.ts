import { AnomalyReportTool } from '../../../../../src/modules/engineering-assistant/tools/anomaly-report/anomaly-report.tool';
import { prisma } from '../../../../../src/config/db';
import { logger } from '../../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    anomaly_review: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('AnomalyReportTool', () => {
  let tool: AnomalyReportTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new AnomalyReportTool();
  });

  describe('execute', () => {
    it('should return anomaly reports', async () => {
      const mockDate = new Date('2023-01-01');
      (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([
        { id: 1, name: 'Anomaly 1', detected_at: mockDate, status: 'Open' },
      ]);

      const result = await tool.execute({ organization_id: 'org-123' });
      // The tool returns "Found X anomalies:\n[JSON]"
      const jsonStart = result.indexOf('[');
      const parsed = JSON.parse(result.substring(jsonStart));

      expect(prisma.anomaly_review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organization_id: 'org-123' }),
        })
      );
      expect(parsed[0].name).toBe('Anomaly 1');
      expect(parsed[0].status).toBe('Open');
    });

    it('should handle no anomalies found', async () => {
      (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);

      const result = await tool.execute({ organization_id: 'org-123' });
      expect(result).toBe('No anomalies found for the specified criteria.');
    });

    it('should apply date filters correctly', async () => {
      (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);

      await tool.execute({
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        organization_id: 'org-123',
      });

      expect(prisma.anomaly_review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            detected_at: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('should apply status filter', async () => {
      (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);

      await tool.execute({ status: 'Closed', organization_id: 'org-123' });

      expect(prisma.anomaly_review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'Closed',
          }),
        })
      );
    });

    it('should handle errors', async () => {
      (prisma.anomaly_review.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const result = await tool.execute({});
      expect(result).toContain('Error fetching anomalies: DB Error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('should validate valid JSON response', () => {
      const result = tool.validate('Found anomalies:\n[{"id": 1}]');
      expect(result.isValid).toBe(true);
    });

    it('should invalidate empty result', () => {
      const result = tool.validate('');
      expect(result.isValid).toBe(false);
    });

    it('should invalidate error messages', () => {
      const result = tool.validate('Error fetching data');
      expect(result.isValid).toBe(false);
    });

    it('should invalidate empty JSON array', () => {
      const result = tool.validate('[]');
      expect(result.isValid).toBe(false);
    });
  });

  describe('getFallbackMessage', () => {
    it('should return standard fallback', () => {
      const msg = tool.getFallbackMessage(new Error('Unknown'));
      expect(msg).toContain('Unable to retrieve anomaly reports');
    });

    it('should return timeout fallback', () => {
      const msg = tool.getFallbackMessage(new Error('timeout'));
      expect(msg).toContain('took too long');
    });
  });
});
