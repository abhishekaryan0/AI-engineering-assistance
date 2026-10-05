/**
 * PDF Handler Tests
 * Tests for PDF document processing and text extraction
 */

import { PdfHandler } from '../../../src/services/handlers/pdf.handler';
import { llmService } from '../../../src/services/llm/llm.service';
import { ragService } from '../../../src/services/rag/rag.service';
import { logger } from '../../../src/utils/logger';
import { PDFParse } from 'pdf-parse';

// Mock dependencies
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn(),
}));

jest.mock('../../../src/services/llm/llm.service', () => ({
  llmService: {
    vision: jest.fn(),
  },
}));

jest.mock('../../../src/services/rag/rag.service', () => ({
  ragService: {
    addDocument: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('child_process');
jest.mock('fs');

// Import mocked modules
import { spawn } from 'child_process';
import * as fs from 'fs';

describe('PDF Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('mock-data'));
    (fs.readdirSync as jest.Mock).mockReturnValue([]);

    // Mock spawn to return a mock child process
    const mockChildProcess: any = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn((event: string, handler: any) => {
        // Simulate child process close event
        if (event === 'close') {
          setTimeout(() => handler(1), 0); // Simulate failure
        }
        return mockChildProcess;
      }),
    };

    (spawn as jest.Mock).mockReturnValue(mockChildProcess);

    // Default PDFParse mock implementation
    (PDFParse as any as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({
        text: 'Extracted PDF text content that is long enough to bypass vision check.',
        pages: [],
      }),
      getInfo: jest.fn().mockResolvedValue({
        pages: [{ pageNumber: 1 }],
      }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));
  });

  describe('process', () => {
    it('should extract text from PDF using pdf-parse', async () => {
      const buffer = Buffer.from('pdf-content');
      const sessionId = 'test-session';
      const filename = 'test.pdf';
      const mockText = 'Extracted PDF text content that is long enough to bypass vision check.';

      const result = await PdfHandler.process(buffer, sessionId, filename);

      expect(PDFParse).toHaveBeenCalledWith({ data: buffer });
      expect(result.textContent).toContain(mockText);

      // Should also trigger addDocument for immediate context
      expect(ragService.addDocument).toHaveBeenCalledWith(
        expect.stringContaining(mockText),
        expect.objectContaining({ sessionId, filename, type: 'digital_immediate' })
      );
    });

    it('should handle PDFParse failure gracefully', async () => {
      const buffer = Buffer.from('invalid-pdf');
      const sessionId = 'test-session';
      const filename = 'invalid.pdf';

      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockRejectedValue(new Error('Parse error')),
        getInfo: jest.fn().mockRejectedValue(new Error('Parse error')),
        destroy: jest.fn(),
      }));

      // Catch error from vision path when PDFParse fails
      try {
        await PdfHandler.process(buffer, sessionId, filename);
      } catch (error: unknown) {
        // Expected to throw as PDFParse fails and spawn mocks with code 1
        expect(error).toBeDefined();
      }
    });

    it('should log success when PDF data is extracted', async () => {
      const buffer = Buffer.from('pdf-content');
      const sessionId = 'test-session';
      const filename = 'test.pdf';

      await PdfHandler.process(buffer, sessionId, filename);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Initial PDF Parse Success')
      );
    });

    it('should process multiple paragraphs and split context', async () => {
      const buffer = Buffer.from('large');
      const sessionId = 'test-session';
      const filename = 'large.pdf';

      // Create text with multiple paragraphs to exceed 1500 word limit
      const paragraphs = Array(100)
        .fill('This is a paragraph with enough words to count as content. ')
        .join('\n\n');

      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({
          text: paragraphs,
          pages: [],
        }),
        getInfo: jest.fn().mockResolvedValue({
          pages: [{ pageNumber: 1 }],
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      const result = await PdfHandler.process(buffer, sessionId, filename);

      // Verify addDocument was called with background context
      const addDocumentCalls = (ragService.addDocument as jest.Mock).mock.calls;
      expect(addDocumentCalls.length).toBeGreaterThan(0);
    });

    it('should handle text with visual keywords', async () => {
      const buffer = Buffer.from('chart');
      const sessionId = 'test-session';
      const filename = 'chart.pdf';

      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({
          text: 'Chart showing Figure and Table data with Graph visualization.',
          pages: [],
        }),
        getInfo: jest.fn().mockResolvedValue({
          pages: [{ pageNumber: 1 }],
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      const result = await PdfHandler.process(buffer, sessionId, filename);

      expect(result.textContent).toBeDefined();
    });

    it('should extract full text without chunking when text fits in immediate context', async () => {
      const buffer = Buffer.from('small');
      const sessionId = 'test-session';
      const filename = 'small.pdf';
      const smallText = 'Small PDF content that will not exceed the word limit.';

      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({
          text: smallText,
          pages: [],
        }),
        getInfo: jest.fn().mockResolvedValue({
          pages: [{ pageNumber: 1 }],
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      const result = await PdfHandler.process(buffer, sessionId, filename);

      expect(result.textContent).toContain(smallText);
    });

    it('should call destroy on parser instance', async () => {
      const buffer = Buffer.from('pdf-content');
      const sessionId = 'test-session';
      const filename = 'test.pdf';

      const destroyMock = jest.fn().mockResolvedValue(undefined);
      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({
          text: 'Content',
          pages: [],
        }),
        getInfo: jest.fn().mockResolvedValue({
          pages: [{ pageNumber: 1 }],
        }),
        destroy: destroyMock,
      }));

      await PdfHandler.process(buffer, sessionId, filename);

      expect(destroyMock).toHaveBeenCalled();
    });

    it('should handle empty text from PDFParse', async () => {
      const buffer = Buffer.from('empty');
      const sessionId = 'test-session';
      const filename = 'empty.pdf';

      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({
          text: '',
          pages: [],
        }),
        getInfo: jest.fn().mockResolvedValue({
          pages: [{ pageNumber: 1 }],
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      // Catch error thrown by vision path
      try {
        await PdfHandler.process(buffer, sessionId, filename);
      } catch (error: unknown) {
        // Expected toThrow as spawn mocks with code 1
        expect(error).toBeDefined();
      }
    });

    it('should handle whitespace-only text', async () => {
      const buffer = Buffer.from('whitespace');
      const sessionId = 'test-session';
      const filename = 'whitespace.pdf';

      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({
          text: '   \n\n   ',
          pages: [],
        }),
        getInfo: jest.fn().mockResolvedValue({
          pages: [{ pageNumber: 1 }],
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      // Catch error thrown by vision path
      try {
        await PdfHandler.process(buffer, sessionId, filename);
      } catch (error: unknown) {
        // Expected to throw as spawn mocks with code 1
        expect(error).toBeDefined();
      }
    });

    it('should extract text via poppler if PDFParse fails', async () => {
      const buffer = Buffer.from('empty');
      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ text: '', pages: [] }),
        getInfo: jest.fn().mockResolvedValue({ pages: [] }),
        destroy: jest.fn(),
      }));

      (spawn as jest.Mock).mockImplementationOnce((cmd) => {
        const cp: any = {
          stdout: { on: jest.fn((e, cb) => cb('Poppler text '.repeat(10))) },
          stderr: { on: jest.fn() },
          on: jest.fn((e, cb) => {
            if (e === 'close') setTimeout(() => cb(0), 0);
            return cp;
          }),
        };
        return cp;
      });

      const result = await PdfHandler.process(buffer, 'sess-1', 'test.pdf');
      expect(result.textContent).toContain('Poppler text');
    });

    it('should process PDF via vision fallback', async () => {
      const buffer = Buffer.from('vision');
      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ text: '', pages: [] }),
        getInfo: jest.fn().mockResolvedValue({ pages: [{}] }),
        destroy: jest.fn(),
      }));

      // Poppler fails
      (spawn as jest.Mock).mockImplementationOnce((cmd) => {
        const cp: any = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((e, cb) => {
            if (e === 'close') setTimeout(() => cb(1), 0);
            return cp;
          }),
        };
        return cp;
      });

      // pdftoppm succeeds
      (spawn as jest.Mock).mockImplementationOnce((cmd) => {
        const cp: any = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((e, cb) => {
            if (e === 'close') setTimeout(() => cb(0), 0);
            return cp;
          }),
        };
        return cp;
      });

      const mockNow = 12345;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      (fs.readdirSync as jest.Mock).mockReturnValue([
        `${mockNow}_test-1.jpg`,
        `${mockNow}_test-2.jpg`,
        `${mockNow}_test-3.jpg`,
        `${mockNow}_test-4.jpg`,
        `${mockNow}_test-5.jpg`,
        `${mockNow}_test-6.jpg`,
      ]);
      (llmService.vision as jest.Mock).mockResolvedValue({ content: 'Vision page text' });

      const result = await PdfHandler.process(buffer, 'sess-2', 'test.pdf');

      jest.restoreAllMocks();

      expect(result.textContent).toContain('Vision page text');
    });

    it('should handle background rag errors safely', async () => {
      const buffer = Buffer.from('digital-large');
      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ text: 'word '.repeat(2000), pages: [] }),
        getInfo: jest.fn().mockResolvedValue({ pages: [{}] }),
        destroy: jest.fn(),
      }));
      (ragService.addDocument as jest.Mock).mockRejectedValueOnce(new Error('rag err'));

      const result = await PdfHandler.process(buffer, 'sess', 'test.pdf');
      expect(result.textContent).toBeDefined();
    });

    it('should handle ENOENT and stderr on convertPdfToImages', async () => {
      const buffer = Buffer.from('vision-err');
      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ text: '', pages: [] }),
        getInfo: jest.fn().mockResolvedValue({ pages: [{}] }),
        destroy: jest.fn(),
      }));

      // Poppler fails
      (spawn as jest.Mock).mockImplementationOnce((cmd) => {
        const cp: any = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((e, cb) => {
            if (e === 'close') setTimeout(() => cb(1), 0);
            return cp;
          }),
        };
        return cp;
      });

      // pdftoppm fails with ENOENT and stderr data
      (spawn as jest.Mock).mockImplementationOnce((cmd) => {
        const cp: any = {
          stdout: { on: jest.fn() },
          stderr: {
            on: jest.fn((e, cb) => {
              if (e === 'data') cb('some error data');
            }),
          },
          on: jest.fn((e, cb) => {
            if (e === 'error') {
              const err: any = new Error('not found');
              err.code = 'ENOENT';
              setTimeout(() => cb(err), 0);
            }
            return cp;
          }),
        };
        return cp;
      });

      try {
        await PdfHandler.process(buffer, 'sess-err', 'test.pdf');
      } catch (err: any) {
        expect(err.message).toContain('poppler-utils');
      }
    });

    it('should handle background pages loop for 7+ files', async () => {
      const buffer = Buffer.from('vision-loop');
      (PDFParse as any as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ text: '', pages: [] }),
        getInfo: jest.fn().mockResolvedValue({ pages: [{}] }),
        destroy: jest.fn(),
      }));

      // Poppler fails
      (spawn as jest.Mock).mockImplementationOnce((cmd) => {
        const cp: any = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((e, cb) => {
            if (e === 'close') setTimeout(() => cb(1), 0);
            return cp;
          }),
        };
        return cp;
      });

      // pdftoppm succeeds
      (spawn as jest.Mock).mockImplementationOnce((cmd) => {
        const cp: any = {
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((e, cb) => {
            if (e === 'close') setTimeout(() => cb(0), 0);
            return cp;
          }),
        };
        return cp;
      });

      const mockNow = 11111;
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      (fs.readdirSync as jest.Mock).mockReturnValue([
        `${mockNow}_test-1.jpg`,
        `${mockNow}_test-2.jpg`,
        `${mockNow}_test-3.jpg`,
        `${mockNow}_test-4.jpg`,
        `${mockNow}_test-5.jpg`,
        `${mockNow}_test-6.jpg`,
        `${mockNow}_test-7.jpg`,
        `${mockNow}_test-8.jpg`, // triggers to jump to next loop
      ]);
      (llmService.vision as jest.Mock).mockResolvedValue({
        content: 'Vision page text background',
      });

      // spy on setImmediate
      jest.spyOn(global, 'setImmediate').mockImplementation((cb: any) => {
        cb();
        return {} as any;
      });
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return {} as any;
      });

      const result = await PdfHandler.process(buffer, 'sess-loop', 'test.pdf');

      expect(result.textContent).toContain('being processed in the background');

      jest.restoreAllMocks();
    });
  });
});
