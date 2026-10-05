import { env } from '../../../../config/config';
import { ragService } from '../../../../services/rag/rag.service';
import { AgentParams } from '../../interfaces/agent.interface';
import { logger } from '../../../../utils/logger';
import OpenAI from 'openai';
import { intentClassifierService } from './intent-classifier.service';
import { contextOptimizerService } from './context-optimizer.service';
import { SearchRagAction } from '../actions/search-rag.action';
import { AnalyzeFileAction } from '../actions/analyze-file.action';
import { TakeActionAction } from '../actions/take-action.action';
import { ChatOnlyAction } from '../actions/chat-only.action';
import { SmartActionAction } from '../actions/smart-action.action';
import { userPersonalizationService } from '../personalization/user-personalization.service';
import { ActionContext, AgentActionHandler, formatRAGResults } from '../actions/action.interface';

// Map action names to their handlers
const actionHandlers: Record<string, AgentActionHandler> = {
  search_rag: new SearchRagAction(),
  analyze_file: new AnalyzeFileAction(),
  take_action: new TakeActionAction(),
  chat_only: new ChatOnlyAction(),
  smart_action: new SmartActionAction(),
};

export const agentService = {
  async handleUserMessage({
    promptText,
    sessionId,
    fileContext,
    researchMode,
    chatHistory = [],
    glossaryTerms = [],
    organizationId,
    userId,
  }: AgentParams) {
    logger.debug(`🧠 Processing message: "${promptText.substring(0, 50)}..."`);

    // ✅ 1. Load User Personalization & Behavior (Context starts here)
    const personalizationPrompt = await userPersonalizationService.getPersonalizationPrompt(
      userId as string,
      organizationId
    );

    // ✅ 2. Single call — domain check + intent classification + research mode
    const classification = await intentClassifierService.classifyWithEnsemble(
      promptText,
      chatHistory,
      glossaryTerms,
      personalizationPrompt // New: Pass memory context to classifier
    );

    logger.debug(
      `✅ Classification: ${classification.intent} (Allowed: ${classification.domain_allowed}, Mode: ${classification.researchMode})`
    );

    // ⛔ Domain Check Handler
    if (classification.domain_allowed === false) {
      return {
        directResponse:
          classification.refusal ||
          'I can only assist with Oil, Gas, Water & Energy industry topics.',
        model: env.AI_MODEL_NAME,
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
    const isDeep =
      (finalResearchMode || '').includes('deep_thinking') || finalResearchMode === 'hybrid';
    const isWeb =
      (finalResearchMode || '').includes('web_search') || finalResearchMode === 'hybrid';
    const hasHistory = chatHistory && chatHistory.length > 0;

    logger.debug(`📊 Building context (hasFile: ${hasFile}, hasHistory: ${hasHistory})`);

    let historyContext = '';
    if (hasHistory) {
      // Intelligently select relevant history instead of just last N messages
      const relevantHistory = contextOptimizerService.selectRelevantHistory(
        promptText,
        chatHistory,
        50 // Max 50 messages (Increased for deeper session memory)
      );
      const recentHistory = relevantHistory
        .map((msg, idx) => {
          let content = msg.content;
          // Re-inject suggestions for AI reasoning (like numeric selection)
          if (msg.role === 'assistant' && (msg as any).suggestions) {
            const suggs = (msg as any).suggestions;
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
    } else if (finalInputType === 'research') {
      ragLimit = RAG_LIMITS.RESEARCH;
    } else if (finalInputType === 'smart_action') {
      ragLimit = RAG_LIMITS.SMART;
    }

    let actionName: string;

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

    let searchResult: {
      results: Array<{ content: string; metadata: Record<string, unknown>; similarity: number }>;
      usage: OpenAI.Embeddings.CreateEmbeddingResponse.Usage | undefined;
    } = { results: [], usage: undefined };

    let fileList: string[] = [];

    if (decision.action !== 'chat_only') {
      const searchOptions = { sessionId, organization_id: organizationId, userId };
      const searchPromise = ragService.search(promptText, ragLimit, searchOptions);
      const filesPromise = ragService.getFiles(sessionId, organizationId);
      const results = await Promise.all([searchPromise, filesPromise]);
      searchResult = results[0];
      fileList = results[1];
    }

    logger.debug(`⚡ Agent Decision: ${decision.action}`);
    let finalContext = '';

    if (historyContext) {
      finalContext += historyContext;
    }

    if (fileList && fileList.length > 0) {
      finalContext += `\n### AVAILABLE FILES IN SESSION:\n${fileList.map((f: string) => `- ${f}`).join('\n')}\n`;
    }

    if (personalizationPrompt) {
      finalContext += personalizationPrompt;
    }

    // Execute the appropriate action handler
    const handler = actionHandlers[decision.action];
    if (!handler) {
      logger.error(`❌ No handler found for action: ${decision.action}`);
      throw new Error(`Invalid action: ${decision.action}`);
    }

    const actionContext: ActionContext = {
      promptText,
      searchResult,
      chatHistory,
      fileContext: hasFile ? (fileContext as string) : '',
      hasFile,
      glossaryTerms,
      isDeep: !!isDeep,
      isWeb: !!isWeb,
      currentContext: finalContext,
      organizationId,
      userId,
    };

    const actionResult = await handler.handle(actionContext);

    let selectedModel = env.AI_MODEL_NAME;
    if (isDeep && isWeb && env.AI_MODEL_HYBRID) {
      selectedModel = env.AI_MODEL_HYBRID;
    } else if (isDeep && env.AI_MODEL_REASONING) {
      selectedModel = env.AI_MODEL_REASONING;
    } else if (isWeb && env.AI_MODEL_SEARCH) {
      selectedModel = env.AI_MODEL_SEARCH;
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
