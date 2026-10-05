/**
 * DOCX Handler Tests
 * Tests for DOCX document processing and text extraction
 */

import { DocxHandler } from '../../../src/services/handlers/docx.handler';
import { logger } from '../../../src/utils/logger';
import * as mammoth from 'mammoth';

jest.mock('mammoth');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('DOCX Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should extract text from DOCX', async () => {
      const buffer = Buffer.from('DOCX content');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Extracted DOCX text',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('Extracted DOCX text');
    });

    it('should extract formatted text', async () => {
      const buffer = Buffer.from('DOCX with formatting');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Formatted text content',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('Formatted text');
    });

    it('should handle DOCX with tables', async () => {
      const buffer = Buffer.from('DOCX with table');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Header1\tHeader2\nValue1\tValue2',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('Header1');
      expect(result).toContain('Value1');
    });

    it('should handle DOCX with lists', async () => {
      const buffer = Buffer.from('DOCX with list');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: '• Item 1\n• Item 2\n• Item 3',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('Item 1');
    });

    it('should handle DOCX with headers and footers', async () => {
      const buffer = Buffer.from('DOCX with headers');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Header content\nBody content\nFooter content',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('Header content');
      expect(result).toContain('Body content');
    });

    it('should handle multi-page DOCX', async () => {
      const buffer = Buffer.from('Multi-page DOCX');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Page 1 content\nPage 2 content\nPage 3 content',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('Page 1');
      expect(result).toContain('Page 2');
      expect(result).toContain('Page 3');
    });

    it('should handle DOCX with hyperlinks', async () => {
      const buffer = Buffer.from('DOCX with links');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Click here: https://example.com for more',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('https://example.com');
    });

    it('should handle DOCX with footnotes', async () => {
      const buffer = Buffer.from('DOCX with footnotes');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: 'Content with footnote reference\nFootnote: Additional info',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toContain('Additional info');
    });

    it('should handle empty DOCX', async () => {
      const buffer = Buffer.from('');

      (mammoth.extractRawText as jest.Mock).mockResolvedValue({
        value: '',
        messages: [],
      });

      const result = await DocxHandler.process(buffer);

      expect(result).toBe('');
    });

    it('should handle corrupted DOCX', async () => {
      const buffer = Buffer.from('Invalid DOCX');

      (mammoth.extractRawText as jest.Mock).mockRejectedValue(new Error('Invalid DOCX format'));

      await expect(DocxHandler.process(buffer)).rejects.toThrow('Invalid DOCX format');
    });

    // Skip null/undefined because signature is strictly typed in real usage, but maybe keep one test if needed?
    // Let's keep one test but cast it.
  });
});
