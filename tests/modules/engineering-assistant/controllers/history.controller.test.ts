import { Request, Response, NextFunction } from 'express';
import { HistoryController } from '../../../../src/modules/engineering-assistant/controllers/history.controller';
import { prisma } from '../../../../src/config/db';
import { storageService } from '../../../../src/services/storage.service';

// Mock dependencies
jest.mock('../../../../src/config/db', () => ({
  prisma: {
    chat_sessions: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../../src/services/storage.service', () => ({
  storageService: {
    getFileUrl: jest.fn(),
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('HistoryController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      query: {},
      user: { id: 'user-123', organization_id: 'org-123' },
    } as any;
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  it('should fetch history with pagination', async () => {
    (prisma.chat_sessions.count as jest.Mock).mockResolvedValue(20);
    (prisma.chat_sessions.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'session-1',
        title: 'Title',
        updatedAt: new Date(),
        chat_messages: [],
      },
    ]);

    req.query = { page: '1', limit: '10' };

    await HistoryController.getHistory(req as Request, res as Response, next);

    expect(prisma.chat_sessions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        where: { userId: 'user-123', organization_id: 'org-123' },
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: { total: 20, page: 1, limit: 10, totalPages: 2 },
      })
    );
  });

  it('should filter by search term', async () => {
    req.query = { search: 'test' };

    await HistoryController.getHistory(req as Request, res as Response, next);

    expect(prisma.chat_sessions.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-123',
          organization_id: 'org-123',
          OR: [
            { title: { contains: 'test', mode: 'insensitive' } },
            {
              chat_messages: {
                some: {
                  content: { contains: 'test', mode: 'insensitive' },
                },
              },
            },
          ],
        }),
      })
    );
  });

  it('should filter by date range', async () => {
    req.query = { startDate: '2023-01-01', endDate: '2023-01-31' };

    await HistoryController.getHistory(req as Request, res as Response, next);

    expect(prisma.chat_sessions.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-123',
          organization_id: 'org-123',
          updatedAt: {
            gte: new Date('2023-01-01'),
            lte: expect.any(Date),
          },
        }),
      })
    );
  });

  it('should format response correctly', async () => {
    const mockDate = new Date();
    (prisma.chat_sessions.count as jest.Mock).mockResolvedValue(1);
    (prisma.chat_sessions.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'session-1',
        title: 'Test Session',
        updatedAt: mockDate,
        chat_messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'User Question',
            createdAt: mockDate,
            chat_files: [{ id: 'file-1', filename: 'test.pdf', s3Key: 'key' }],
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'AI Answer',
            chartData: { chart: 'data' },
            createdAt: mockDate,
            chat_files: [],
          },
        ],
      },
    ]);

    (storageService.getFileUrl as jest.Mock).mockResolvedValue('http://url.com');

    await HistoryController.getHistory(req as Request, res as Response, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            sessionId: 'session-1',
            title: 'Test Session',
            updatedAt: mockDate,
            chats: [
              {
                id: 'msg-1',
                role: 'user',
                question: 'User Question',
                files: [{ id: 'file-1', filename: 'test.pdf', url: 'http://url.com' }],
                answer: 'AI Answer',
                chartData: { chart: 'data' },
                createdAt: mockDate,
              },
            ],
          },
        ],
      })
    );
  });

  it('should handle errors', async () => {
    const error = new Error('DB Error');
    (prisma.chat_sessions.count as jest.Mock).mockRejectedValue(error);

    await HistoryController.getHistory(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
