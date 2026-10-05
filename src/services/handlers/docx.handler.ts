import mammoth from 'mammoth';
import { logger } from '../../utils/logger';

export class DocxHandler {
  static async process(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer: buffer });
      if (result.messages && result.messages.length > 0) {
        logger.debug('DOCX Processing Messages:', result.messages);
      }
      return result.value;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error processing DOCX:', err);
      throw new Error(`Failed to process DOCX: ${err.message}`);
    }
  }
}
