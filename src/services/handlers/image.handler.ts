import { llmService } from '../llm/llm.service';
import sharp from 'sharp';
import { logger } from '../../utils/logger';
import OpenAI from 'openai';

export class ImageHandler {
  static async process(
    buffer: Buffer,
    sessionId: string,
    filename: string
  ): Promise<{ textContent: string; usage: OpenAI.CompletionUsage | undefined }> {
    try {
      const jpegBuffer = await sharp(buffer)
        .resize({ width: 2048, height: 8192, fit: 'inside', withoutEnlargement: true })
        .toFormat('jpeg', { quality: 80 })
        .toBuffer();

      logger.debug(`[ImageHandler] Converted image size: ${jpegBuffer.length} bytes`);

      const base64 = jpegBuffer.toString('base64');

      const prompt = `
            Analyze this image comprehensively as an Expert Engineering Assistant in Oil, Gas, and Water management.
            
            **Context:**
            - **Filename:** "${filename}" (Use to assist identification).

            **Strictly Structure Your Response as Follows:**

            1. **📄 File Overview**
               - **File Name**: "${filename}"
               - **File Type**: Identify format (e.g., "Well Log", "Lab Report", "Table", "Field Photo").

            2. **📝 Content Extraction (CRITICAL)**
               - **If it is a Table or Report**: EXTRACT the key rows, headers, and values into a Markdown table. Capture specific chemical names, percentages, and metrics (e.g., Paraffin, Iron Sulfide, pH, Salinity).
               - **If it is a Well Log**: Identify Curves, Depths, and Headers.
               - **Key Entities**: List specific substances, well names, or equipment found.

            3. **🛢️ Technical Identification**
               - **Log/Report Type**: Specific type (e.g., "Solids Analysis", "Cement Bond Log", "Water Quality Report").
               - **Context**: (e.g., "Production issue", "Routine sampling").

            4. **📊 Analysis/Trends**
               - Describe values, trends, or anomalies visible in the image.
            
            5. **✅ Summary**
               - Professional summary of the file's content and utility.

            **Rule:** If text/numbers are clear, EXTRACT them verbatim. If blurry, state "Not legible".
            `;

      const { content, usage } = await llmService.vision(base64, prompt);
      logger.debug('content', content);

      if (!content) {
        logger.warn('[ImageHandler] Received empty content from LLM Vision.');
        return {
          textContent:
            '[Error: The image could not be analyzed by the AI model. It may be too complex or the service is temporarily unavailable.]',
          usage: undefined,
        };
      }

      return { textContent: content, usage };
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Image Processing Error:', err);
      throw new Error(`Failed to process image: ${err.message}`);
    }
  }
}
