/**
 * Operational Recommendations Controller Tests
 * Tests for operational recommendations endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { OperationalRecommendationsController } from '../../../../../src/modules/industrial-data/operational-recommendations/controllers/operational-recommendations.controller';
import { prisma } from '../../../../../src/config/db';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { glossaryService } from '../../../../../src/modules/glossary';
import { env } from '../../../../../src/config/config';
import { askasssist } from '../../../../../src/utils/askAssist.utils';
import { logger } from '../../../../../src/utils/logger';
import { AppError } from '../../../../../src/utils/AppError';

jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    operation_suggestion: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    operation_actions: {
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    atRiskAssistantChat: jest.fn(),
    chat: jest.fn(),
  },
}));

jest.mock('../../../../../src/modules/glossary', () => ({
  glossaryService: {
    findTerms: jest.fn(),
  },
}));

jest.mock('../../../../../src/utils/askAssist.utils', () => ({
  askasssist: jest.fn(),
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
    AT_RISK_AI_MODEL_SEARCH: 'gpt-4o',
  },
}));

describe('Operational Recommendations Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: { id: 'SUGG_001' },
      body: { question: 'How to improve this recommendation?' },
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
  });

  describe('askAssistant', () => {
    it('should return error if question is missing', async () => {
      mockRequest.body = {};

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should retrieve suggestion from database', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Optimize well pressure',
        well_id: 'WELL_001',
        priority: 'High',
        status: 'Active',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Here is assistance',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Here is assistance',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Final response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_suggestion.findUnique).toHaveBeenCalledWith({
        where: { id: 'SUGG_001', organization_id: 'org-123' },
      });
    });

    it('should return 404 if suggestion not found', async () => {
      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(null);

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(404);
    });

    it('should build suggestion context with all fields', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Optimize pressure',
        well_id: 'WELL_001',
        priority: 'High',
        status: 'Active',
        confidence_percent: 95,
        expected_impact: 'Increase production',
        production_increase_bbl_day: 150,
        net_daily_benefit_usd: 5000,
        implementation_cost_usd: 50000,
        asset_value_increase_usd: 200000,
        time_reduced_hours: 10,
        detailed_analysis: 'Detailed analysis here',
        current_performance: 'Current: 1500 bbl/day',
        optimal_performance: 'Optimal: 1650 bbl/day',
        recommended_model: 'Model A',
        conservative_approach: 'Conservative: 1550 bbl/day',
        aggressive_optimization: 'Aggressive: 1700 bbl/day',
        hybrid_model: 'Hybrid: 1600 bbl/day',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Context built successfully',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Context built successfully',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_suggestion.findUnique).toHaveBeenCalled();
    });

    it('should find and include glossary terms', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      const mockTerms = ['Production: Oil extraction', 'Well: Drill site'];

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue(mockTerms);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Response with glossary',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Response with glossary',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Final response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(glossaryService.findTerms).toHaveBeenCalledWith(mockRequest.body?.question);
    });

    it('should clean ID by removing quotes and colons', async () => {
      mockRequest.params = { id: '"SUGG_001"' };

      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Response',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Response',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_suggestion.findUnique).toHaveBeenCalledWith({
        where: { id: 'SUGG_001', organization_id: 'org-123' },
      });
    });

    it('should not search if env var is missing', async () => {
      // Temporarily unset env
      const originalEnv = env.AT_RISK_AI_MODEL_SEARCH;
      (env.AT_RISK_AI_MODEL_SEARCH as any) = undefined;

      const mockSuggestion = { id: 'SUGG_001', action: 'Action', well_id: 'WELL_001' };
      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);
      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);
      (llmService.chat as jest.Mock).mockResolvedValue({ content: 'Response' });
      (askasssist as jest.Mock).mockResolvedValue({ response: 'Response' });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(llmService.atRiskAssistantChat).not.toHaveBeenCalled();

      // Restore env
      (env.AT_RISK_AI_MODEL_SEARCH as any) = originalEnv;
    });

    it('should handle empty search response', async () => {
      const mockSuggestion = { id: 'SUGG_001', action: 'Action', well_id: 'WELL_001' };
      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);
      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);
      (llmService.chat as jest.Mock).mockResolvedValue({ content: 'Response' });

      // Return empty content
      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({ content: '' });
      (askasssist as jest.Mock).mockResolvedValue({ response: 'Response' });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      // Verify no error thrown and processed
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should call LLM service if configured for search', async () => {
      (env.AT_RISK_AI_MODEL_SEARCH as any) = 'gpt-4o';

      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Search results',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Search results',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(llmService.atRiskAssistantChat).toHaveBeenCalled();
    });

    it('should call askassist utility with suggestion context', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Test action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Search context',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Search context',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Final answer',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(askasssist as jest.Mock).toHaveBeenCalled();
    });

    it('should return response from askassist', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      const expectedResponse = {
        response: 'Here is the answer to your question',
        metadata: { source: 'LLM' },
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Search',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Search',
      });

      (askasssist as jest.Mock).mockResolvedValue(expectedResponse);

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        response: expectedResponse,
      });
    });

    it('should set status 200 on success', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Search',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Search',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors', async () => {
      (prisma.operation_suggestion.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle LLM errors gracefully', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Response',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockRejectedValue(new Error('LLM Error'));

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Fallback response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      // Should still call askassist
      expect(askasssist).toHaveBeenCalled();
    });

    it('should handle askassist errors', async () => {
      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Search',
      });

      (askasssist as jest.Mock).mockRejectedValue(new Error('Ask error'));

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Edge cases', () => {
    it('should handle empty question', async () => {
      mockRequest.body = { question: '' };

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should handle null ID', async () => {
      mockRequest.params = { id: null as any };

      const mockSuggestion = {
        id: null,
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(null);

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(404);
    });

    it('should handle very long question', async () => {
      mockRequest.body = { question: 'a'.repeat(10000) };

      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Response',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Response',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle special characters in question', async () => {
      mockRequest.body = { question: 'What about !@#$%^&*() special chars?' };

      const mockSuggestion = {
        id: 'SUGG_001',
        action: 'Action',
        well_id: 'WELL_001',
      };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(mockSuggestion);

      (glossaryService.findTerms as jest.Mock).mockReturnValue([]);

      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Response',
      });

      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({
        content: 'Response',
      });

      (askasssist as jest.Mock).mockResolvedValue({
        response: 'Response',
      });

      await OperationalRecommendationsController.askAssistant(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockResponse.json).toHaveBeenCalled();
    });
  });
  describe('getAllSuggestions', () => {
    it('should retrieve all suggestions with default pagination', async () => {
      const mockSuggestions = [
        {
          id: 'SUGG_001',
          created_at: new Date(),
          status: 'Open',
        },
        {
          id: 'SUGG_002',
          created_at: new Date(),
          status: 'Open',
        },
      ];

      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue(mockSuggestions);

      mockRequest.query = {};

      await OperationalRecommendationsController.getAllSuggestions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_suggestion.findMany).toHaveBeenCalledWith({
        where: { organization_id: 'org-123' },
        orderBy: {
          created_at: 'desc',
        },
      });

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestions: mockSuggestions,
          totalOpportunities: 2,
          activeOpportunities: 2,
          pagination: expect.objectContaining({
            page: 1,
            limit: 10,
            total: 2,
          }),
        })
      );
    });

    it('should filter by well_id', async () => {
      mockRequest.query = { well_id: 'WELL_001' };
      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue([]);

      await OperationalRecommendationsController.getAllSuggestions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_suggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { well_id: 'WELL_001', organization_id: 'org-123' },
        })
      );
    });

    it('should calculate metrics correctly for active suggestions', async () => {
      mockRequest.query = {};
      const mockSuggestions = [
        {
          id: 'SUGG_001',
          status: 'Open',
          production_increase_bbl_day: 100,
          daily_expense_benefit_usd: 50,
          implementation_cost_usd: 1000,
          net_daily_benefit_usd: 200,
          time_reduced_hours: 5,
        },
        // Inactive suggestion should be ignored in metrics but present in list
        {
          id: 'SUGG_002',
          status: 'Dismissed',
          production_increase_bbl_day: 500,
          net_daily_benefit_usd: 1000,
        },
      ];

      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue(mockSuggestions);

      await OperationalRecommendationsController.getAllSuggestions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      // Verify response structure via json call arguments
      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];

      expect(jsonCall.activeOpportunities).toBe(1);

      // Check metrics for "day" (multiplier 1)
      const dayMetrics = jsonCall.metrics.day;
      expect(dayMetrics.productionImpact).toBe(100);
      expect(dayMetrics.loeImpact).toBe(50);
      expect(dayMetrics.unproductiveTimeReduced).toBe(5);

      // simplified calculation check: (200 * 1) / 1000 = 0.2
      expect(dayMetrics.profitabilityIndex).toBe(0.2);
    });

    it('should handle infinite profitability (zero investment)', async () => {
      mockRequest.query = {};
      const mockSuggestions = [
        {
          id: 'SUGG_FREE',
          status: 'Open',
          production_increase_bbl_day: 100,
          daily_expense_benefit_usd: 50,
          implementation_cost_usd: 0, // Zero investment
          net_daily_benefit_usd: 200, // Positive benefit
          time_reduced_hours: 0,
        },
      ];

      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue(mockSuggestions);

      await OperationalRecommendationsController.getAllSuggestions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      // According to code: if (totalBenefit > 0) { profitabilityIndex = 0; }
      expect(jsonCall.metrics.day.profitabilityIndex).toBe(0);
    });

    it('should handle pagination parameters', async () => {
      mockRequest.query = { page: '2', limit: '5' };
      const mockSuggestions = Array(10).fill({ id: 'dummy' }); // Mocking enough data

      (prisma.operation_suggestion.findMany as jest.Mock).mockResolvedValue(mockSuggestions);

      await OperationalRecommendationsController.getAllSuggestions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      // The slice is performed on the result of findMany in the controller logic
      // So findMany is still called without skip/take args in the current implementation?
      // Waiting... checking implementation: yes, it fetches ALL matching records then slices in memory.
      // "const paginatedSuggestions = allSuggestions.slice(startIndex, endIndex);"

      const jsonCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.pagination.page).toBe(2);
      expect(jsonCall.pagination.limit).toBe(5);
      expect(jsonCall.suggestions.length).toBe(5);
    });

    it('should handle error in getAllSuggestions', async () => {
      (prisma.operation_suggestion.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'));

      await OperationalRecommendationsController.getAllSuggestions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateStatusAndReason', () => {
    it('should update status and reason successfully', async () => {
      mockRequest.params = { id: 'SUGG_001' };
      mockRequest.body = { status: 'InProgress', reason: 'Approved' };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue({ id: 'SUGG_001' });
      (prisma.operation_suggestion.update as jest.Mock).mockResolvedValue({
        id: 'SUGG_001',
        status: 'InProgress',
        status_reason: 'Approved',
      });

      await OperationalRecommendationsController.updateStatusAndReason(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_suggestion.update).toHaveBeenCalledWith({
        where: { id: 'SUGG_001', organization_id: 'org-123' },
        data: expect.objectContaining({
          status: 'InProgress',
          status_reason: 'Approved',
        }),
      });

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Operation suggestion updated successfully',
        })
      );
    });

    it('should clean ID param', async () => {
      mockRequest.params = { id: '"SUGG_001"' };
      mockRequest.body = { status: 'Done' };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue({ id: 'SUGG_001' });

      await OperationalRecommendationsController.updateStatusAndReason(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_suggestion.findUnique).toHaveBeenCalledWith({
        where: { id: 'SUGG_001', organization_id: 'org-123' },
      });
    });

    it('should handle undefined ID param', async () => {
      mockRequest.params = { id: undefined as any };
      mockRequest.body = { status: 'Done' };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue({ id: 'SUGG_001' });

      await OperationalRecommendationsController.updateStatusAndReason(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      // Expect it to proceed without ID cleaning or with undefined id
      // In the code, if(id) check fails, so id remains undefined.
      // Then prisma.findUnique({ where: { id: undefined } })

      expect(prisma.operation_suggestion.findUnique).toHaveBeenCalled();
    });

    it('should throw error if neither status nor reason provided', async () => {
      mockRequest.params = { id: 'SUGG_001' };
      mockRequest.body = {}; // Empty body

      await OperationalRecommendationsController.updateStatusAndReason(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockNext.mock.calls[0][0].message).toContain(
        'At least one of status or reason is required'
      );
    });

    it('should throw error if suggestion not found', async () => {
      mockRequest.params = { id: 'SUGG_001' };
      mockRequest.body = { status: 'Done' };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue(null);

      await OperationalRecommendationsController.updateStatusAndReason(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(404);
    });

    it('should handle errors during update', async () => {
      mockRequest.params = { id: 'SUGG_001' };
      mockRequest.body = { status: 'Done' };

      (prisma.operation_suggestion.findUnique as jest.Mock).mockResolvedValue({ id: 'SUGG_001' });
      (prisma.operation_suggestion.update as jest.Mock).mockRejectedValue(
        new Error('Update failed')
      );

      await OperationalRecommendationsController.updateStatusAndReason(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('createWorkItem', () => {
    const validWorkItemBody = {
      title: 'Fix Pump',
      audience: 'Engineers',
      location: 'Site A',
      scheduledDate: '2025-01-01',
      description: 'Fix the pump ASAP',
      communicationMethods: ['Email'],
    };

    it('should create or update work item successfully', async () => {
      mockRequest.params = { id: 'SUGG_001' };
      mockRequest.body = validWorkItemBody;

      (prisma.operation_actions.upsert as jest.Mock).mockResolvedValue({
        id: 'SUGG_001',
        ...validWorkItemBody,
      });

      await OperationalRecommendationsController.createWorkItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_actions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'SUGG_001' },
          create: expect.objectContaining({
            title: 'Fix Pump',
            id: 'SUGG_001',
            organization_id: 'org-123',
          }),
          update: expect.objectContaining({
            title: 'Fix Pump',
          }),
        })
      );

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Operation action saved successfully',
        })
      );
    });

    it('should throw error if required fields are missing', async () => {
      mockRequest.params = { id: 'SUGG_001' };
      mockRequest.body = { description: 'Missing title/date' };

      await OperationalRecommendationsController.createWorkItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should clean ID param', async () => {
      mockRequest.params = { id: '"SUGG_001"' };
      mockRequest.body = validWorkItemBody;

      await OperationalRecommendationsController.createWorkItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_actions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'SUGG_001' },
        })
      );
    });

    it('should handle undefined ID param', async () => {
      mockRequest.params = { id: undefined as any };
      mockRequest.body = validWorkItemBody;

      (prisma.operation_actions.upsert as jest.Mock).mockResolvedValue({});

      await OperationalRecommendationsController.createWorkItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(prisma.operation_actions.upsert).toHaveBeenCalled();
    });

    it('should handle errors during upsert', async () => {
      mockRequest.params = { id: 'SUGG_001' };
      mockRequest.body = validWorkItemBody;

      (prisma.operation_actions.upsert as jest.Mock).mockRejectedValue(new Error('Upsert failed'));

      await OperationalRecommendationsController.createWorkItem(
        mockRequest as Request,
        mockResponse as Response,
        mockNext as NextFunction
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
