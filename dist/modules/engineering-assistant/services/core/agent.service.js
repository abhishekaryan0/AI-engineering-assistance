"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentService = void 0;
const config_1 = require("../../../../config/config");
const rag_service_1 = require("../../../../services/rag/rag.service");
const logger_1 = require("../../../../utils/logger");
const intent_classifier_service_1 = require("./intent-classifier.service");
const context_optimizer_service_1 = require("./context-optimizer.service");
const search_rag_action_1 = require("../actions/search-rag.action");
const analyze_file_action_1 = require("../actions/analyze-file.action");
const take_action_action_1 = require("../actions/take-action.action");
const chat_only_action_1 = require("../actions/chat-only.action");
const smart_action_action_1 = require("../actions/smart-action.action");
const user_personalization_service_1 = require("../personalization/user-personalization.service");
// Map action names to their handlers
const actionHandlers = {
    search_rag: new search_rag_action_1.SearchRagAction(),
    analyze_file: new analyze_file_action_1.AnalyzeFileAction(),
    take_action: new take_action_action_1.TakeActionAction(),
    chat_only: new chat_only_action_1.ChatOnlyAction(),
    smart_action: new smart_action_action_1.SmartActionAction(),
};
exports.agentService = {
    async handleUserMessage({ promptText, sessionId, fileContext, researchMode, chatHistory = [], glossaryTerms = [], organizationId, userId, }) {
        logger_1.logger.debug(`🧠 Processing message: "${promptText.substring(0, 50)}..."`);
        // ✅ 1. Load User Personalization & Behavior (Context starts here)
        const personalizationPrompt = await user_personalization_service_1.userPersonalizationService.getPersonalizationPrompt(userId, organizationId);
        // ✅ 2. Single call — domain check + intent classification + research mode
        const classification = await intent_classifier_service_1.intentClassifierService.classifyWithEnsemble(promptText, chatHistory, glossaryTerms, personalizationPrompt // New: Pass memory context to classifier
        );
        logger_1.logger.debug(`✅ Classification: ${classification.intent} (Allowed: ${classification.domain_allowed}, Mode: ${classification.researchMode})`);
        // ⛔ Domain Check Handler
        if (classification.domain_allowed === false) {
            return {
                directResponse: classification.refusal ||
                    'I can only assist with Oil, Gas, Water & Energy industry topics.',
                model: config_1.env.AI_MODEL_NAME,
                intent: 'chat',
                systemPrompt: undefined,
                context: undefined,
                derivedMode: { isDeep: false, isWeb: false },
                intent_classification: classification,
            };
        }
        const finalInputType = classification.intent || 'research';
        let finalResearchMode = researchMode;
        if (!finalResearchMode) {
            finalResearchMode = classification.researchMode || 'simple';
        }
        const hasFile = !!fileContext;
        const isDeep = (finalResearchMode || '').includes('deep_thinking') || finalResearchMode === 'hybrid';
        const isWeb = (finalResearchMode || '').includes('web_search') || finalResearchMode === 'hybrid';
        const hasHistory = chatHistory && chatHistory.length > 0;
        logger_1.logger.debug(`📊 Building context (hasFile: ${hasFile}, hasHistory: ${hasHistory})`);
        let historyContext = '';
        if (hasHistory) {
            // Intelligently select relevant history instead of just last N messages
            const relevantHistory = context_optimizer_service_1.contextOptimizerService.selectRelevantHistory(promptText, chatHistory, 50 // Max 50 messages (Increased for deeper session memory)
            );
            const recentHistory = relevantHistory
                .map((msg, idx) => {
                let content = msg.content;
                // Re-inject suggestions for AI reasoning (like numeric selection)
                if (msg.role === 'assistant' && msg.suggestions) {
                    const suggs = msg.suggestions;
                    if (Array.isArray(suggs) && suggs.length > 0) {
                        content += `\n\n[SUGGESTIONS]: ${JSON.stringify(suggs)}`;
                    }
                }
                return `[${idx + 1}] ${msg.role.toUpperCase()}: ${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}`;
            })
                .join('\n\n');
            historyContext = `\n### PREVIOUS CONVERSATION CONTEXT:\n${recentHistory}\n`;
        }
        // RAG Retrieval Limits
        const RAG_LIMITS = {
            DEFAULT: 5,
            SMART: 10,
            RESEARCH: 25,
            DEEP: 50,
        };
        let ragLimit = RAG_LIMITS.DEFAULT;
        if (isDeep) {
            ragLimit = RAG_LIMITS.DEEP;
        }
        else if (finalInputType === 'research') {
            ragLimit = RAG_LIMITS.RESEARCH;
        }
        else if (finalInputType === 'smart_action') {
            ragLimit = RAG_LIMITS.SMART;
        }
        let actionName;
        switch (finalInputType) {
            case 'smart_action':
                actionName = 'smart_action';
                break;
            case 'analysis':
                actionName = 'analyze_file';
                break;
            case 'action':
                actionName = 'take_action';
                break;
            case 'chat':
                actionName = 'chat_only';
                break;
            case 'research':
            default:
                actionName = 'search_rag';
                break;
        }
        const decision = { action: actionName, query: promptText };
        let searchResult = { results: [], usage: undefined };
        let fileList = [];
        if (decision.action !== 'chat_only') {
            const searchOptions = { sessionId, organization_id: organizationId, userId };
            const searchPromise = rag_service_1.ragService.search(promptText, ragLimit, searchOptions);
            const filesPromise = rag_service_1.ragService.getFiles(sessionId, organizationId);
            const results = await Promise.all([searchPromise, filesPromise]);
            searchResult = results[0];
            fileList = results[1];
        }
        logger_1.logger.debug(`⚡ Agent Decision: ${decision.action}`);
        let finalContext = '';
        if (historyContext) {
            finalContext += historyContext;
        }
        if (fileList && fileList.length > 0) {
            finalContext += `\n### AVAILABLE FILES IN SESSION:\n${fileList.map((f) => `- ${f}`).join('\n')}\n`;
        }
        if (personalizationPrompt) {
            finalContext += personalizationPrompt;
        }
        // Execute the appropriate action handler
        const handler = actionHandlers[decision.action];
        if (!handler) {
            logger_1.logger.error(`❌ No handler found for action: ${decision.action}`);
            throw new Error(`Invalid action: ${decision.action}`);
        }
        const actionContext = {
            promptText,
            searchResult,
            chatHistory,
            fileContext: hasFile ? fileContext : '',
            hasFile,
            glossaryTerms,
            isDeep: !!isDeep,
            isWeb: !!isWeb,
            currentContext: finalContext,
            organizationId,
            userId,
        };
        const actionResult = await handler.handle(actionContext);
        let selectedModel = config_1.env.AI_MODEL_NAME;
        if (isDeep && isWeb && config_1.env.AI_MODEL_HYBRID) {
            selectedModel = config_1.env.AI_MODEL_HYBRID;
        }
        else if (isDeep && config_1.env.AI_MODEL_REASONING) {
            selectedModel = config_1.env.AI_MODEL_REASONING;
        }
        else if (isWeb && config_1.env.AI_MODEL_SEARCH) {
            selectedModel = config_1.env.AI_MODEL_SEARCH;
        }
        return {
            systemPrompt: actionResult.systemInstruction,
            context: actionResult.context,
            model: selectedModel,
            directResponse: undefined,
            derivedMode: { isDeep, isWeb },
            intent: finalInputType,
        };
    },
};
