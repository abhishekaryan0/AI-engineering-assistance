/**
 * Production Forecasting Controller Tests
 * Tests for production forecasting endpoints
 */

import { Request, Response } from 'express';
import { ProductionForecastingController } from '../../../../../src/modules/industrial-data/production-forecasting/controllers/production-forecasting.controller';
import { executeQuery } from '../../../../../src/utils/snowflake';
import { logger } from '../../../../../src/utils/logger';

jest.mock('../../../../../src/utils/snowflake', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Production Forecasting Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('getWellList', () => {
    it('should fetch list of well IDs', async () => {
      const mockWells = [{ WELL_ID: 'WELL_001' }, { WELL_ID: 'WELL_002' }, { WELL_ID: 'WELL_003' }];

      (executeQuery as jest.Mock).mockResolvedValue(mockWells);

      mockRequest = {};

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(executeQuery).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should return array of well ID strings', async () => {
      const mockWells = [{ WELL_ID: 'WELL_001' }, { WELL_ID: 'WELL_002' }];

      (executeQuery as jest.Mock).mockResolvedValue(mockWells);

      mockRequest = {};

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(call)).toBe(true);
      expect(call[0]).toBe('WELL_001');
      expect(call[1]).toBe('WELL_002');
    });

    it('should set status 200 on success', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([{ WELL_ID: 'WELL_001' }]);

      mockRequest = {};

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should handle empty well list', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      mockRequest = {};

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(call.length).toBe(0);
    });

    it('should order results by well ID', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([
        { WELL_ID: 'WELL_001' },
        { WELL_ID: 'WELL_002' },
        { WELL_ID: 'WELL_003' },
      ]);

      mockRequest = {};

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(executeQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY WELL_ID ASC'));
    });

    it('should handle query error', async () => {
      const error = new Error('Snowflake error');
      (executeQuery as jest.Mock).mockRejectedValue(error);

      mockRequest = {};

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal Server Error' })
      );
    });

    it('should log errors', async () => {
      const error = new Error('Test error');
      (executeQuery as jest.Mock).mockRejectedValue(error);

      mockRequest = {};

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getProductionForecasting', () => {
    it('should fetch aggregated production data', async () => {
      const mockData = [
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
        {
          timestamp: '2024-01-02',
          oil: 1550,
          gas: 2.6,
          water: 510,
          boe: 2050,
        },
      ];

      (executeQuery as jest.Mock).mockResolvedValue(mockData);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle well_ids parameter', async () => {
      mockRequest = { query: { well_ids: 'WELL_001,WELL_002' } };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (executeQuery as jest.Mock).mock.calls[0];
      const sql = call[0] as string;
      const binds = call[1] as string[];

      expect(sql).toContain('WHERE WELL_ID IN');
      expect(binds).toContain('WELL_001');
      expect(binds).toContain('WELL_002');
    });

    it('should handle empty well_ids parameter', async () => {
      mockRequest = { query: { well_ids: '' } };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (executeQuery as jest.Mock).mock.calls[0];
      const sql = call[0] as string;

      expect(sql).not.toContain('WHERE WELL_ID IN');
    });

    it('should handle missing well_ids parameter', async () => {
      mockRequest = { query: {} };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (executeQuery as jest.Mock).mock.calls[0];
      const sql = call[0] as string;

      expect(sql).not.toContain('WHERE WELL_ID IN');
    });

    it('should return data with correct fields', async () => {
      const mockData = [
        {
          timestamp: '2024-01-01',
          oil: 1500.5,
          gas: 2.5,
          water: 500.25,
          boe: 2000.75,
        },
      ];

      (executeQuery as jest.Mock).mockResolvedValue(mockData);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(call[0]).toHaveProperty('timestamp');
      expect(call[0]).toHaveProperty('oil');
      expect(call[0]).toHaveProperty('gas');
      expect(call[0]).toHaveProperty('water');
      expect(call[0]).toHaveProperty('boe');
    });

    it('should aggregate data by date', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(executeQuery).toHaveBeenCalledWith(expect.any(String), expect.any(Array));
    });

    it('should order results by date', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const sql = (executeQuery as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY');
      expect(sql.toLowerCase()).toContain('date');
    });

    it('should handle multiple well IDs', async () => {
      mockRequest = {
        query: { well_ids: 'WELL_001,WELL_002,WELL_003,WELL_004,WELL_005' },
      };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 5000,
          gas: 10.0,
          water: 2000,
          boe: 6000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (executeQuery as jest.Mock).mock.calls[0];
      const binds = call[1] as string[];

      expect(binds.length).toBe(5);
      expect(binds[0]).toBe('WELL_001');
      expect(binds[4]).toBe('WELL_005');
    });

    it('should handle query errors', async () => {
      (executeQuery as jest.Mock).mockRejectedValue(new Error('Snowflake error'));

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal Server Error' })
      );
    });

    it('should log errors', async () => {
      const error = new Error('Test error');
      (executeQuery as jest.Mock).mockRejectedValue(error);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle empty result set', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      mockRequest = { query: { well_ids: 'NONEXISTENT' } };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(call)).toBe(true);
      expect(call.length).toBe(0);
    });

    it('should set status 200 on success', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });

  describe('SQL Query Construction', () => {
    it('should use correct table name', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getWellList(
        mockRequest as Request,
        mockResponse as Response
      );

      const sql = (executeQuery as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('WELL_DAILY_PRODUCTION');
    });

    it('should sum production volumes', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const sql = (executeQuery as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('SUM(OIL_VOLUME)');
      expect(sql).toContain('SUM(GAS_VOLUME)');
      expect(sql).toContain('SUM(WATER_VOLUME)');
      expect(sql).toContain('SUM(BOE)');
    });

    it('should group by date', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const sql = (executeQuery as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('GROUP BY');
      expect(sql.toLowerCase()).toContain('date');
    });
  });

  describe('Edge cases', () => {
    it('should handle very large well ID list', async () => {
      const wellIds = Array(100)
        .fill(0)
        .map((_, i) => `WELL_${i.toString().padStart(3, '0')}`)
        .join(',');

      mockRequest = { query: { well_ids: wellIds } };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle well IDs with special characters', async () => {
      mockRequest = {
        query: { well_ids: 'WELL_001-A,WELL_002_B,WELL_003.C' },
      };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (executeQuery as jest.Mock).mock.calls[0];
      const binds = call[1] as string[];

      expect(binds.length).toBe(3);
    });

    it('should handle large production values', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 999999999.99,
          gas: 999999.99,
          water: 999999999.99,
          boe: 1000000000.99,
        },
      ]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(call[0].oil).toBe(999999999.99);
    });

    it('should handle zero production values', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 0,
          gas: 0,
          water: 0,
          boe: 0,
        },
      ]);

      mockRequest = { query: {} };

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(call[0].oil).toBe(0);
    });

    it('should handle null query parameter', async () => {
      mockRequest = { query: { well_ids: undefined } };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle undefined query parameter', async () => {
      mockRequest = { query: { well_ids: undefined } };

      (executeQuery as jest.Mock).mockResolvedValue([
        {
          timestamp: '2024-01-01',
          oil: 1500,
          gas: 2.5,
          water: 500,
          boe: 2000,
        },
      ]);

      await ProductionForecastingController.getProductionForecasting(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalled();
    });
  });
});
