"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocxHandler = void 0;
const mammoth_1 = __importDefault(require("mammoth"));
const logger_1 = require("../../utils/logger");
class DocxHandler {
    static async process(buffer) {
        try {
            const result = await mammoth_1.default.extractRawText({ buffer: buffer });
            if (result.messages && result.messages.length > 0) {
                logger_1.logger.debug('DOCX Processing Messages:', result.messages);
            }
            return result.value;
        }
        catch (error) {
            const err = error;
            logger_1.logger.error('Error processing DOCX:', err);
            throw new Error(`Failed to process DOCX: ${err.message}`);
        }
    }
}
exports.DocxHandler = DocxHandler;
