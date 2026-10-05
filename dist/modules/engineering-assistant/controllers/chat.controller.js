"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const db_1 = require("../../../config/db");
const file_service_1 = require("../../../services/file.service");
const llm_service_1 = require("../../../services/llm/llm.service");
const agent_service_1 = require("../services/core/agent.service");
const prompt_service_1 = require("../../../services/prompt.service");
const text_utils_1 = require("../../../utils/text.utils");
const chat_service_1 = require("../../../services/chat.service");
const chat_validator_1 = require("../../../validators/chat.validator");
const glossary_1 = require("../../glossary");
const response_postprocessor_1 = require("../../../services/utils/response.postprocessor");
const suggestion_service_1 = require("../services/quality/suggestion.service");
const logger_1 = require("../../../utils/logger");
// import OpenAI from 'openai';
const intent_classifier_service_1 = require("../services/core/intent-classifier.service");
const factuality_checker_service_1 = require("../services/quality/factuality-checker.service");
const user_behavior_service_1 = require("../services/personalization/user-behavior.service");
const user_personalization_service_1 = require("../services/personalization/user-personalization.service");
exports.ChatController = {
    async sendMessage(req, res, _next) {
        let body;
        let promptText = '';
        let settingsJSON;
        let sessionId;
        let uploadedFile = null;
        let chartData = null;
        let orgId;
        try {
            body = chat_validator_1.AgentRequestSchema.parse(req.body);
            const file = req.file;
            promptText =
                body.promptText || (file ? `Analyze uploaded file: ${file.originalname}` : 'Start chat');
            settingsJSON = body.settings;
            sessionId = body.sessionId;
            const user = req.user;
            const userId = user?.id;
            orgId = user?.organization_id;
            if (!userId || !orgId) {
                throw new Error('User ID and Organization ID are required');
            }
            const settingsObj = settingsJSON ? JSON.parse(settingsJSON) : undefined;
            if (sessionId) {
                const existingSession = await db_1.prisma.chat_sessions.findFirst({
                    where: { id: sessionId, organization_id: orgId },
                });
                if (!existingSession) {
                    sessionId = undefined;
                }
            }
            if (!sessionId) {
                const newSession = await db_1.prisma.chat_sessions.create({
                    data: {
                        title: promptText.slice(0, 30),
                        userId: userId,
                        organization_id: orgId,
                        updatedAt: new Date(),
                    },
                });
                sessionId = newSession.id;
            }
            // Ensure sessionId is treated as string for subsequent calls
            const activeSessionId = sessionId;
            let fileContext = '';
            if (file) {
                const result = await file_service_1.fileService.processAndUpload(file, activeSessionId, orgId, userId);
                fileContext = result.textContent || '';
                if (fileContext.length < 100)
                    logger_1.logger.debug(`📂 Context Preview: ${fileContext}`);
                uploadedFile = {
                    ...result,
                    filename: file.originalname,
                    mimeType: file.mimetype,
                    textContent: fileContext,
                };
            }
            else {
                const lastFileContent = await chat_service_1.chatService.getLastFileContent(activeSessionId);
                if (lastFileContent) {
                    fileContext = lastFileContent;
                }
            }
            const prevMessages = await chat_service_1.chatService.getChatHistory(activeSessionId, orgId);
            const glossaryTerms = glossary_1.glossaryService.findTerms(promptText);
            logger_1.logger.info(`glossaryTerms: ${glossaryTerms}`);
            // NEW: Background check for multi-intent queries (Fire and forget, to prevent blocking the user response)
            intent_classifier_service_1.intentClassifierService
                .decomposeQuery(promptText)
                .then((decomposedQuery) => {
                if (decomposedQuery.isComposite) {
                    logger_1.logger.info(`🔀 Multi-intent query detected: ${decomposedQuery.reasoning}`);
                }
            })
                .catch((err) => {
                logger_1.logger.debug(`ℹ️ Multi-intent check failed in background: ${err}`);
            });
            const agentOutput = await agent_service_1.agentService.handleUserMessage({
                promptText,
                sessionId: activeSessionId,
                fileContext,
                researchMode: body.researchMode,
                chatHistory: prevMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                glossaryTerms,
                organizationId: orgId,
                userId,
            });
            if (agentOutput.directResponse) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                const finalResponse = agentOutput.directResponse;
                res.write(`data: ${JSON.stringify({ token: finalResponse })}\n\n`);
                await chat_service_1.chatService.saveTransaction(activeSessionId, promptText, finalResponse, uploadedFile, null, orgId);
                res.write(`data: ${JSON.stringify({
                    end: true,
                    sessionId,
                    chartData: null,
                    response: finalResponse,
                    suggestions: [],
                })}\n\n`);
                res.end();
                return;
            }
            const history = prevMessages.map((m) => ({
                role: m.role,
                content: m.content,
            }));
            let contextWithGlossary = agentOutput.context;
            if (glossaryTerms.length > 0) {
                contextWithGlossary += `\n\n--- GLOSSARY TERMS ---\n${glossaryTerms.join('\n\n')}\n--------------------------\n`;
            }
            const originalSystemPrompt = agentOutput.systemPrompt || 'You are a helpful AI Assistant.';
            const combinedSystemPrompt = originalSystemPrompt;
            const formattedMessages = (0, prompt_service_1.buildEngineeringPrompt)({
                promptText,
                ragContext: contextWithGlossary || '',
                history,
                settings: settingsObj,
                overrideSystemPrompt: combinedSystemPrompt,
            });
            const isWebSearch = agentOutput.derivedMode?.isWeb ||
                (body.researchMode && body.researchMode.includes('web_search'));
            const isDeepThinking = agentOutput.derivedMode?.isDeep ||
                (body.researchMode && body.researchMode.includes('deep_thinking'));
            let fullAiResponse = '';
            let suggestions = [];
            let buffer = '';
            let citations;
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            // We'll run the suggestion engine AFTER the LLM streaming completes so it can use the final response and history.
            if (isWebSearch || isDeepThinking) {
                const response = await llm_service_1.llmService.chat(formattedMessages, agentOutput.model);
                const rawContent = response.content;
                citations = response.citations; // Capture citations from Perplexity/Search models
                const processed = (0, text_utils_1.processAIResponse)(rawContent);
                fullAiResponse = processed.response;
                chartData = processed.chartData;
                res.write(`data: ${JSON.stringify({ token: fullAiResponse })}\n\n`);
            }
            else {
                const streamIterator = await llm_service_1.llmService.chatStream(formattedMessages, agentOutput.model);
                for await (const chunk of streamIterator) {
                    const token = chunk.choices[0]?.delta?.content || '';
                    if (token) {
                        fullAiResponse += token;
                        res.write(`data: ${JSON.stringify({ token })}\n\n`);
                    }
                }
            }
            let finalResponse = fullAiResponse;
            if (!chartData) {
                // Universal Chart support:
                // Always attempt to parse chart data from the response, regardless of intent.
                // This allows 'smart_action', 'research' or even 'chat' to return charts if the model decides to.
                const processed = (0, text_utils_1.processAIResponse)(fullAiResponse);
                finalResponse = processed.response;
                chartData = processed.chartData;
            }
            else {
                finalResponse = (0, text_utils_1.processAIResponse)(fullAiResponse).response;
            }
            // NEW: Check factuality of response against RAG sources
            let factualityCheck = null;
            // NEW: Check factuality of response against RAG sources (Async / Non-blocking)
            // We do NOT await this because it adds significant latency to the user response.
            if (agentOutput.context && agentOutput.context.length > 100) {
                try {
                    const ragSources = formattedMessages
                        .filter((m) => m.role === 'user' &&
                        m.content &&
                        typeof m.content === 'string' &&
                        m.content.includes('RETRIEVED KNOWLEDGE'))
                        .map((m) => ({ content: typeof m.content === 'string' ? m.content : '' }));
                    if (ragSources.length > 0) {
                        // FIRE AND FORGET - Do not await, do not block response
                        factuality_checker_service_1.factualityCheckerService
                            .checkFactuality(finalResponse, ragSources, promptText)
                            .then((result) => {
                            logger_1.logger.info(`✅ Factuality check: Score=${(result.factScore * 100).toFixed(0)}%, Hallucinations=${result.hallucinations.length}`);
                            if (result.hallucinations.length > 0) {
                                logger_1.logger.warn(`⚠️ Potential hallucinations detected: ${result.hallucinations.map((h) => `"${h.claim}" (${h.severity})`).join(', ')}`);
                            }
                        })
                            .catch((err) => {
                            logger_1.logger.debug(`ℹ️ Factuality check failed in background: ${err}`);
                        });
                    }
                }
                catch (error) {
                    logger_1.logger.debug(`ℹ️ Factuality check skipped setup: ${error}`);
                }
            }
            // Fetch personalization string specifically for suggestion tailoring if missing
            const personalizationPrompt = await user_personalization_service_1.userPersonalizationService.getPersonalizationPrompt(userId, orgId);
            // Wait for parallel suggestion generation to complete
            // Generate suggestions AFTER the response is fully generated based on actual response and history
            suggestions = await suggestion_service_1.suggestionService.generateSuggestions(promptText, agentOutput.context || promptText, finalResponse, history, agentOutput.intent || 'research', !!chartData, fileContext, personalizationPrompt || '');
            // Adjust to chart type if chartData suddenly emerged during string process
            if (chartData && suggestions && suggestions.length > 0) {
                suggestions = suggestions.map((s) => ({
                    ...s,
                    type: s.type === 'text' &&
                        (s.text.toLowerCase().includes('compare') || s.text.toLowerCase().includes('trend'))
                        ? 'chart'
                        : s.type,
                }));
            }
            // Use generated suggestions or fallback (Only for technical questions with valid responses)
            if ((!suggestions || suggestions.length === 0) &&
                agentOutput.intent !== 'chat' &&
                agentOutput.intent !== 'chat_only' &&
                !suggestion_service_1.suggestionService.isRefusal(finalResponse)) {
                suggestions = suggestion_service_1.suggestionService.getFallbackSuggestions();
            }
            const processedResponse = await response_postprocessor_1.responsePostProcessor.process(finalResponse, citations, !!isWebSearch);
            finalResponse = processedResponse;
            await chat_service_1.chatService.saveTransaction(activeSessionId, promptText, finalResponse, uploadedFile, chartData, orgId, suggestions);
            res.write(`data: ${JSON.stringify({
                end: true,
                sessionId,
                chartData,
                response: finalResponse,
                suggestions: suggestions.map((s) => (typeof s === 'string' ? s : s.text)),
                richSuggestions: suggestions,
            })}\n\n`);
            res.end();
            // ✅ NEW: Industrial User Behavior Tracking (Async / Non-blocking)
            // Extract intent and query to update user profile based on this interaction
            user_behavior_service_1.userBehaviorService
                .trackInteraction(userId, orgId, promptText, agentOutput.intent || 'research', history, // Passing conversation history for AI analysis
            agentOutput // Pass the whole agent output which contains retrieved 'context'
            )
                .catch((err) => logger_1.logger.debug(`ℹ️ User behavior tracking failed: ${err}`));
        }
        catch (error) {
            const err = error;
            logger_1.logger.error(`Chat Error: ${err}`);
            try {
                if (sessionId && promptText) {
                    await chat_service_1.chatService.saveTransaction(sessionId, promptText, `[SYSTEM ERROR]: ${err.message || 'Unknown Error'}`, uploadedFile, null, orgId);
                }
            }
            catch (saveErr) {
                logger_1.logger.error('Failed to save error transaction:', saveErr);
            }
            if (res.headersSent) {
                res.write(`data: ${JSON.stringify({ error: err.message || 'An error occurred' })}\n\n`);
                res.end();
            }
            else {
                _next(err);
            }
        }
    },
};
