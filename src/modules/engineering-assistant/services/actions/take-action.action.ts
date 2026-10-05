import { AgentActionHandler, ActionContext, ActionResult } from './action.interface';
import { contextOptimizerService } from '../core/context-optimizer.service';
import { AgentPrompts } from '../core/agent.prompts';
import { logger } from '../../../../utils/logger';

export class TakeActionAction implements AgentActionHandler {
  async handle(ctx: ActionContext): Promise<ActionResult> {
    const { promptText, searchResult, chatHistory, fileContext, glossaryTerms, hasFile } = ctx;

    const systemInstruction = `You are an Engineering Operations Manager. Create a detailed action plan, checklist, or step-by-step guide based on the request.\n${AgentPrompts.ACTION}`;

    // Build optimized context for action planning
    const actionContext = await contextOptimizerService.buildOptimizedContext(
      promptText,
      searchResult.results,
      chatHistory,
      hasFile ? fileContext : '',
      glossaryTerms || [],
      8000
    );

    logger.debug(`📊 Action context: ${actionContext.usedTokens} tokens`);

    return {
      systemInstruction,
      context: (ctx.currentContext || '') + '\n' + actionContext.context,
    };
  }
}
