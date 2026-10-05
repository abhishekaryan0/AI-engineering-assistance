import { Request, Response, NextFunction } from 'express';
import { AtRiskAssistantController } from '../../../../../src/modules/industrial-data/at-risk/controllers/at-risk.controller';
import { prisma } from '../../../../../src/config/db';
import { executeQuery } from '../../../../../src/utils/snowflake';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { glossaryService } from '../../../../../src/modules/glossary';
import { askasssist } from '../../../../../src/utils/askAssist.utils';
import { AppError } from '../../../../../src/utils/AppError';

jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    anomaly_suggestions: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    alert_actions: {
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/utils/snowflake', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chat: jest.fn(),
    atRiskAssistantChat: jest.fn(),
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
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../../src/config/config', () => ({
  env: {
    AT_RISK_AI_MODEL_SEARCH: 'search-model',
  },
}));

describe('AtRiskAssistantController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      params: {},
      query: {},
      user: {
        id: 'user-123',
        organization_id: 'org-123',
      },
    } as any;
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe('atRiskAssistant', () => {
    it('should answer questions about an alert', async () => {
      req.params = { id: 'alert-1' };
      req.body = { question: 'What is the risk?' };

      (prisma.anomaly_suggestions.findUnique as jest.Mock).mockResolvedValue({
        id: 'alert-1',
        well_id: 'well-1',
        alert_title: 'High Pressure',
        severity: 'Critical',
      });
      (glossaryService.findTerms as jest.Mock).mockReturnValue(['Risk: Definition']);
      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({ content: 'Web Info' });
      (llmService.chat as jest.Mock).mockResolvedValue({ content: 'LLM Answer' });
      (askasssist as jest.Mock).mockReturnValue('Final Answer');

      await AtRiskAssistantController.atRiskAssistant(req as Request, res as Response, next);

      expect(prisma.anomaly_suggestions.findUnique).toHaveBeenCalledWith({
        where: { id: 'alert-1', organization_id: 'org-123' },
      });
      expect(llmService.chat).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ response: 'Final Answer' });
    });

    it('should throw error if alert not found', async () => {
      req.params = { id: 'alert-1' };
      req.body = { question: '?' };
      (prisma.anomaly_suggestions.findUnique as jest.Mock).mockResolvedValue(null);

      await AtRiskAssistantController.atRiskAssistant(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('getAtRiskAssets', () => {
    it('should fetch alerts with well status', async () => {
      req.query = { page: '1', limit: '10' };
      const mockAlerts = [{ id: '1', well_id: 'well-1', severity: 'High' }];

      (prisma.anomaly_suggestions.findMany as jest.Mock)
        .mockResolvedValueOnce(mockAlerts) // alerts
        .mockResolvedValueOnce(mockAlerts); // severity counts (mocking same list for simplicity)
      (prisma.anomaly_suggestions.count as jest.Mock).mockResolvedValue(1);
      (executeQuery as jest.Mock).mockResolvedValue([{ WELL_ID: 'well-1', STATUS: 'ACTIVE' }]);

      await AtRiskAssistantController.getAtRiskAssets(req as Request, res as Response, next);

      expect(prisma.anomaly_suggestions.findMany).toHaveBeenCalled();
      expect(executeQuery).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alerts: expect.arrayContaining([expect.objectContaining({ well_status: 'ACTIVE' })]),
          counts: expect.any(Object),
        })
      );
    });

    it('should handle Snowflake errors gracefully', async () => {
      (prisma.anomaly_suggestions.findMany as jest.Mock).mockResolvedValue([
        { id: '1', well_id: 'well-1' },
      ]);
      (prisma.anomaly_suggestions.count as jest.Mock).mockResolvedValue(1);
      (executeQuery as jest.Mock).mockRejectedValue(new Error('Snowflake Error'));

      await AtRiskAssistantController.getAtRiskAssets(req as Request, res as Response, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alerts: expect.arrayContaining([expect.objectContaining({ well_status: 'Unknown' })]),
        })
      );
    });
  });

  describe('updateAlertStatus', () => {
    it('should update status', async () => {
      req.params = { id: '1' };
      req.body = { status: 'CLOSED', reason: 'Fixed' };
      (prisma.anomaly_suggestions.update as jest.Mock).mockResolvedValue({
        id: '1',
        status: 'CLOSED',
      });

      await AtRiskAssistantController.updateAlertStatus(req as Request, res as Response, next);

      expect(prisma.anomaly_suggestions.update).toHaveBeenCalledWith({
        where: { id: '1', organization_id: 'org-123' },
        data: { status: 'CLOSED', reason: 'Fixed' },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Alert updated successfully' })
      );
    });
  });

  describe('createWorkItem', () => {
    it('should create work item', async () => {
      req.params = { id: '1' };
      req.body = { title: 'Work', scheduledDate: '2023-01-01' };
      (prisma.alert_actions.upsert as jest.Mock).mockResolvedValue({ id: '1' });

      await AtRiskAssistantController.createWorkItem(req as Request, res as Response, next);

      expect(prisma.alert_actions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ organization_id: 'org-123' }),
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Alert action saved successfully' })
      );
    });

    it('should validate required fields', async () => {
      req.params = { id: '1' };
      req.body = { description: 'Missing title' };

      await AtRiskAssistantController.createWorkItem(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});
