"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzeFileAction = void 0;
const context_optimizer_service_1 = require("../core/context-optimizer.service");
const agent_prompts_1 = require("../core/agent.prompts");
const logger_1 = require("../../../../utils/logger");
class AnalyzeFileAction {
    async handle(ctx) {
        const { promptText, searchResult, chatHistory, fileContext, glossaryTerms, hasFile } = ctx;
        const systemInstruction = `You are an Expert Data Analyst. Analyze the request.\n${hasFile ? 'Analyze the provided file content deeply. If the user asks to verify if a term exists, SEARCH the text content of the file.' : 'Since no file was uploaded, analyze based on general knowledge ONLY if the topic is strictly within the Oil, Gas, and Water domain.'} Combine the starting content with any discovered background data.\n${agent_prompts_1.AgentPrompts.ANALYSIS}`;
        // Build optimized context with quality scoring
        const analyzeContext = await context_optimizer_service_1.contextOptimizerService.buildOptimizedContext(promptText, searchResult.results, chatHistory, hasFile ? fileContext : '', glossaryTerms || [], 8000);
        logger_1.logger.debug(`📊 Analyze context: ${analyzeContext.usedTokens} tokens`);
        return {
            systemInstruction,
            context: (ctx.currentContext || '') + '\n' + analyzeContext.context,
        };
    }
}
exports.AnalyzeFileAction = AnalyzeFileAction;
