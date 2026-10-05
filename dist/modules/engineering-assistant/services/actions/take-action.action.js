"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TakeActionAction = void 0;
const context_optimizer_service_1 = require("../core/context-optimizer.service");
const agent_prompts_1 = require("../core/agent.prompts");
const logger_1 = require("../../../../utils/logger");
class TakeActionAction {
    async handle(ctx) {
        const { promptText, searchResult, chatHistory, fileContext, glossaryTerms, hasFile } = ctx;
        const systemInstruction = `You are an Engineering Operations Manager. Create a detailed action plan, checklist, or step-by-step guide based on the request.\n${agent_prompts_1.AgentPrompts.ACTION}`;
        // Build optimized context for action planning
        const actionContext = await context_optimizer_service_1.contextOptimizerService.buildOptimizedContext(promptText, searchResult.results, chatHistory, hasFile ? fileContext : '', glossaryTerms || [], 8000);
        logger_1.logger.debug(`📊 Action context: ${actionContext.usedTokens} tokens`);
        return {
            systemInstruction,
            context: (ctx.currentContext || '') + '\n' + actionContext.context,
        };
    }
}
exports.TakeActionAction = TakeActionAction;
