import { prisma } from '../config/db';
import { Prisma } from '@prisma/client';

interface UploadedFileParams {
  filename: string;
  mimeType: string;
  s3Key: string;
  s3Url: string;
  textContent?: string;
}

export const chatService = {
  async getChatHistory(sessionId: string, orgId?: string) {
    const messages = await prisma.chat_messages.findMany({
      where: { sessionId, organization_id: orgId },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return messages.reverse();
  },

  async saveTransaction(
    sessionId: string,
    userPrompt: string,
    aiResponse: string,
    uploadedFile: UploadedFileParams | null,
    chartData?: unknown,
    orgId?: string,
    suggestions?: any[]
  ) {
    await prisma.$transaction(async (tx) => {
      const userMsg = await tx.chat_messages.create({
        data: { sessionId, organization_id: orgId as string, role: 'user', content: userPrompt },
      });

      if (uploadedFile) {
        await tx.chat_files.create({
          data: {
            messageId: userMsg.id,
            organization_id: orgId as string,
            filename: uploadedFile.filename,
            mimeType: uploadedFile.mimeType,
            s3Key: uploadedFile.s3Key,
            textContent: uploadedFile.textContent || null,
          },
        });
      }

      // Cleanup suggestions to store as a clean JSON array
      const suggestionsData =
        suggestions && suggestions.length > 0
          ? (suggestions.map((s) => (typeof s === 'string' ? s : s.text)) as Prisma.InputJsonValue)
          : Prisma.JsonNull;

      await tx.chat_messages.create({
        data: {
          sessionId,
          organization_id: orgId as string,
          role: 'assistant',
          content: aiResponse,
          suggestions: suggestionsData,
          chartData: (chartData as Prisma.InputJsonValue) || Prisma.JsonNull,
        } as any, // 'suggestions' is a new column; cast until Prisma client fully regenerates
      });

      await tx.chat_sessions.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
    });
  },

  async getLastFileContent(sessionId: string): Promise<string | null> {
    const lastFiles = await prisma.chat_files.findMany({
      where: { chat_messages: { sessionId } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    if (!lastFiles || lastFiles.length === 0) return null;

    return lastFiles
      .map(
        (f) =>
          `\n=== FILE COMMENCED: ${f.filename} ===\n${f.textContent || '(No Text Content)'}\n=== FILE ENDED: ${f.filename} ===\n`
      )
      .join('\n');
  },
};
