"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryController = void 0;
const db_1 = require("../../../config/db");
const storage_service_1 = require("../../../services/storage.service");
const logger_1 = require("../../../utils/logger");
exports.HistoryController = {
    async getHistory(req, res, next) {
        try {
            const user = req.user;
            const userId = user?.id;
            const orgId = user?.organization_id;
            if (!userId || !orgId) {
                throw new Error('User ID and Organization ID are required');
            }
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const search = req.query.search?.trim();
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            const skip = (page - 1) * limit;
            const where = {
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
                db_1.prisma.chat_sessions.count({ where }),
                db_1.prisma.chat_sessions.findMany({
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
            const history = await Promise.all(sessions.map(async (session) => {
                const chats = [];
                let lastUserMsg = null;
                const sortedMessages = session.chat_messages.sort((a, b) => {
                    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    if (timeDiff !== 0)
                        return timeDiff;
                    if (a.role === 'user' && b.role !== 'user')
                        return -1;
                    if (a.role !== 'user' && b.role === 'user')
                        return 1;
                    return 0;
                });
                for (const msg of sortedMessages) {
                    if (msg.role === 'user') {
                        const files = await Promise.all(msg.chat_files.map(async (f) => ({
                            id: f.id,
                            filename: f.filename,
                            url: await storage_service_1.storageService.getFileUrl(f.s3Key),
                        })));
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
                    }
                    else if (msg.role === 'assistant') {
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
            }));
            res.status(200).json({
                data: history,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching history:', error);
            next(error);
        }
    },
};
