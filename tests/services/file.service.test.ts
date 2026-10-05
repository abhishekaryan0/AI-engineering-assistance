/**
 * File Service Tests
 * Tests for file processing and upload handling
 */

import { fileService } from '../../src/services/file.service';
import { storageService } from '../../src/services/storage.service';
import { PdfHandler } from '../../src/services/handlers/pdf.handler';
import { ImageHandler } from '../../src/services/handlers/image.handler';
import { SpreadsheetHandler } from '../../src/services/handlers/spreadsheet.handler';
import { TextHandler } from '../../src/services/handlers/text.handler';
import { DocxHandler } from '../../src/services/handlers/docx.handler';
import { ragService } from '../../src/services/rag/rag.service';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/services/storage.service', () => ({
  storageService: {
    upload: jest.fn(),
    deleteFile: jest.fn(),
    verifyFile: jest.fn(),
    getFileUrl: jest.fn(),
  },
}));

jest.mock('../../src/services/handlers/pdf.handler', () => ({
  PdfHandler: {
    process: jest.fn().mockResolvedValue('pdf content'),
    validate: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/handlers/image.handler', () => ({
  ImageHandler: {
    process: jest.fn().mockResolvedValue('image content'),
    validate: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/handlers/spreadsheet.handler', () => ({
  SpreadsheetHandler: {
    process: jest.fn().mockResolvedValue('spreadsheet content'),
    validate: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/handlers/text.handler', () => ({
  TextHandler: {
    process: jest.fn().mockResolvedValue('text content'),
    validate: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/handlers/docx.handler', () => ({
  DocxHandler: {
    process: jest.fn().mockResolvedValue('docx content'),
    validate: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/rag/rag.service', () => ({
  ragService: {
    addDocument: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('File Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storageService.getFileUrl as jest.Mock).mockResolvedValue('url');
  });

  describe('processAndUpload', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'test.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      destination: '/uploads',
      filename: 'test.pdf',
      path: '/uploads/test.pdf',
      buffer: Buffer.from('test content'),
      stream: {} as any,
    };

    it('should process PDF files', async () => {
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'PDF content',
      });

      const result = await fileService.processAndUpload(mockFile, 'sess_001');

      expect(result).toHaveProperty('s3Key');
      expect(result).toHaveProperty('s3Url');
      expect(result).toHaveProperty('textContent');
      expect(result).toHaveProperty('processingStatus');
      expect(PdfHandler.process).toHaveBeenCalled();
    });

    it('should process image files', async () => {
      const imageFile = { ...mockFile, mimetype: 'image/jpeg', originalname: 'image.jpg' };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (ImageHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'Image description',
      });

      const result = await fileService.processAndUpload(imageFile, 'sess_001');

      expect(ImageHandler.process).toHaveBeenCalled();
      expect(result.processingStatus.fileType).toBe('image');
    });

    it('should process spreadsheet files', async () => {
      const xlsxFile = {
        ...mockFile,
        mimetype: 'application/vnd.ms-excel',
        originalname: 'data.xlsx',
      };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (SpreadsheetHandler.process as jest.Mock).mockReturnValue('Spreadsheet data');

      const result = await fileService.processAndUpload(xlsxFile, 'sess_001');

      expect(result).toHaveProperty('textContent');
    });

    it('should process text files', async () => {
      const textFile = { ...mockFile, mimetype: 'text/plain', originalname: 'data.txt' };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (TextHandler.process as jest.Mock).mockReturnValue('Text content');

      const result = await fileService.processAndUpload(textFile, 'sess_001');

      expect(TextHandler.process).toHaveBeenCalled();
    });

    it('should process DOCX files', async () => {
      const docxFile = {
        ...mockFile,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: 'document.docx',
      };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (DocxHandler.process as jest.Mock).mockResolvedValue('DOCX content');

      const result = await fileService.processAndUpload(docxFile, 'sess_001');

      expect(DocxHandler.process).toHaveBeenCalled();
    });

    it('should return successful processing status for PDF', async () => {
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'PDF content',
      });

      const result = await fileService.processAndUpload(mockFile, 'sess_001');

      expect(result.processingStatus.success).toBe(true);
      expect(result.processingStatus.fileType).toBe('pdf');
      expect(result.processingStatus.message).toContain('successfully');
    });

    it('should handle PDF processing errors', async () => {
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      const error = new Error('PDF parsing failed');
      (PdfHandler.process as jest.Mock).mockRejectedValue(error);

      const result = await fileService.processAndUpload(mockFile, 'sess_001');

      expect(result.processingStatus.success).toBe(false);
      expect(result.processingStatus.message).toContain('failed');
    });

    it('should handle image processing errors', async () => {
      const imageFile = { ...mockFile, mimetype: 'image/jpeg', originalname: 'image.jpg' };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      const error = new Error('Image processing failed');
      (ImageHandler.process as jest.Mock).mockRejectedValue(error);

      const result = await fileService.processAndUpload(imageFile, 'sess_001');

      expect(result.processingStatus.success).toBe(false);
    });

    it('should call storage service upload', async () => {
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (TextHandler.process as jest.Mock).mockReturnValue('Text');

      await fileService.processAndUpload(mockFile, 'sess_001');

      expect(storageService.upload).toHaveBeenCalledWith(mockFile, 'uploads', undefined, undefined);
    });

    it('should include S3 upload details in result', async () => {
      const s3Details = { key: 'bucket/file', s3Url: 'https://s3.example.com/file' };

      (storageService.upload as jest.Mock).mockResolvedValue(s3Details);
      (storageService.getFileUrl as jest.Mock).mockResolvedValue('https://s3.example.com/file');

      (TextHandler.process as jest.Mock).mockReturnValue('Content');

      const result = await fileService.processAndUpload(mockFile, 'sess_001');

      expect(result.s3Key).toBe('bucket/file');
      expect(result.s3Url).toBe('https://s3.example.com/file');
    });

    it('should handle TIFF images', async () => {
      const tiffFile = { ...mockFile, mimetype: 'image/tiff', originalname: 'scan.tiff' };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });
      (storageService.getFileUrl as jest.Mock).mockResolvedValue('url');

      (ImageHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'TIFF content',
      });

      const result = await fileService.processAndUpload(tiffFile, 'sess_001');

      expect(ImageHandler.process).toHaveBeenCalled();
    });

    it('should handle unknown file types gracefully', async () => {
      const unknownFile = {
        ...mockFile,
        mimetype: 'application/unknown',
        originalname: 'file.xyz',
      };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });
      (storageService.getFileUrl as jest.Mock).mockResolvedValue('url');

      const result = await fileService.processAndUpload(unknownFile, 'sess_001');

      expect(result).toHaveProperty('processingStatus');
    });

    it('should use session ID for file processing', async () => {
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });
      (storageService.getFileUrl as jest.Mock).mockResolvedValue('url');

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'Content',
      });

      await fileService.processAndUpload(mockFile, 'session_123');

      expect(PdfHandler.process).toHaveBeenCalledWith(
        mockFile.buffer,
        'session_123',
        mockFile.originalname,
        undefined,
        undefined
      );
    });

    it('should preserve original filename in processing', async () => {
      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'Content',
      });

      const fileWithSpecialName = { ...mockFile, originalname: 'Annual Report 2024 (Draft).pdf' };

      await fileService.processAndUpload(fileWithSpecialName, 'sess_001');

      expect(PdfHandler.process).toHaveBeenCalledWith(
        expect.any(Buffer),
        'sess_001',
        'Annual Report 2024 (Draft).pdf',
        undefined,
        undefined
      );
    });
  });

  describe('Edge cases', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'test.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      destination: '/uploads',
      filename: 'test.pdf',
      path: '/uploads/test.pdf',
      buffer: Buffer.from('content'),
      stream: {} as any,
    };

    it('should handle empty file buffer', async () => {
      const emptyFile = { ...mockFile, buffer: Buffer.alloc(0) };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: '',
      });

      const result = await fileService.processAndUpload(emptyFile, 'sess_001');

      expect(result).toHaveProperty('textContent');
    });

    it('should handle very large files', async () => {
      const largeFile = { ...mockFile, size: 100 * 1024 * 1024, buffer: Buffer.alloc(1000) };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'Large file content',
      });

      const result = await fileService.processAndUpload(largeFile, 'sess_001');

      expect(result).toBeDefined();
    });

    it('should handle storage upload errors', async () => {
      (storageService.upload as jest.Mock).mockRejectedValue(new Error('Upload failed'));

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'Content',
      });

      await expect(fileService.processAndUpload(mockFile, 'sess_001')).rejects.toThrow();
    });

    it('should handle case-insensitive mime types', async () => {
      const mixedCaseFile = { ...mockFile, mimetype: 'APPLICATION/PDF' };

      (storageService.upload as jest.Mock).mockResolvedValue({
        key: 'key',
        s3Url: 'url',
      });

      (PdfHandler.process as jest.Mock).mockResolvedValue({
        textContent: 'Content',
      });

      const result = await fileService.processAndUpload(mixedCaseFile, 'sess_001');

      expect(result).toBeDefined();
    });
  });
});
