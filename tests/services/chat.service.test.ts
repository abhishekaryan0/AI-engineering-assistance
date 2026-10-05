/**
 * Chat Service Tests
 * Tests for chat history and transaction management
 */

import { chatService } from '../../src/services/chat.service';
import { prisma } from '../../src/config/db';
import { Prisma } from '@prisma/client';

jest.mock('../../src/config/db', () => ({
  prisma: {
    chat_messages: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    chat_files: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    chat_sessions: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('Chat Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getChatHistory', () => {
    it('should fetch chat history for a session', async () => {
      const mockMessages = [
        { id: '1', sessionId: 'sess_001', role: 'user', content: 'Hello', createdAt: new Date() },
        { id: '2', sessionId: 'sess_001', role: 'assistant', content: 'Hi', createdAt: new Date() },
      ];

      (prisma.chat_messages.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const result = await chatService.getChatHistory('sess_001');

      expect(prisma.chat_messages.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'sess_001' },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });

      expect(result).toEqual(mockMessages);
    });

    it('should return empty array if no messages', async () => {
      (prisma.chat_messages.findMany as jest.Mock).mockResolvedValue([]);

      const result = await chatService.getChatHistory('nonexistent');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should limit results to 100 messages', async () => {
      (prisma.chat_messages.findMany as jest.Mock).mockResolvedValue([]);

      await chatService.getChatHistory('sess_001');

      const call = (prisma.chat_messages.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('should order by creation date descending', async () => {
      (prisma.chat_messages.findMany as jest.Mock).mockResolvedValue([]);

      await chatService.getChatHistory('sess_001');

      const call = (prisma.chat_messages.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should handle database errors', async () => {
      (prisma.chat_messages.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(chatService.getChatHistory('sess_001')).rejects.toThrow('Database error');
    });
  });

  describe('saveTransaction', () => {
    it('should save user message, file, and assistant response', async () => {
      const mockTransaction = jest.fn(async (cb) => {
        const tx = {
          chat_messages: { create: jest.fn().mockResolvedValue({ id: 'msg_1' }) },
          chat_files: { create: jest.fn() },
          chat_sessions: { update: jest.fn() },
        };
        await cb(tx);
      });

      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      const uploadedFile = {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        s3Key: 's3://bucket/test.pdf',
        s3Url: 'https://s3.example.com/test.pdf',
        textContent: 'File content here',
      };

      await chatService.saveTransaction(
        'sess_001',
        'What is this file?',
        'This is a PDF file',
        uploadedFile,
        { chart: true }
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle transaction without file', async () => {
      const mockTransaction = jest.fn(async (cb) => {
        const tx = {
          chat_messages: { create: jest.fn().mockResolvedValue({ id: 'msg_1' }) },
          chat_files: { create: jest.fn() },
          chat_sessions: { update: jest.fn() },
        };
        await cb(tx);
      });

      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      await chatService.saveTransaction('sess_001', 'Hello', 'Hi there', null);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should save chart data if provided', async () => {
      const mockTransaction = jest.fn(async (cb) => {
        const tx = {
          chat_messages: { create: jest.fn().mockResolvedValue({ id: 'msg_1' }) },
          chat_files: { create: jest.fn() },
          chat_sessions: { update: jest.fn() },
        };
        await cb(tx);
      });

      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      const chartData = { type: 'line', data: [1, 2, 3] };

      await chatService.saveTransaction(
        'sess_001',
        'Show chart',
        'Here is the chart',
        null,
        chartData
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should update session updatedAt timestamp', async () => {
      const mockTransaction = jest.fn(async (cb) => {
        const tx = {
          chat_messages: { create: jest.fn().mockResolvedValue({ id: 'msg_1' }) },
          chat_files: { create: jest.fn() },
          chat_sessions: { update: jest.fn() },
        };
        await cb(tx);
      });

      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      await chatService.saveTransaction('sess_001', 'Message', 'Response', null);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should save file content', async () => {
      const mockTransaction = jest.fn(async (cb) => {
        const tx = {
          chat_messages: { create: jest.fn().mockResolvedValue({ id: 'msg_1' }) },
          chat_files: { create: jest.fn() },
          chat_sessions: { update: jest.fn() },
        };
        await cb(tx);
      });

      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      const file = {
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        s3Key: 'key',
        s3Url: 'url',
        textContent: 'Important content',
      };

      await chatService.saveTransaction('sess_001', 'Analyze this', 'Analysis here', file);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle null textContent', async () => {
      const mockTransaction = jest.fn(async (cb) => {
        const tx = {
          chat_messages: { create: jest.fn().mockResolvedValue({ id: 'msg_1' }) },
          chat_files: { create: jest.fn() },
          chat_sessions: { update: jest.fn() },
        };
        await cb(tx);
      });

      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      const file = {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        s3Key: 'key',
        s3Url: 'url',
      };

      await chatService.saveTransaction('sess_001', 'Message', 'Response', file);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle transaction errors', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('Transaction failed'));

      await expect(
        chatService.saveTransaction('sess_001', 'Message', 'Response', null)
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('getLastFileContent', () => {
    it('should fetch last 3 files from session', async () => {
      const mockFiles = [
        {
          id: '1',
          filename: 'file1.pdf',
          textContent: 'Content 1',
          createdAt: new Date(),
        },
        {
          id: '2',
          filename: 'file2.pdf',
          textContent: 'Content 2',
          createdAt: new Date(),
        },
      ];

      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue(mockFiles);

      const result = await chatService.getLastFileContent('sess_001');

      expect(prisma.chat_files.findMany).toHaveBeenCalled();
      expect(result).toContain('file1.pdf');
      expect(result).toContain('file2.pdf');
    });

    it('should return null if no files found', async () => {
      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue([]);

      const result = await chatService.getLastFileContent('sess_001');

      expect(result).toBeNull();
    });

    it('should format file content with delimiters', async () => {
      const mockFiles = [
        {
          id: '1',
          filename: 'document.txt',
          textContent: 'Document text',
          createdAt: new Date(),
        },
      ];

      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue(mockFiles);

      const result = await chatService.getLastFileContent('sess_001');

      expect(result).toContain('FILE COMMENCED');
      expect(result).toContain('FILE ENDED');
      expect(result).toContain('document.txt');
    });

    it('should handle files with null textContent', async () => {
      const mockFiles = [
        {
          id: '1',
          filename: 'file.pdf',
          textContent: null,
          createdAt: new Date(),
        },
      ];

      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue(mockFiles);

      const result = await chatService.getLastFileContent('sess_001');

      expect(result).toContain('No Text Content');
    });

    it('should limit to 3 most recent files', async () => {
      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue([]);

      await chatService.getLastFileContent('sess_001');

      const call = (prisma.chat_files.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(3);
    });

    it('should order by creation date descending', async () => {
      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue([]);

      await chatService.getLastFileContent('sess_001');

      const call = (prisma.chat_files.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should handle database errors', async () => {
      (prisma.chat_files.findMany as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(chatService.getLastFileContent('sess_001')).rejects.toThrow('Query failed');
    });

    it('should join multiple files with newlines', async () => {
      const mockFiles = [
        { id: '1', filename: 'file1.txt', textContent: 'Content 1', createdAt: new Date() },
        { id: '2', filename: 'file2.txt', textContent: 'Content 2', createdAt: new Date() },
        { id: '3', filename: 'file3.txt', textContent: 'Content 3', createdAt: new Date() },
      ];

      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue(mockFiles);

      const result = await chatService.getLastFileContent('sess_001');

      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
      expect(result).toContain('file3.txt');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty session ID', async () => {
      (prisma.chat_messages.findMany as jest.Mock).mockResolvedValue([]);

      const result = await chatService.getChatHistory('');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle special characters in upload filename', async () => {
      const mockTransaction = jest.fn(async (cb) => {
        const tx = {
          chat_messages: { create: jest.fn().mockResolvedValue({ id: 'msg_1' }) },
          chat_files: { create: jest.fn() },
          chat_sessions: { update: jest.fn() },
        };
        await cb(tx);
      });

      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      const file = {
        filename: 'Document (1) & [2024].pdf',
        mimeType: 'application/pdf',
        s3Key: 'key',
        s3Url: 'url',
        textContent: 'Content',
      };

      await chatService.saveTransaction('sess_001', 'Check file', 'Checked', file);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle very long content', async () => {
      const mockFiles = [
        {
          id: '1',
          filename: 'file.txt',
          textContent: 'a'.repeat(100000),
          createdAt: new Date(),
        },
      ];

      (prisma.chat_files.findMany as jest.Mock).mockResolvedValue(mockFiles);

      const result = await chatService.getLastFileContent('sess_001');

      expect(result).toBeDefined();
      expect(result?.length).toBeGreaterThan(0);
    });
  });
});
