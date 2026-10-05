import { Request, Response, NextFunction } from 'express';
import { AnomalyReviewController } from '../../../../../src/modules/industrial-data/anomaly-reviews/controllers/anomaly-reviews.controller';
import { prisma } from '../../../../../src/config/db';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { glossaryService } from '../../../../../src/modules/glossary';
import { askasssist } from '../../../../../src/utils/askAssist.utils';
import { AppError } from '../../../../../src/utils/AppError';

// Mock dependencies
jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    anomaly_review: {
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    anomaly_review_actions: {
      upsert: jest.fn(),
    },
  },
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

describe('AnomalyReviewController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      query: {},
      params: {},
      body: {},
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

  describe('getAnomalyReviews', () => {
    it('should return paginated reviews', async () => {
      (prisma.anomaly_review.findMany as jest.Mock).mockResolvedValue(['review1', 'review2']);
      (prisma.anomaly_review.count as jest.Mock).mockResolvedValue(20);
      req.query = { page: '1', limit: '10' };

      await AnomalyReviewController.getAnomalyReviews(req as Request, res as Response, next);

      expect(prisma.anomaly_review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organization_id: 'org-123' }),
          skip: 0,
          take: 10,
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          reviews: ['review1', 'review2'],
          pagination: { total: 20, page: 1, limit: 10, totalPages: 2 },
        })
      );
    });

    it('should handle errors', async () => {
      const error = new Error('DB Error');
      (prisma.anomaly_review.findMany as jest.Mock).mockRejectedValue(error);

      await AnomalyReviewController.getAnomalyReviews(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateStatus', () => {
    it('should update status successfully', async () => {
      req.params = { id: '123' };
      req.body = { status: 'RESOLVED', reason: 'Fixed' };
      (prisma.anomaly_review.update as jest.Mock).mockResolvedValue({
        id: '123',
        status: 'RESOLVED',
      });

      await AnomalyReviewController.updateStatus(req as Request, res as Response, next);

      expect(prisma.anomaly_review.update).toHaveBeenCalledWith({
        where: { id: '123', organization_id: 'org-123' },
        data: { status: 'RESOLVED', reason: 'Fixed' },
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Status updated successfully' })
      );
    });

    it('should handle colon prefix in ID', async () => {
      req.params = { id: ':123' };
      req.body = { status: 'OPEN' };

      await AnomalyReviewController.updateStatus(req as Request, res as Response, next);

      expect(prisma.anomaly_review.update).toHaveBeenCalledWith({
        where: { id: '123', organization_id: 'org-123' },
        data: { status: 'OPEN' },
      });
    });

    it('should throw error if no status or reason provided', async () => {
      req.params = { id: '123' };
      req.body = {};

      await AnomalyReviewController.updateStatus(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('takeAction', () => {
    it('should upsert action successfully', async () => {
      req.params = { id: '123' };
      req.body = {
        title: 'Action',
        scheduledDate: '2023-01-01',
        description: 'Desc',
      };
      (prisma.anomaly_review_actions.upsert as jest.Mock).mockResolvedValue({ id: '123' });

      await AnomalyReviewController.takeAction(req as Request, res as Response, next);

      expect(prisma.anomaly_review_actions.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ organization_id: 'org-123' }),
          update: expect.not.objectContaining({ organization_id: 'org-123' }),
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Action taken successfully' })
      );
    });

    it('should require title and scheduledDate', async () => {
      req.params = { id: '123' };
      req.body = { description: 'Desc' };

      await AnomalyReviewController.takeAction(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('askAssistant', () => {
    it('should answer question using LLM and context', async () => {
      req.params = { id: '123' };
      req.body = { question: 'What is this?' };

      (prisma.anomaly_review.findUnique as jest.Mock).mockResolvedValue({
        id: '123',
        well_id: 'well-1',
        event_date: new Date(),
        detected_at: new Date(),
        anomaly_code: 'A001',
      });
      (glossaryService.findTerms as jest.Mock).mockReturnValue(['Term: Definition']);
      (llmService.atRiskAssistantChat as jest.Mock).mockResolvedValue({ content: 'Search Info' });
      (llmService.chat as jest.Mock).mockResolvedValue({ content: 'LLM Response' });
      (askasssist as jest.Mock).mockReturnValue('Processed Response');

      await AnomalyReviewController.askAssistant(req as Request, res as Response, next);

      expect(prisma.anomaly_review.findUnique).toHaveBeenCalledWith({
        where: { id: '123', organization_id: 'org-123' },
        include: { anomaly_review_actions: true },
      });
      expect(glossaryService.findTerms).toHaveBeenCalledWith('What is this?');
      expect(llmService.atRiskAssistantChat).toHaveBeenCalled();
      expect(llmService.chat).toHaveBeenCalled();
      expect(askasssist).toHaveBeenCalledWith('LLM Response');
      expect(res.json).toHaveBeenCalledWith({ response: 'Processed Response' });
    });

    it('should return 404 if review not found', async () => {
      req.params = { id: '123' };
      req.body = { question: '?' };
      (prisma.anomaly_review.findUnique as jest.Mock).mockResolvedValue(null);

      await AnomalyReviewController.askAssistant(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});
