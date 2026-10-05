import {
  AgentActionHandler,
  ActionContext,
  ActionResult,
  formatRAGResults,
} from './action.interface';
import { contextOptimizerService } from '../core/context-optimizer.service';
import { AgentPrompts } from '../core/agent.prompts';
import { logger } from '../../../../utils/logger';

export class SearchRagAction implements AgentActionHandler {
  async handle(ctx: ActionContext): Promise<ActionResult> {
    const {
      promptText,
      searchResult,
      chatHistory,
      fileContext,
      glossaryTerms,
      hasFile,
      isDeep,
      isWeb,
      currentContext,
    } = ctx;

    // Build optimized context - Intelligent packing by relevance and token budget
    const optimizedContext = await contextOptimizerService.buildOptimizedContext(
      promptText,
      searchResult.results,
      chatHistory,
      hasFile ? fileContext : '',
      glossaryTerms || [],
      8000 // Token budget
    );

    // ✅ PRESERVE existing context (Personalization/Behavior) instead of overwriting
    let finalContext = (currentContext || '') + '\n' + optimizedContext.context;

    logger.debug(
      `📊 Optimized context: ${optimizedContext.usedTokens} tokens from ${optimizedContext.itemsIncluded} items`
    );

    let baseInstruction = '';
    if (isDeep) {
      baseInstruction = isWeb ? AgentPrompts.DEEP_RESEARCH_WITH_WEB : AgentPrompts.DEEP_THINKING;
    } else if (isWeb) {
      baseInstruction = AgentPrompts.WEB_SEARCH;
    } else {
      baseInstruction = `You are a Research Expert. Analyze the retrieved knowledge below to answer the user request.\n${AgentPrompts.RESEARCH}`;
    }

    let systemInstruction = baseInstruction;
    systemInstruction += `\n\n[System Note: If the query is related to Oil, Gas, or Water but not in the context, use general industrial knowledge. HOWEVER, if the query is unrelated to these industries, you MUST politely refuse to answer. 
CRITICAL: Always align your response style, technical depth, and vocabulary with the "USER BEHAVIOR & PREFERENCES" provided in the context.]`;

    const formattedResults = await formatRAGResults(searchResult.results);
    if (formattedResults) {
      finalContext += `\n### RETRIEVED KNOWLEDGE (RAG):\n${formattedResults}`;
    } else {
      finalContext += '\n[System Note: No relevant historical documents found in RAG.]';
    }

    return { systemInstruction, context: finalContext };
  }
}
