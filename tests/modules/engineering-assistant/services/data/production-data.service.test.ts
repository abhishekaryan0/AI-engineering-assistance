import { productionDataService } from '../../../../../src/modules/engineering-assistant/services/data/production-data.service';
import { prisma } from '../../../../../src/config/db';
import { logger } from '../../../../../src/utils/logger';

// Mock prisma
jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    anomaly_review: {
      findUnique: jest.fn(),
    },
    anomaly_suggestions: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ProductionDataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProductionData', () => {
    it('should fetch from anomaly_review if anomalyId provided', async () => {
      (prisma.anomaly_review.findUnique as jest.Mock).mockResolvedValue({
        id: 'A1',
        chart_data: [{ timestamp: '2023-01-01', value: 10, metric: 'PSI' }],
      });

      const result = await productionDataService.getProductionData(
        'W1',
        'org-123',
        undefined,
        undefined,
        'A1'
      );

      expect(result.source).toBe('database');
      expect(result.data.length).toBe(1);
      expect(result.data[0].metric).toBe('PSI');
    });

    it('should fetch from anomaly_suggestions if no anomalyId', async () => {
      (prisma.anomaly_suggestions.findFirst as jest.Mock).mockResolvedValue({
        well_id: 'W1',
        raw_anomaly_data: { PSI: [{ timestamp: '2023-01-01', value: 20 }] },
      });

      const result = await productionDataService.getProductionData('W1', 'org-123');

      expect(result.source).toBe('database');
      expect(result.data[0].value).toBe(20);
      expect(result.data[0].metric).toBe('PSI');
    });

    it('should generate synthetic data as fallback', async () => {
      (prisma.anomaly_suggestions.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await productionDataService.getProductionData('W1', 'org-123');

      expect(result.source).toBe('generated');
      expect(result.data.length).toBeGreaterThan(0);
      expect(logger.info).toHaveBeenCalledWith('Generating synthetic production data for W1');
    });

    it('should handle errors', async () => {
      (prisma.anomaly_suggestions.findFirst as jest.Mock).mockRejectedValue(new Error('DB Fail'));
      await expect(productionDataService.getProductionData('W1', 'org-123')).rejects.toThrow(
        'Failed to retrieve production data'
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Data Generation Logic', () => {
    it('should vary data based on anomaly type', async () => {
      (prisma.anomaly_suggestions.findFirst as jest.Mock).mockResolvedValue({
        category: 'Pump Failure',
      });

      const result = await productionDataService.getProductionData('W1', 'org-123');
      // Pump failure should cause pressure to drop or be low
      // In synthetic generator, it subtracts random values from 1000
      const lastPsi = result.data.filter((d) => d.metric.includes('Pressure')).pop();
      expect(lastPsi!.value).toBeLessThan(1000);
    });
  });
});
