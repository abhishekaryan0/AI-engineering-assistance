import { ProductionDataTool } from '../../../../../src/modules/engineering-assistant/tools/production-data/production-data.tool';
import { productionDataService } from '../../../../../src/modules/engineering-assistant/services/data/production-data.service';
import { logger } from '../../../../../src/utils/logger';

// Mock productionDataService
jest.mock(
  '../../../../../src/modules/engineering-assistant/services/data/production-data.service',
  () => ({
    productionDataService: {
      getProductionData: jest.fn(),
    },
  })
);

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ProductionDataTool', () => {
  let tool: ProductionDataTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new ProductionDataTool();
  });

  describe('execute', () => {
    it('should return production data', async () => {
      (productionDataService.getProductionData as jest.Mock).mockResolvedValue({
        source: 'Snowflake',
        data: [{ timestamp: '2023-01-01', pressure: 100 }],
      });

      const result = await tool.execute({ well_id: 'Well_001', organization_id: 'org-123' });
      const parsed = JSON.parse(result);

      expect(parsed.well_id).toBeUndefined(); // well_id not in root of result
      expect(parsed.source).toBe('Snowflake');
      expect(parsed.dataCount).toBe(1);
      expect(productionDataService.getProductionData).toHaveBeenCalledWith(
        'Well_001',
        'org-123',
        undefined,
        undefined,
        undefined
      );
    });

    it('should require well_id', async () => {
      const result = await tool.execute({});
      expect(result).toBe('Error: well_id is required.');
    });

    it('should handle service errors', async () => {
      (productionDataService.getProductionData as jest.Mock).mockRejectedValue(
        new Error('Service failure')
      );
      const result = await tool.execute({ well_id: 'Well_002', organization_id: 'org-123' });
      expect(result).toContain('Error fetching production data: Service failure');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should require organization_id', async () => {
      const result = await tool.execute({ well_id: 'Well_001' });
      expect(result).toBe('Error: organization_id is required.');
    });
  });

  describe('validate', () => {
    it('should validate valid JSON', () => {
      const result = tool.validate('{"data": [1, 2]}');
      expect(result.isValid).toBe(true);
    });

    it('should invalidate empty result', () => {
      const result = tool.validate('');
      expect(result.isValid).toBe(false);
    });
  });

  describe('getFallbackMessage', () => {
    it('should return fallback message', () => {
      const msg = tool.getFallbackMessage(new Error('error'));
      expect(msg).toContain('Production data is temporarily unavailable');
    });
  });
});
