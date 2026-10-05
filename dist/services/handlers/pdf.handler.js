"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfHandler = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const pdf_parse_1 = require("pdf-parse");
const llm_service_1 = require("../llm/llm.service");
const rag_service_1 = require("../rag/rag.service");
const logger_1 = require("../../utils/logger");
class PdfHandler {
    static async process(buffer, sessionId, filename, orgId, userId) {
        let pdfData = null;
        try {
            const parser = new pdf_parse_1.PDFParse({ data: buffer });
            const textResult = await parser.getText();
            const infoResult = await parser.getInfo();
            pdfData = {
                text: textResult.text,
                numpages: infoResult.pages.length,
                info: infoResult,
            };
            await parser.destroy();
        }
        catch (_e) {
            /* ignore parse error and potentially fallback */
        }
        if (pdfData) {
            logger_1.logger.debug(`📄 Initial PDF Parse Success: ${pdfData.numpages} pages`);
        }
        else {
            logger_1.logger.warn(`⚠️ Initial PDF Parse failed, attempting Poppler fallback...`);
        }
        if (!pdfData || !pdfData.text || pdfData.text.trim().length === 0) {
            try {
                const text = await this.extractTextViaPoppler(buffer, filename);
                logger_1.logger.info(`text: ${text}`);
                if (text && text.length > 10) {
                    pdfData = {
                        text: text,
                        numpages: 1,
                        info: {},
                    };
                }
            }
            catch (_popplerErr) {
                /* ignore poppler error */
            }
        }
        let shouldUseVision = false;
        if (pdfData && pdfData.text && pdfData.text.trim().length > 0) {
            logger_1.logger.info(`✅ Successfully read PDF data (${pdfData.text.length} chars): ${pdfData.text.substring(0, 500)}...`);
            if (pdfData.text.length < 50) {
                shouldUseVision = true;
            }
            else {
                const hasVisualKeywords = /Figure|Chart|Table|Log|Graph/i.test(pdfData.text);
                const isSparseText = pdfData.text.length < pdfData.numpages * 100;
                shouldUseVision = isSparseText || hasVisualKeywords;
            }
        }
        else {
            shouldUseVision = true;
        }
        if (shouldUseVision) {
            try {
                return await this.parsePdfViaVision(buffer, sessionId, filename, orgId, userId);
            }
            catch (error) {
                if (pdfData && pdfData.text && pdfData.text.trim().length > 0) {
                    return await this.parseDigitalText(pdfData.text, sessionId, filename, orgId, userId);
                }
                else {
                    throw error;
                }
            }
        }
        else {
            // At this point, pdfData and pdfData.text are guaranteed due to line 44 check
            return await this.parseDigitalText(pdfData.text, sessionId, filename, orgId, userId);
        }
    }
    static async extractTextViaPoppler(buffer, filename) {
        const tempDir = path.resolve(__dirname, '../../../temp_pdf');
        if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, { recursive: true });
        const safeFilename = `poppler_${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const tempFilePath = path.join(tempDir, safeFilename);
        fs.writeFileSync(tempFilePath, buffer);
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)('pdftotext', ['-layout', tempFilePath, '-']);
            let output = '';
            child.stdout.on('data', (d) => (output += d));
            child.stderr.on('data', (d) => logger_1.logger.warn(`pdftotext stderr: ${d}`));
            child.on('error', (e) => reject(e));
            child.on('close', (code) => {
                this.safeDelete(tempFilePath);
                if (code === 0)
                    resolve(output);
                else
                    reject(new Error(`pdftotext exited with code ${code}`));
            });
        });
    }
    static async parseDigitalText(fullText, sessionId, filename, orgId, userId) {
        const chunks = fullText.split(/\n\s*\n/);
        let immediateContext = '';
        let backgroundContext = '';
        let wordCount = 0;
        for (const chunk of chunks) {
            const chunkLength = chunk.split(/\s+/).length;
            if (wordCount < 1500) {
                immediateContext += chunk + '\n\n';
                wordCount += chunkLength;
            }
            else {
                backgroundContext += chunk + '\n\n';
            }
        }
        if (backgroundContext.length > 0) {
            rag_service_1.ragService
                .addDocument(backgroundContext, {
                sessionId,
                filename,
                type: 'digital_overflow',
                page: 1,
                organization_id: orgId,
                userId,
            })
                .catch(() => {
                /* ignored */
            });
        }
        if (immediateContext.length > 0) {
            rag_service_1.ragService
                .addDocument(immediateContext, {
                sessionId,
                filename,
                type: 'digital_immediate',
                page: 1,
                organization_id: orgId,
                userId,
            })
                .catch((_e) => {
                /* ignored */
            });
        }
        return { textContent: immediateContext };
    }
    static async parsePdfViaVision(buffer, sessionId, filename, orgId, userId) {
        const tempDir = path.resolve(__dirname, '../../../temp_pdf');
        if (!fs.existsSync(tempDir))
            fs.mkdirSync(tempDir, { recursive: true });
        const safeFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const tempFilePath = path.join(tempDir, safeFilename);
        fs.writeFileSync(tempFilePath, buffer);
        try {
            const prefix = safeFilename.replace('.pdf', '');
            await this.convertPdfToImages(tempFilePath, tempDir, prefix);
            const files = fs
                .readdirSync(tempDir)
                .filter((f) => f.startsWith(prefix) && f.endsWith('.jpg'))
                .sort((a, b) => {
                const numA = parseInt(a.match(/-(\d+)\.jpg$/)?.[1] || '0');
                const numB = parseInt(b.match(/-(\d+)\.jpg$/)?.[1] || '0');
                return numA - numB;
            })
                .map((f) => path.join(tempDir, f));
            const UNIVERSAL_PROMPT = `
            Analyze this page as a Universal Data Expert. 
            1. Identify content type (Text, Table, Well Log, Seismic Graph, Diagram, Invoice, Equipment Photo, Site Photo).
            2. Extract ALL visible data.
               - Text: Transcribe verbatim.
               - Tables: Convert to strict Markdown.
               - Logs/Charts: Describe axes, units, trends, and key values (e.g. "Depth 9000ft: Pressure drops").
               - Flow/Components: Explain the connections and components in the diagram.
               - Photos: Describe the equipment condition, visible defects, or site context.
            Output structured Markdown.
            `;
            const immediateFiles = files.slice(0, 4);
            logger_1.logger.debug(`🚀 Processing first ${immediateFiles.length} pages in parallel...`);
            let successCount = 0;
            const pageResults = await Promise.all(immediateFiles.map(async (imgPath, index) => {
                try {
                    const base64 = fs.readFileSync(imgPath).toString('base64');
                    const { content: text } = await llm_service_1.llmService.vision(base64, UNIVERSAL_PROMPT);
                    await rag_service_1.ragService.addDocument(`[File: ${filename} | Page: ${index + 1} | Type: Visual]\n${text}`, {
                        sessionId,
                        filename,
                        page: index + 1,
                        type: 'visual_page',
                        organization_id: orgId,
                        userId,
                    });
                    successCount++;
                    if (text && text.length > 50) {
                        logger_1.logger.info(`✅ Vision Success Page ${index + 1}: Extracted ${text.length} chars`);
                    }
                    else {
                        logger_1.logger.warn(`⚠️ Vision Warning Page ${index + 1}: Extracted very little text (${text?.length || 0} chars)`);
                    }
                    return `\n--- PAGE ${index + 1} ---\n${text}\n`;
                }
                catch (error) {
                    logger_1.logger.error(`Error on Immediate Page ${index + 1}:`, error);
                    return `\n[Page ${index + 1} Failed to Process]\n`;
                }
                finally {
                    this.safeDelete(imgPath);
                }
            }));
            if (successCount === 0 && immediateFiles.length > 0) {
                throw new Error('Vision processing failed for all immediate pages');
            }
            let immediateText = pageResults.join('');
            if (files.length > 4) {
                this.processRemainingPagesInBackground(files.slice(4), sessionId, filename, UNIVERSAL_PROMPT, orgId, userId);
                immediateText += `\n\n[System: The remaining ${files.length - 4} pages are being processed in the background...]`;
            }
            return { textContent: immediateText };
        }
        catch (error) {
            try {
                const prefix = safeFilename.replace('.pdf', '');
                const lingeringFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith(prefix));
                lingeringFiles.forEach((f) => this.safeDelete(path.join(tempDir, f)));
            }
            catch (_cleanupError) {
                /* ignore cleanup error */
            }
            throw error;
        }
        finally {
            this.safeDelete(tempFilePath);
        }
    }
    static async processRemainingPagesInBackground(imagePaths, sessionId, filename, prompt, orgId, userId) {
        setImmediate(async () => {
            const CONCURRENCY = 3;
            for (let i = 0; i < imagePaths.length; i += CONCURRENCY) {
                const batch = imagePaths.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(async (imgPath, batchIndex) => {
                    const globalIndex = i + batchIndex;
                    try {
                        const pageNum = globalIndex + 5;
                        const base64 = fs.readFileSync(imgPath).toString('base64');
                        const { content: text } = await llm_service_1.llmService.vision(base64, prompt);
                        const fullText = `[File: ${filename} | Page: ${pageNum} | Type: Visual]\n${text}`;
                        await rag_service_1.ragService.addDocument(fullText, {
                            sessionId,
                            filename,
                            page: pageNum,
                            type: 'visual_page',
                            organization_id: orgId,
                            userId,
                        });
                    }
                    catch (_e) {
                        /* ignore background page error */
                    }
                    finally {
                        this.safeDelete(imgPath);
                    }
                }));
                if (i + CONCURRENCY < imagePaths.length) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        });
    }
    static async convertPdfToImages(pdfPath, outputDir, outputPrefix) {
        return new Promise((resolve, reject) => {
            const outputPath = path.join(outputDir, outputPrefix);
            const child = (0, child_process_1.spawn)('pdftoppm', ['-jpeg', '-r', '150', pdfPath, outputPath]);
            let stderrData = '';
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    stderrData += data.toString();
                });
            }
            child.on('close', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`pdftoppm exited with code ${code}. Output: ${stderrData}`));
            });
            child.on('error', (error) => {
                if (error.code === 'ENOENT') {
                    reject(new Error('pdftoppm not found. Please install poppler-utils (sudo apt-get install poppler-utils)'));
                }
                else {
                    reject(error);
                }
            });
        });
    }
    static safeDelete(filePath) {
        try {
            if (fs.existsSync(filePath))
                fs.unlinkSync(filePath);
        }
        catch (_e) {
            /* ignore delete error */
        }
    }
}
exports.PdfHandler = PdfHandler;
