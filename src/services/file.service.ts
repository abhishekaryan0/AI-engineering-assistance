import { storageService } from './storage.service';
// import OpenAI from 'openai';
import { PdfHandler } from './handlers/pdf.handler';
import { ragService } from './rag/rag.service';
import { SpreadsheetHandler } from './handlers/spreadsheet.handler';
import { ImageHandler } from './handlers/image.handler';
import { TextHandler } from './handlers/text.handler';
import { DocxHandler } from './handlers/docx.handler';
import { logger } from '../utils/logger';

interface ProcessingResult {
  s3Key: string;
  s3Url: string;
  textContent: string;
  // usage: OpenAI.CompletionUsage | Record<string, number> | undefined;
  processingStatus: {
    success: boolean;
    fileType: string;
    message: string;
  };
}

export const fileService = {
  processAndUpload: async (
    file: Express.Multer.File,
    sessionId: string,
    orgId?: string,
    userId?: string
  ): Promise<ProcessingResult> => {
    const uploadPromise = storageService.upload(file, 'uploads', orgId, userId);

    let textContent = '';

    // let usage: OpenAI.CompletionUsage | Record<string, number> | undefined = undefined;
    let processingStatus = {
      success: true,
      fileType: '',
      message: '',
    };
    const mime = file.mimetype.toLowerCase();

    try {
      if (mime === 'application/pdf') {
        try {
          const result = await PdfHandler.process(
            file.buffer,
            sessionId,
            file.originalname,
            orgId,
            userId
          );
          textContent = result.textContent;
          // usage = result.usage;
          processingStatus = {
            success: true,
            fileType: 'pdf',
            message: '✅ PDF processed successfully',
          };
        } catch (pdfError: unknown) {
          const err = pdfError as Error;
          logger.error(`⚠️ PDF Processing Error: ${err.message}`);
          processingStatus = {
            success: false,
            fileType: 'pdf',
            message: `⚠️ PDF processing partially failed: ${err.message}`,
          };
          textContent = `[PDF Processing Status: ${err.message}]`;
        }
      } else if (mime.startsWith('image/') || file.originalname.match(/\.(tif|tiff)$/i)) {
        try {
          const result = await ImageHandler.process(file.buffer, sessionId, file.originalname);
          textContent = result.textContent;
          // usage = result.usage;
          processingStatus = {
            success: true,
            fileType: 'image',
            message: '✅ Image processed successfully',
          };
        } catch (imgError: unknown) {
          const err = imgError as Error;
          logger.error(`⚠️ Image Processing Error: ${err.message}`);
          processingStatus = {
            success: false,
            fileType: 'image',
            message: `⚠️ Image processing failed: ${err.message}`,
          };
        }
      } else if (file.originalname.match(/\.las$/i)) {
        textContent = TextHandler.process(file.buffer, 'text/plain');
        processingStatus = {
          success: true,
          fileType: 'las',
          message: '✅ LAS Log file processed successfully',
        };
      } else if (
        mime.includes('spreadsheet') ||
        mime.includes('excel') ||
        file.originalname.match(/\.(xlsx|xls|csv)$/i)
      ) {
        textContent = SpreadsheetHandler.process(file.buffer, sessionId, file.originalname);
        processingStatus = {
          success: true,
          fileType: 'spreadsheet',
          message: '✅ Spreadsheet processed successfully',
        };
      } else if (
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.originalname.match(/\.docx$/i)
      ) {
        try {
          textContent = await DocxHandler.process(file.buffer);
          processingStatus = {
            success: true,
            fileType: 'docx',
            message: '✅ DOCX processed successfully',
          };
        } catch (docxError: unknown) {
          const err = docxError as Error;
          logger.error(`⚠️ DOCX Processing Error: ${err.message}`);
          processingStatus = {
            success: false,
            fileType: 'docx',
            message: `⚠️ DOCX processing failed: ${err.message}`,
          };
        }
      } else {
        textContent = TextHandler.process(file.buffer, mime);
        processingStatus = {
          success: true,
          fileType: 'text',
          message: '✅ File processed successfully',
        };
      }
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error processing file ${file.originalname}: ${err.message}`);
      processingStatus = {
        success: false,
        fileType: mime || 'unknown',
        message: `⚠️ File processing encountered an error: ${err.message}`,
      };
      textContent = '';
    }

    const finalContent = textContent || '';

    const vectorizationPromise = (async () => {
      if (finalContent.length > 0 && mime !== 'application/pdf') {
        await ragService.addDocument(finalContent, {
          sessionId,
          filename: file.originalname,
          type: 'file_upload',
          page: 1,
          organization_id: orgId,
          userId,
        });
      }
    })();

    const [{ key }] = await Promise.all([uploadPromise, vectorizationPromise]);
    const url = (await storageService.getFileUrl(key)) || '';

    return {
      s3Key: key,
      s3Url: url,
      textContent: finalContent,
      // usage,
      processingStatus,
    };
  },
};
