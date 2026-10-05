/**
 * @file storage.service.test.ts
 * @description Comprehensive tests for storage/S3 service
 */

import { storageService } from '../../src/services/storage.service';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../src/config/config';
import { logger } from '../../src/utils/logger';
import { Readable } from 'stream';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('../../src/utils/logger');

const createMockFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    destination: '/uploads',
    filename: 'test.pdf',
    path: '/uploads/test.pdf',
    buffer: Buffer.from('test content'),
    stream: new Readable(),
    ...overrides,
});

describe('Storage Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('upload', () => {
        it('should upload file to S3', async () => {
            // Arrange
            const mockFile = createMockFile();

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act
            const result = await storageService.upload(mockFile);

            // Assert
            expect(result).toHaveProperty('key');
            expect(result.key).toContain('uploads/');
            expect(result.key).toContain('.pdf');
        });

        it('should generate unique file names', async () => {
            // Arrange
            const mockFile = createMockFile({
                originalname: 'document.docx',
                mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                size: 2048,
                filename: 'document.docx',
            });

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act
            const result1 = await storageService.upload(mockFile);
            const result2 = await storageService.upload(mockFile);

            // Assert
            expect(result1.key).not.toBe(result2.key);
        });

        it('should use custom folder path', async () => {
            // Arrange
            const mockFile = createMockFile({
                originalname: 'image.png',
                mimetype: 'image/png',
                size: 512,
                filename: 'image.png',
            });

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act
            const result = await storageService.upload(mockFile, 'custom-folder');

            // Assert
            expect(result.key).toContain('custom-folder/');
        });

        it('should preserve file extension', async () => {
            // Arrange
            const extensions = ['pdf', 'docx', 'png', 'jpg', 'xlsx'];
            const mockFiles = extensions.map((ext) => createMockFile({
                originalname: `file.${ext}`,
                filename: `file.${ext}`,
            }));

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act & Assert
            for (const file of mockFiles) {
                const result = await storageService.upload(file);
                expect(result.key).toContain(`.${file.originalname.split('.').pop()}`);
            }
        });

        it('should handle upload errors', async () => {
            // Arrange
            const mockFile = createMockFile();

            const uploadError = new Error('S3 Upload Failed');
            (S3Client.prototype.send as jest.Mock) = jest.fn().mockRejectedValue(uploadError);

            // Act & Assert
            await expect(storageService.upload(mockFile)).rejects.toThrow('S3 Upload Failed');
        });
    });

    describe('getFileUrl', () => {
        it('should generate signed URL for valid key', async () => {
            // Arrange
            const key = 'uploads/abc123.pdf';
            const expectedUrl = 'https://bucket.s3.amazonaws.com/uploads/abc123.pdf?signature=xyz';

            (getSignedUrl as jest.Mock).mockResolvedValue(expectedUrl);

            // Act
            const result = await storageService.getFileUrl(key);

            // Assert
            expect(result).toBe(expectedUrl);
        });

        it('should return null for empty key', async () => {
            // Act
            const result = await storageService.getFileUrl('');

            // Assert
            expect(result).toBeNull();
        });

        it('should return null for null key', async () => {
            // Act
            const result = await storageService.getFileUrl(null as any);

            // Assert
            expect(result).toBeNull();
        });

        it('should handle URL generation errors', async () => {
            // Arrange
            const key = 'uploads/abc123.pdf';
            const error = new Error('URL Generation Failed');

            (getSignedUrl as jest.Mock).mockRejectedValue(error);

            // Act
            const result = await storageService.getFileUrl(key);

            // Assert
            expect(result).toBeNull();
            expect(logger.error).toHaveBeenCalled();
        });

        it('should set correct URL expiration', async () => {
            // Arrange
            const key = 'uploads/abc123.pdf';
            (getSignedUrl as jest.Mock).mockResolvedValue('https://example.com/file');

            // Act
            await storageService.getFileUrl(key);

            // Assert
            const callArgs = (getSignedUrl as jest.Mock).mock.calls[0];
            expect(callArgs[2]).toHaveProperty('expiresIn', 3600);
        });

        it('should handle very long file keys', async () => {
            // Arrange
            const key = 'uploads/' + 'a'.repeat(1000) + '.pdf';
            (getSignedUrl as jest.Mock).mockResolvedValue('https://example.com/file');

            // Act
            const result = await storageService.getFileUrl(key);

            // Assert
            expect(result).toBeTruthy();
        });

        it('should handle special characters in file key', async () => {
            // Arrange
            const key = 'uploads/file-with-special_chars.123.pdf';
            (getSignedUrl as jest.Mock).mockResolvedValue('https://example.com/file');

            // Act
            const result = await storageService.getFileUrl(key);

            // Assert
            expect(result).toBeTruthy();
        });
    });

    describe('Integration Scenarios', () => {
        it('should upload and then get URL', async () => {
            // Arrange
            const mockFile = createMockFile();

            const uploadedKey = 'uploads/hash123.pdf';
            const signedUrl = 'https://s3.amazonaws.com/bucket/uploads/hash123.pdf?signed';

            (S3Client.prototype.send as jest.Mock) = jest
                .fn()
                .mockResolvedValueOnce({}) // Upload
                .mockResolvedValueOnce({ Body: Buffer.from('') }); // GetObject for signed URL
            (getSignedUrl as jest.Mock).mockResolvedValue(signedUrl);

            // Act
            const uploadResult = await storageService.upload(mockFile);
            const urlResult = await storageService.getFileUrl(uploadResult.key);

            // Assert
            expect(uploadResult).toHaveProperty('key');
            expect(urlResult).toBeTruthy();
        });

        it('should handle concurrent uploads', async () => {
            // Arrange
            const mockFile = createMockFile();

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act
            const results = await Promise.all([
                storageService.upload(mockFile),
                storageService.upload(mockFile),
                storageService.upload(mockFile),
            ]);

            // Assert
            expect(results).toHaveLength(3);
            expect(new Set(results.map((r) => r.key)).size).toBe(3); // All unique
        });
    });

    describe('Edge Cases', () => {
        it('should handle file with no extension', async () => {
            // Arrange
            const mockFile = createMockFile({
                originalname: 'filename-without-ext',
                filename: 'filename-without-ext',
            });

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act
            const result = await storageService.upload(mockFile);

            // Assert
            expect(result.key).toBeDefined();
            expect(result.key).toContain('uploads/');
        });

        it('should handle very large files', async () => {
            // Arrange
            const mockFile = createMockFile({
                originalname: 'large.iso',
                filename: 'large.iso',
                size: 500 * 1024 * 1024,
            });

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act
            const result = await storageService.upload(mockFile);

            // Assert
            expect(result.key).toBeDefined();
        });

        it('should handle files with multiple dots in name', async () => {
            // Arrange
            const mockFile = createMockFile({
                originalname: 'archive.tar.gz.backup.zip',
                filename: 'archive.tar.gz.backup.zip',
                mimetype: 'application/zip',
            });

            (S3Client.prototype.send as jest.Mock) = jest.fn().mockResolvedValue({});

            // Act
            const result = await storageService.upload(mockFile);

            // Assert
            expect(result.key).toContain('.zip');
        });
    });
});
