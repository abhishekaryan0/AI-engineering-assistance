"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = void 0;
const db_1 = require("../config/db");
const client_1 = require("@prisma/client");
exports.chatService = {
    async getChatHistory(sessionId, orgId) {
        const messages = await db_1.prisma.chat_messages.findMany({
            where: { sessionId, organization_id: orgId },
            take: 100,
            orderBy: { createdAt: 'desc' },
        });
        return messages.reverse();
    },
    async saveTransaction(sessionId, userPrompt, aiResponse, uploadedFile, chartData, orgId, suggestions) {
        await db_1.prisma.$transaction(async (tx) => {
            const userMsg = await tx.chat_messages.create({
                data: { sessionId, organization_id: orgId, role: 'user', content: userPrompt },
            });
            if (uploadedFile) {
                await tx.chat_files.create({
                    data: {
                        messageId: userMsg.id,
                        organization_id: orgId,
                        filename: uploadedFile.filename,
                        mimeType: uploadedFile.mimeType,
                        s3Key: uploadedFile.s3Key,
                        textContent: uploadedFile.textContent || null,
                    },
                });
            }
            // Cleanup suggestions to store as a clean JSON array
            const suggestionsData = suggestions && suggestions.length > 0
                ? suggestions.map((s) => (typeof s === 'string' ? s : s.text))
                : client_1.Prisma.JsonNull;
            await tx.chat_messages.create({
                data: {
                    sessionId,
                    organization_id: orgId,
                    role: 'assistant',
                    content: aiResponse,
                    suggestions: suggestionsData,
                    chartData: chartData || client_1.Prisma.JsonNull,
                }, // 'suggestions' is a new column; cast until Prisma client fully regenerates
            });
            await tx.chat_sessions.update({
                where: { id: sessionId },
                data: { updatedAt: new Date() },
            });
        });
    },
    async getLastFileContent(sessionId) {
        const lastFiles = await db_1.prisma.chat_files.findMany({
            where: { chat_messages: { sessionId } },
            orderBy: { createdAt: 'desc' },
            take: 3,
        });
        if (!lastFiles || lastFiles.length === 0)
            return null;
        return lastFiles
            .map((f) => `\n=== FILE COMMENCED: ${f.filename} ===\n${f.textContent || '(No Text Content)'}\n=== FILE ENDED: ${f.filename} ===\n`)
            .join('\n');
    },
};
