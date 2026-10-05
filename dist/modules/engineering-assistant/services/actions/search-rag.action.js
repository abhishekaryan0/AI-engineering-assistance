"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchRagAction = void 0;
const action_interface_1 = require("./action.interface");
const context_optimizer_service_1 = require("../core/context-optimizer.service");
const agent_prompts_1 = require("../core/agent.prompts");
const logger_1 = require("../../../../utils/logger");
class SearchRagAction {
    async handle(ctx) {
        const { promptText, searchResult, chatHistory, fileContext, glossaryTerms, hasFile, isDeep, isWeb, currentContext, } = ctx;
        // Build optimized context - Intelligent packing by relevance and token budget
        const optimizedContext = await context_optimizer_service_1.contextOptimizerService.buildOptimizedContext(promptText, searchResult.results, chatHistory, hasFile ? fileContext : '', glossaryTerms || [], 8000 // Token budget
        );
        // ✅ PRESERVE existing context (Personalization/Behavior) instead of overwriting
        let finalContext = (currentContext || '') + '\n' + optimizedContext.context;
        logger_1.logger.debug(`📊 Optimized context: ${optimizedContext.usedTokens} tokens from ${optimizedContext.itemsIncluded} items`);
        let baseInstruction = '';
        if (isDeep) {
            baseInstruction = isWeb ? agent_prompts_1.AgentPrompts.DEEP_RESEARCH_WITH_WEB : agent_prompts_1.AgentPrompts.DEEP_THINKING;
        }
        else if (isWeb) {
            baseInstruction = agent_prompts_1.AgentPrompts.WEB_SEARCH;
        }
        else {
            baseInstruction = `You are a Research Expert. Analyze the retrieved knowledge below to answer the user request.\n${agent_prompts_1.AgentPrompts.RESEARCH}`;
        }
        let systemInstruction = baseInstruction;
        systemInstruction += `\n\n[System Note: If the query is related to Oil, Gas, or Water but not in the context, use general industrial knowledge. HOWEVER, if the query is unrelated to these industries, you MUST politely refuse to answer. 
CRITICAL: Always align your response style, technical depth, and vocabulary with the "USER BEHAVIOR & PREFERENCES" provided in the context.]`;
        const formattedResults = await (0, action_interface_1.formatRAGResults)(searchResult.results);
        if (formattedResults) {
            finalContext += `\n### RETRIEVED KNOWLEDGE (RAG):\n${formattedResults}`;
        }
        else {
            finalContext += '\n[System Note: No relevant historical documents found in RAG.]';
        }
        return { systemInstruction, context: finalContext };
    }
}
exports.SearchRagAction = SearchRagAction;
