"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmService = void 0;
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../../config/config");
const AppError_1 = require("../../utils/AppError");
const logger_1 = require("../../utils/logger");
const CLIENT_TIMEOUT_MS = 180000;
const client = new openai_1.default({
    baseURL: config_1.env.OPENROUTER_BASE,
    apiKey: config_1.env.OPENROUTER_API_KEY,
    timeout: CLIENT_TIMEOUT_MS,
});
exports.llmService = {
    /**
     * Generate Embeddings for RAG
     */
    embed: async (text) => {
        return withRetry(async () => {
            try {
                const response = await client.embeddings.create({
                    model: config_1.env.AI_MODEL_EMBEDDING,
                    input: text,
                    encoding_format: 'float',
                });
                return {
                    embedding: response.data[0].embedding,
                    usage: response.usage,
                };
            }
            catch (error) {
                logger_1.logger.error(`LLM Embedding Error: ${error}`);
                throw error;
            }
        });
    },
    atRiskAssistantChat: async (messages, model, temperature = 0.3) => {
        return withRetry(async () => {
            try {
                const isO1Model = model?.includes('o1-') || config_1.env.AI_MODEL_NAME.includes('o1-');
                const params = {
                    model: model || config_1.env.AI_MODEL_NAME,
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
            }
            catch (error) {
                logger_1.logger.error(`LLM Chat Error: ${error}`);
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
    chat: async (messages, model, temperature = 0.3) => {
        return withRetry(async () => {
            try {
                const isO1Model = model?.includes('o1-') || config_1.env.AI_MODEL_NAME.includes('o1-');
                const params = {
                    model: model || config_1.env.AI_MODEL_NAME,
                    messages: messages,
                };
                if (!isO1Model) {
                    params.temperature = temperature;
                }
                const response = await client.chat.completions.create(params);
                const anyResponse = response;
                const citations = anyResponse.citations || anyResponse.choices?.[0]?.citations || undefined;
                let content = response.choices[0].message.content || '';
                if (content.includes('<think>')) {
                    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                }
                return {
                    content: content,
                    usage: response.usage,
                    citations: citations,
                };
            }
            catch (error) {
                logger_1.logger.error(`LLM Chat Error: ${error}`);
                throw error;
            }
        });
    },
    /**
     * Stream Chat Completion
     */
    chatStream: async (messages, model, temperature = 0.3) => {
        return withRetry(async () => {
            try {
                const stream = await client.chat.completions.create({
                    model: model || config_1.env.AI_MODEL_NAME,
                    messages: messages,
                    temperature: temperature,
                    stream: true,
                });
                return stream;
            }
            catch (error) {
                logger_1.logger.error(`LLM Chat Stream Error: ${error}`);
                throw error;
            }
        });
    },
    /**
     * Structured JSON Output (Good for Routing/Decisions)
     */
    chatJson: async (messages, model, temperature = 0.7) => {
        return withRetry(async () => {
            try {
                const response = await client.chat.completions.create({
                    model: model || config_1.env.AI_MODEL_DECISION,
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
            }
            catch (error) {
                logger_1.logger.error(`LLM JSON Error: ${error}`);
                throw error;
            }
        });
    },
    /**
     * Vision / Image Analysis
     */
    vision: async (base64, prompt) => {
        return withRetry(async () => {
            try {
                const response = await client.chat.completions.create({
                    model: config_1.env.AI_MODEL_VISION,
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
                    logger_1.logger.warn('⚠️ LLM Vision returned no choices.');
                    return { content: '', usage: undefined };
                }
                return {
                    content: response.choices[0]?.message?.content || '',
                    usage: response.usage,
                };
            }
            catch (error) {
                logger_1.logger.error(`LLM Vision Error: ${error}`);
                throw error;
            }
        });
    },
};
async function withRetry(operation, retries = 3, delay = 2000) {
    try {
        return await operation();
    }
    catch (error) {
        const err = error;
        try {
            logger_1.logger.error('🔍 LLM Raw Error DEBUG:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        }
        catch (_logErr) {
            logger_1.logger.error('🔍 LLM Raw Error (Stringify Failed):', err);
        }
        if (retries > 0 && isRetryableError(err)) {
            logger_1.logger.warn(`⚠️ LLM Service Error: ${err.message}. Retrying in ${delay / 1000}s... (${retries} attempts left)`);
            await new Promise((res) => setTimeout(res, delay));
            return withRetry(operation, retries - 1, delay * 2);
        }
        handleOpenAIError(error);
        throw error; // Fallback if handleOpenAIError doesn't throw (it should)
    }
}
function handleOpenAIError(error) {
    const err = error;
    const status = err.status || err.statusCode;
    const code = err.code || err.error?.code;
    const message = err.message || 'Unknown LLM Error';
    if (typeof status === 'number') {
        if (status === 401) {
            logger_1.logger.error('❌ Critical: OpenAI/OpenRouter API Key is invalid or expired.');
            throw new AppError_1.AppError('AI Service Configuration Error: Invalid API Key. Please contact support.', 500);
        }
        if (status === 429) {
            if (code === 'insufficient_quota' || message.includes('quota')) {
                logger_1.logger.error('❌ Critical: OpenAI/OpenRouter Quota Exceeded.');
                throw new AppError_1.AppError('AI Usage Limit Reached. The system is currently out of credits. Please try again later.', 429);
            }
            logger_1.logger.warn('⚠️ Rate Limit Hit.');
            throw new AppError_1.AppError('System busy. Please try again in a moment.', 429);
        }
        if (status === 400 &&
            (code === 'context_length_exceeded' || message.includes('maximum context length'))) {
            logger_1.logger.warn('⚠️ Context Length Exceeded.');
            throw new AppError_1.AppError('The conversation or file is too long for the AI to process. Please try a shorter prompt or smaller file.', 400);
        }
        if (status >= 500) {
            logger_1.logger.error(`❌ AI Provider Error: ${message}`);
            throw new AppError_1.AppError('AI Service is temporarily unavailable. Please try again later.', 502);
        }
    }
    throw error;
}
function isRetryableError(error) {
    const err = error;
    const code = err.code || err.cause?.code;
    const status = err.status || err.statusCode;
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ERR_STREAM_PREMATURE_CLOSE')
        return true;
    if (typeof status === 'number') {
        if (status === 429) {
            const isQuota = err.code === 'insufficient_quota' || err.message?.includes('quota');
            return !isQuota; // Retry only if it's NOT a quota issue
        }
        if (status >= 500 && status < 600)
            return true;
    }
    return false;
}
