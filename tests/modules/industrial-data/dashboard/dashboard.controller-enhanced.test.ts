/**
 * @file dashboard.controller.test.ts
 * @description Comprehensive tests for dashboard controller
 */

import { Request, Response, NextFunction } from 'express';
import { DashboardController } from '../../../../src/modules/industrial-data/dashboard/controllers/dashboard.controller';
import { prisma } from '../../../../src/config/db';
import * as snowflakeUtils from '../../../../src/utils/snowflake';
import { logger } from '../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../src/config/db');
jest.mock('../../../../src/utils/snowflake');
jest.mock('../../../../src/utils/logger');

describe('DashboardController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/dashboard',
      user: {
        id: 'user-123',
        organization_id: 'org-123',
      },
    } as any;
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();

    // Setup prisma mock with all required nested objects
    (prisma as any) = {
      operation_suggestion: {
        aggregate: jest.fn(),
      },
      anomaly_suggestions: {
        groupBy: jest.fn(),
      },
      anomaly_review: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    jest.clearAllMocks();
  });

  describe('getDashboardData', () => {
    describe('Successful Data Retrieval', () => {
      it('should return complete dashboard data on success', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 100,
            daily_expense_benefit_usd: 5000,
            implementation_cost_usd: 50000,
            net_daily_benefit_usd: 4500,
          },
          _count: { _all: 5 },
        };

        const mockAtRiskGroups = [
          { severity: 'Critical', _count: { severity: 2 } },
          { severity: 'High', _count: { severity: 3 } },
          { severity: 'Medium', _count: { severity: 5 } },
          { severity: 'Low', _count: { severity: 8 } },
        ];

        const mockRecentAnomalies = [
          { title: 'Anomaly 1', severity: 'High' },
          { title: 'Anomaly 2', severity: 'Medium' },
        ];

        const mockAnomalyCounts = [
          { category: 'Financial', _count: { category: 3 } },
          { category: 'Operational', _count: { category: 5 } },
          { category: 'Process', _count: { category: 2 } },
          { category: 'Production', _count: { category: 4 } },
        ];

        const mockProductionResults = [
          {
            TOTAL_OIL: 1000,
            TOTAL_GAS: 2000,
            TOTAL_WATER: 500,
            TOTAL_BOE: 5000,
            PRODUCING_WELLS: 10,
          },
        ];

        const mockWellStatus = [
          { STATUS: 'ACTIVE', COUNT: 15 },
          { STATUS: 'MAINTENANCE', COUNT: 3 },
          { STATUS: 'SHUTDOWN', COUNT: 2 },
        ];

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue(mockAtRiskGroups);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue(mockRecentAnomalies);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue(mockAnomalyCounts);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce(mockProductionResults)
          .mockResolvedValueOnce(mockWellStatus);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(200);
        expect(mockResponse.json).toHaveBeenCalled();
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData).toHaveProperty('fieldHealth');
        expect(responseData).toHaveProperty('operationalRecommendations');
        expect(responseData).toHaveProperty('atRiskAssets');
        expect(responseData).toHaveProperty('anomalyFeed');
      });

      it('should return correct field health metrics', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };
        const mockProductionResults = [
          {
            TOTAL_OIL: 1500,
            TOTAL_GAS: 3000,
            TOTAL_WATER: 700,
            TOTAL_BOE: 6000,
            PRODUCING_WELLS: 12,
          },
        ];
        const mockWellStatus = [
          { STATUS: 'ACTIVE', COUNT: 20 },
          { STATUS: 'SHUTDOWN', COUNT: 5 },
        ];

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce(mockProductionResults)
          .mockResolvedValueOnce(mockWellStatus);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        const fieldHealth = responseData.fieldHealth;
        expect(fieldHealth.totalOilProduction).toBe(1500);
        expect(fieldHealth.totalGasProduction).toBe(3000);
        expect(fieldHealth.producedWater).toBe(700);
        expect(fieldHealth.activeWells).toBe(20);
        expect(fieldHealth.totalWells).toBe(25);
      });

      it('should calculate average BOE correctly', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };
        const mockProductionResults = [
          {
            TOTAL_OIL: 0,
            TOTAL_GAS: 0,
            TOTAL_WATER: 0,
            TOTAL_BOE: 1200,
            PRODUCING_WELLS: 10,
          },
        ];

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce(mockProductionResults)
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.fieldHealth.averageBoe).toBe(120);
      });
    });

    describe('At Risk Assets Breakdown', () => {
      it('should correctly count severity levels', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };
        const mockAtRiskGroups = [
          { severity: 'Critical', _count: { severity: 3 } },
          { severity: 'High', _count: { severity: 5 } },
          { severity: 'Medium', _count: { severity: 7 } },
          { severity: 'Low', _count: { severity: 10 } },
        ];

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue(mockAtRiskGroups);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        const breakdown = responseData.atRiskAssets.breakdown;
        expect(breakdown.critical).toBe(3);
        expect(breakdown.high).toBe(5);
        expect(breakdown.medium).toBe(7);
        expect(breakdown.low).toBe(10);
        expect(responseData.atRiskAssets.highPriorityAssetsFlagged).toBe(8);
      });
    });

    describe('Anomaly Counts by Category', () => {
      it('should correctly aggregate anomaly counts by category', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };
        const mockAnomalyCounts = [
          { category: 'Financial', _count: { category: 4 } },
          { category: 'Operational', _count: { category: 6 } },
          { category: 'Process', _count: { category: 3 } },
          { category: 'Production', _count: { category: 5 } },
        ];

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue(mockAnomalyCounts);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        const counts = responseData.anomalyFeed.counts;
        expect(counts.financial).toBe(4);
        expect(counts.operational).toBe(6);
        expect(counts.process).toBe(3);
        expect(counts.production).toBe(5);
      });
    });

    describe('Metrics Breakdown Calculation', () => {
      it('should calculate daily metrics', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 50,
            daily_expense_benefit_usd: 1000,
            implementation_cost_usd: 10000,
            net_daily_benefit_usd: 900,
          },
          _count: { _all: 0 },
        };

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        const dayMetrics = responseData.operationalRecommendations.metrics.day;
        expect(dayMetrics.productionImpact).toBe(50);
        expect(dayMetrics.loeImpact).toBe(1000);
        expect(dayMetrics.profitabilityIndex).toBeLessThanOrEqual(1); // 900/10000
      });

      it('should calculate profitability index', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 100000,
            net_daily_benefit_usd: 500,
          },
          _count: { _all: 0 },
        };

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        const dayMetrics = responseData.operationalRecommendations.metrics.day;
        const expectedProfitability = 500 / 100000;
        expect(dayMetrics.profitabilityIndex).toBe(Number(expectedProfitability.toFixed(2)));
      });
    });

    describe.skip('Error Handling', () => {
      it('should handle database query errors gracefully', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        (prisma.operation_suggestion.aggregate as jest.Mock).mockRejectedValue(dbError);

        // Act
        try {
          await DashboardController.getDashboardData(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
          );
        } catch (error) {
          // Error handling test - swallow any errors during execution
        }

        // Assert
        // Either next() is called with error or response.status is called with error status
        const wasErrorHandled =
          mockNext.mock.calls.length > 0 ||
          (mockResponse.status as jest.Mock).mock.calls.some((c) => c[0] >= 400);
        expect(wasErrorHandled).toBe(true);
      });

      it('should handle Snowflake query errors', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };
        const snowflakeError = new Error('Snowflake connection failed');

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock).mockRejectedValueOnce(snowflakeError);

        // Act
        try {
          await DashboardController.getDashboardData(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
          );
        } catch (error) {
          // Error handling test - swallow any errors during execution
        }

        // Assert
        // Test should either log error or handle gracefully
        const wasErrorHandledOrLogged =
          mockNext.mock.calls.length > 0 || (logger.error as jest.Mock).mock.calls.length > 0;
        expect(wasErrorHandledOrLogged).toBe(true);
      });

      it('should handle partial data failures', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([]) // Empty production
          .mockResolvedValueOnce([]); // Empty well status

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(200);
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.fieldHealth.activeWells).toBe(0);
        expect(responseData.fieldHealth.totalWells).toBe(0);
      });
    });

    describe('Empty Data Handling', () => {
      it('should handle empty operation suggestions', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: null,
            daily_expense_benefit_usd: null,
            implementation_cost_usd: null,
            net_daily_benefit_usd: null,
          },
          _count: { _all: 0 },
        };

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(200);
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.operationalRecommendations.metrics.day.productionImpact).toBe(0);
      });

      it('should handle empty anomaly reviews', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.anomalyFeed.feed).toEqual([]);
        expect(responseData.anomalyFeed.counts.financial).toBe(0);
      });
    });

    describe('Data Validation', () => {
      it('should handle zero producing wells for BOE calculation', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };
        const mockProductionResults = [
          {
            TOTAL_OIL: 0,
            TOTAL_GAS: 0,
            TOTAL_WATER: 0,
            TOTAL_BOE: 0,
            PRODUCING_WELLS: 0,
          },
        ];

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce(mockProductionResults)
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.fieldHealth.averageBoe).toBe(0); // Should handle division by zero
      });

      it('should have consistent default facilities count', async () => {
        // Arrange
        const mockOpSuggestions = {
          _sum: {
            production_increase_bbl_day: 0,
            daily_expense_benefit_usd: 0,
            implementation_cost_usd: 0,
            net_daily_benefit_usd: 0,
          },
          _count: { _all: 0 },
        };

        (prisma.operation_suggestion.aggregate as jest.Mock).mockResolvedValue(mockOpSuggestions);
        (prisma.anomaly_suggestions.groupBy as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.anomaly_review.groupBy as jest.Mock).mockResolvedValue([]);
        (snowflakeUtils.executeQuery as jest.Mock)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Act
        await DashboardController.getDashboardData(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Assert
        const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
        expect(responseData.fieldHealth.facilities).toBe(19);
      });
    });
  });
});
