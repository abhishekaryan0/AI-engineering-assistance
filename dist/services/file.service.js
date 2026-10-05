"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileService = void 0;
const storage_service_1 = require("./storage.service");
// import OpenAI from 'openai';
const pdf_handler_1 = require("./handlers/pdf.handler");
const rag_service_1 = require("./rag/rag.service");
const spreadsheet_handler_1 = require("./handlers/spreadsheet.handler");
const image_handler_1 = require("./handlers/image.handler");
const text_handler_1 = require("./handlers/text.handler");
const docx_handler_1 = require("./handlers/docx.handler");
const logger_1 = require("../utils/logger");
exports.fileService = {
    processAndUpload: async (file, sessionId, orgId, userId) => {
        const uploadPromise = storage_service_1.storageService.upload(file, 'uploads', orgId, userId);
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
                    const result = await pdf_handler_1.PdfHandler.process(file.buffer, sessionId, file.originalname, orgId, userId);
                    textContent = result.textContent;
                    // usage = result.usage;
                    processingStatus = {
                        success: true,
                        fileType: 'pdf',
                        message: '✅ PDF processed successfully',
                    };
                }
                catch (pdfError) {
                    const err = pdfError;
                    logger_1.logger.error(`⚠️ PDF Processing Error: ${err.message}`);
                    processingStatus = {
                        success: false,
                        fileType: 'pdf',
                        message: `⚠️ PDF processing partially failed: ${err.message}`,
                    };
                    textContent = `[PDF Processing Status: ${err.message}]`;
                }
            }
            else if (mime.startsWith('image/') || file.originalname.match(/\.(tif|tiff)$/i)) {
                try {
                    const result = await image_handler_1.ImageHandler.process(file.buffer, sessionId, file.originalname);
                    textContent = result.textContent;
                    // usage = result.usage;
                    processingStatus = {
                        success: true,
                        fileType: 'image',
                        message: '✅ Image processed successfully',
                    };
                }
                catch (imgError) {
                    const err = imgError;
                    logger_1.logger.error(`⚠️ Image Processing Error: ${err.message}`);
                    processingStatus = {
                        success: false,
                        fileType: 'image',
                        message: `⚠️ Image processing failed: ${err.message}`,
                    };
                }
            }
            else if (file.originalname.match(/\.las$/i)) {
                textContent = text_handler_1.TextHandler.process(file.buffer, 'text/plain');
                processingStatus = {
                    success: true,
                    fileType: 'las',
                    message: '✅ LAS Log file processed successfully',
                };
            }
            else if (mime.includes('spreadsheet') ||
                mime.includes('excel') ||
                file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
                textContent = spreadsheet_handler_1.SpreadsheetHandler.process(file.buffer, sessionId, file.originalname);
                processingStatus = {
                    success: true,
                    fileType: 'spreadsheet',
                    message: '✅ Spreadsheet processed successfully',
                };
            }
            else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                file.originalname.match(/\.docx$/i)) {
                try {
                    textContent = await docx_handler_1.DocxHandler.process(file.buffer);
                    processingStatus = {
                        success: true,
                        fileType: 'docx',
                        message: '✅ DOCX processed successfully',
                    };
                }
                catch (docxError) {
                    const err = docxError;
                    logger_1.logger.error(`⚠️ DOCX Processing Error: ${err.message}`);
                    processingStatus = {
                        success: false,
                        fileType: 'docx',
                        message: `⚠️ DOCX processing failed: ${err.message}`,
                    };
                }
            }
            else {
                textContent = text_handler_1.TextHandler.process(file.buffer, mime);
                processingStatus = {
                    success: true,
                    fileType: 'text',
                    message: '✅ File processed successfully',
                };
            }
        }
        catch (error) {
            const err = error;
            logger_1.logger.error(`Error processing file ${file.originalname}: ${err.message}`);
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
                await rag_service_1.ragService.addDocument(finalContent, {
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
        const url = (await storage_service_1.storageService.getFileUrl(key)) || '';
        return {
            s3Key: key,
            s3Url: url,
            textContent: finalContent,
            // usage,
            processingStatus,
        };
    },
};
