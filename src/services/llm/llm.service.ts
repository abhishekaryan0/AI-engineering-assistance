import OpenAI from 'openai';
import { env } from '../../config/config';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

const CLIENT_TIMEOUT_MS = 180000;
const client = new OpenAI({
  baseURL: env.OPENROUTER_BASE,
  apiKey: env.OPENROUTER_API_KEY,
  timeout: CLIENT_TIMEOUT_MS,
});

export const llmService = {
  /**
   * Generate Embeddings for RAG
   */

  embed: async (
    text: string
  ): Promise<{
    embedding: number[];
    usage: OpenAI.Embeddings.CreateEmbeddingResponse.Usage | undefined;
  }> => {
    return withRetry(async () => {
      try {
        const response = await client.embeddings.create({
          model: env.AI_MODEL_EMBEDDING,
          input: text,
          encoding_format: 'float',
        });

        return {
          embedding: response.data[0].embedding,
          usage: response.usage,
        };
      } catch (error) {
        logger.error(`LLM Embedding Error: ${error}`);
        throw error;
      }
    });
  },

  atRiskAssistantChat: async (
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    model?: string,
    temperature = 0.3
  ): Promise<{ content: string; usage: OpenAI.CompletionUsage | undefined }> => {
    return withRetry(async () => {
      try {
        const isO1Model = model?.includes('o1-') || env.AI_MODEL_NAME.includes('o1-');

        const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
          model: model || env.AI_MODEL_NAME,
          messages: messages,
        };

        if (!isO1Model) {
          params.temperature = temperature;
        }

        const response = await client.chat.completions.create(params);

        let content = response.choices[0].message.content || '';

        if (content.includes('<think>')) {
          content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }

        return {
          content: content,
          usage: response.usage,
        };
      } catch (error) {
        logger.error(`LLM Chat Error: ${error}`);
        throw error;
      }
    });
  },

  // testchat: async (
  //   messages: OpenAI.Chat.ChatCompletionMessageParam[],
  //   model?: string,
  //   temperature = 0.3
  // ): Promise<{ content: string; usage: OpenAI.CompletionUsage | undefined }> => {
  //   return withRetry(async () => {
  //     try {
  //       const selectedModel = model || env.AI_MODEL_NAME;

  //       const isReasoningModel = selectedModel.includes('o1') || selectedModel.includes('o3');

  //       const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
  //         model: selectedModel,
  //         messages,
  //       };

  //       if (!isReasoningModel) {
  //         params.temperature = temperature;
  //       }

  //       const response = await client.chat.completions.create(params);

  //       let content = response?.choices?.[0]?.message?.content ?? '';

  //       if (content.includes('<think>')) {
  //         content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  //       }

  //       content = content.replace(/\n{3,}/g, '\n\n').trim();

  //       return {
  //         content,
  //         usage: response.usage,
  //       };
  //     } catch (error: unknown) {
  //       const err = error as Error & { message?: string };
  //       logger.error('❌ LLM Chat Error:', err?.message || String(error));
  //       throw error;
  //     }
  //   });
  // },

  /**
   * General Chat Completion
   */

  chat: async (
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    model?: string,
    temperature = 0.3
  ): Promise<{
    content: string;
    usage: OpenAI.CompletionUsage | undefined;
    citations?: string[];
  }> => {
    return withRetry(async () => {
      try {
        const isO1Model = model?.includes('o1-') || env.AI_MODEL_NAME.includes('o1-');

        const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
          model: model || env.AI_MODEL_NAME,
          messages: messages,
        };

        if (!isO1Model) {
          params.temperature = temperature;
        }

        const response = await client.chat.completions.create(params);

        const anyResponse = response as any;
        const citations = anyResponse.citations || anyResponse.choices?.[0]?.citations || undefined;

        let content = response.choices[0].message.content || '';

        if (content.includes('<think>')) {
          content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }

        return {
          content: content,
          usage: response.usage,
          citations: citations as string[] | undefined,
        };
      } catch (error) {
        logger.error(`LLM Chat Error: ${error}`);
        throw error;
      }
    });
  },

  /**
   * Stream Chat Completion
   */

  chatStream: async (
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    model?: string,
    temperature = 0.3
  ): Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>> => {
    return withRetry(async () => {
      try {
        const stream = await client.chat.completions.create({
          model: model || env.AI_MODEL_NAME,
          messages: messages,
          temperature: temperature,
          stream: true,
        });

        return stream as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
      } catch (error) {
        logger.error(`LLM Chat Stream Error: ${error}`);
        throw error;
      }
    });
  },

  /**
   * Structured JSON Output (Good for Routing/Decisions)
   */

  chatJson: async (
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    model?: string,
    temperature = 0.7
  ): Promise<{ content: Record<string, unknown>; usage: OpenAI.CompletionUsage | undefined }> => {
    return withRetry(async () => {
      try {
        const response = await client.chat.completions.create({
          model: model || env.AI_MODEL_DECISION,
          messages: messages,
          temperature: temperature,
          response_format: { type: 'json_object' },
        });
        let content = response.choices[0].message.content || '{}';
        if (content.includes('<think>')) {
          content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }

        return {
          content: JSON.parse(content),
          usage: response.usage,
        };
      } catch (error) {
        logger.error(`LLM JSON Error: ${error}`);
        throw error;
      }
    });
  },

  /**
   * Vision / Image Analysis
   */

  vision: async (
    base64: string,
    prompt: string
  ): Promise<{ content: string; usage: OpenAI.CompletionUsage | undefined }> => {
    return withRetry(async () => {
      try {
        const response = await client.chat.completions.create({
          model: env.AI_MODEL_VISION,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              ],
            },
          ],
        });

        if (!response.choices || response.choices.length === 0) {
          logger.warn('⚠️ LLM Vision returned no choices.');
          return { content: '', usage: undefined };
        }

        return {
          content: response.choices[0]?.message?.content || '',
          usage: response.usage,
        };
      } catch (error) {
        logger.error(`LLM Vision Error: ${error}`);
        throw error;
      }
    });
  },
};

async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 2000
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    const err = error as Error & { message?: string };
    try {
      logger.error('🔍 LLM Raw Error DEBUG:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    } catch (_logErr) {
      logger.error('🔍 LLM Raw Error (Stringify Failed):', err);
    }

    if (retries > 0 && isRetryableError(err)) {
      logger.warn(
        `⚠️ LLM Service Error: ${err.message}. Retrying in ${delay / 1000}s... (${retries} attempts left)`
      );
      await new Promise((res) => setTimeout(res, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }

    handleOpenAIError(error);
    throw error; // Fallback if handleOpenAIError doesn't throw (it should)
  }
}

function handleOpenAIError(error: unknown): void {
  const err = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
    error?: { code?: string };
  };
  const status = err.status || err.statusCode;
  const code = err.code || err.error?.code;
  const message = err.message || 'Unknown LLM Error';

  if (typeof status === 'number') {
    if (status === 401) {
      logger.error('❌ Critical: OpenAI/OpenRouter API Key is invalid or expired.');
      throw new AppError(
        'AI Service Configuration Error: Invalid API Key. Please contact support.',
        500
      );
    }

    if (status === 429) {
      if (code === 'insufficient_quota' || message.includes('quota')) {
        logger.error('❌ Critical: OpenAI/OpenRouter Quota Exceeded.');
        throw new AppError(
          'AI Usage Limit Reached. The system is currently out of credits. Please try again later.',
          429
        );
      }
      logger.warn('⚠️ Rate Limit Hit.');
      throw new AppError('System busy. Please try again in a moment.', 429);
    }

    if (
      status === 400 &&
      (code === 'context_length_exceeded' || message.includes('maximum context length'))
    ) {
      logger.warn('⚠️ Context Length Exceeded.');
      throw new AppError(
        'The conversation or file is too long for the AI to process. Please try a shorter prompt or smaller file.',
        400
      );
    }

    if (status >= 500) {
      logger.error(`❌ AI Provider Error: ${message}`);
      throw new AppError('AI Service is temporarily unavailable. Please try again later.', 502);
    }
  }

  throw error;
}

function isRetryableError(error: unknown): boolean {
  const err = error as {
    code?: string;
    cause?: { code?: string };
    status?: number;
    statusCode?: number;
    message?: string;
  };
  const code = err.code || err.cause?.code;
  const status = err.status || err.statusCode;

  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ERR_STREAM_PREMATURE_CLOSE')
    return true;

  if (typeof status === 'number') {
    if (status === 429) {
      const isQuota = err.code === 'insufficient_quota' || err.message?.includes('quota');
      return !isQuota; // Retry only if it's NOT a quota issue
    }

    if (status >= 500 && status < 600) return true;
  }

  return false;
}
