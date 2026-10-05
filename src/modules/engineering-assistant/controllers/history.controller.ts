import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../../config/db';
import { Prisma } from '@prisma/client';
import { storageService } from '../../../services/storage.service';
import { logger } from '../../../utils/logger';

export const HistoryController = {
  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as Request & { user?: { id: string; organization_id?: string } }).user;
      const userId = user?.id;
      const orgId = user?.organization_id;

      if (!userId || !orgId) {
        throw new Error('User ID and Organization ID are required');
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string)?.trim();
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const skip = (page - 1) * limit;

      const where: Prisma.chat_sessionsWhereInput = {
        userId,
        organization_id: orgId,
      };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          {
            chat_messages: {
              some: {
                content: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ];
      }

      if (startDate || endDate) {
        where.updatedAt = {};
        if (startDate) {
          where.updatedAt.gte = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          if (endDate.length <= 10) {
            // YYYY-MM-DD
            end.setHours(23, 59, 59, 999);
          }
          where.updatedAt.lte = end;
        }
      }

      const [total, sessions] = await Promise.all([
        prisma.chat_sessions.count({ where }),
        prisma.chat_sessions.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
          include: {
            chat_messages: {
              orderBy: { createdAt: 'asc' },
              include: {
                chat_files: true,
              },
            },
          },
        }),
      ]);

      const history = await Promise.all(
        sessions.map(async (session) => {
          const chats: Array<{
            id: string;
            role: string;
            question: string;
            files: Array<{ id: string; filename: string; url: string | null }>;
            answer: string;
            chartData: unknown;
            createdAt: Date;
          }> = [];

          let lastUserMsg: (typeof chats)[number] | null = null;

          const sortedMessages = session.chat_messages.sort((a, b) => {
            const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            if (timeDiff !== 0) return timeDiff;
            if (a.role === 'user' && b.role !== 'user') return -1;
            if (a.role !== 'user' && b.role === 'user') return 1;
            return 0;
          });

          for (const msg of sortedMessages) {
            if (msg.role === 'user') {
              const files = await Promise.all(
                msg.chat_files.map(async (f) => ({
                  id: f.id,
                  filename: f.filename,
                  url: await storageService.getFileUrl(f.s3Key),
                }))
              );

              lastUserMsg = {
                id: msg.id,
                role: msg.role,
                question: msg.content,
                files: files,
                answer: '',
                chartData: null,
                createdAt: msg.createdAt,
              };
              chats.push(lastUserMsg);
            } else if (msg.role === 'assistant') {
              if (lastUserMsg) {
                lastUserMsg.answer = msg.content;
                lastUserMsg.chartData = msg.chartData;
              }
            }
          }

          return {
            sessionId: session.id,
            title: session.title,
            updatedAt: session.updatedAt,
            chats: chats,
          };
        })
      );

      res.status(200).json({
        data: history,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Error fetching history:', error);
      next(error);
    }
  },
};
