import { AgentActionHandler, ActionContext, ActionResult } from './action.interface';
import { contextOptimizerService } from '../core/context-optimizer.service';
import { AgentPrompts } from '../core/agent.prompts';
import { logger } from '../../../../utils/logger';

export class AnalyzeFileAction implements AgentActionHandler {
  async handle(ctx: ActionContext): Promise<ActionResult> {
    const { promptText, searchResult, chatHistory, fileContext, glossaryTerms, hasFile } = ctx;

    const systemInstruction = `You are an Expert Data Analyst. Analyze the request.\n${hasFile ? 'Analyze the provided file content deeply. If the user asks to verify if a term exists, SEARCH the text content of the file.' : 'Since no file was uploaded, analyze based on general knowledge ONLY if the topic is strictly within the Oil, Gas, and Water domain.'} Combine the starting content with any discovered background data.\n${AgentPrompts.ANALYSIS}`;

    // Build optimized context with quality scoring
    const analyzeContext = await contextOptimizerService.buildOptimizedContext(
      promptText,
      searchResult.results,
      chatHistory,
      hasFile ? fileContext : '',
      glossaryTerms || [],
      8000
    );

    logger.debug(`📊 Analyze context: ${analyzeContext.usedTokens} tokens`);

    return {
      systemInstruction,
      context: (ctx.currentContext || '') + '\n' + analyzeContext.context,
    };
  }
}
