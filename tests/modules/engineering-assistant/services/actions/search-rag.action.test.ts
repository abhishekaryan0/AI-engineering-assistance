import { SearchRagAction } from '../../../../../src/modules/engineering-assistant/services/actions/search-rag.action';
import { contextOptimizerService } from '../../../../../src/modules/engineering-assistant/services/core/context-optimizer.service';
import { formatRAGResults } from '../../../../../src/modules/engineering-assistant/services/actions/action.interface';
import { logger } from '../../../../../src/utils/logger';
import { AgentPrompts } from '../../../../../src/modules/engineering-assistant/services/core/agent.prompts';

// Mocks
jest.mock(
  '../../../../../src/modules/engineering-assistant/services/core/context-optimizer.service',
  () => ({
    contextOptimizerService: {
      buildOptimizedContext: jest.fn(),
    },
  })
);

jest.mock(
  '../../../../../src/modules/engineering-assistant/services/actions/action.interface',
  () => ({
    formatRAGResults: jest.fn(),
  })
);

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

describe('SearchRagAction', () => {
  let action: SearchRagAction;
  const mockContext = {
    promptText: 'test prompt',
    searchResult: { results: [{ content: 'doc1' }] },
    chatHistory: [],
    fileContext: '',
    hasFile: false,
    glossaryTerms: [],
    isDeep: false,
    isWeb: false,
    currentContext: 'base context',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    action = new SearchRagAction();
    (contextOptimizerService.buildOptimizedContext as jest.Mock).mockResolvedValue({
      context: 'Optimized History',
      usedTokens: 100,
      itemsIncluded: 1,
    });
    (formatRAGResults as jest.Mock).mockResolvedValue('Formatted RAG Results');
  });

  it('should handle standard research request', async () => {
    const result = await action.handle(mockContext);

    expect(contextOptimizerService.buildOptimizedContext).toHaveBeenCalledWith(
      'test prompt',
      mockContext.searchResult.results,
      [], // history
      '', // file context
      [], // glossary
      8000 // token budget
    );

    expect(result.systemInstruction).toContain(AgentPrompts.RESEARCH);
    expect(result.context).toContain('Optimized History');
    expect(result.context).toContain('### RETRIEVED KNOWLEDGE (RAG)');
    expect(result.context).toContain('Formatted RAG Results');
  });

  it('should handle deep thinking mode', async () => {
    const deepContext = { ...mockContext, isDeep: true };
    const result = await action.handle(deepContext);

    expect(result.systemInstruction).toBe(
      AgentPrompts.DEEP_THINKING +
        '\n\n[System Note: If the query is related to Oil, Gas, or Water but not in the context, use general industrial knowledge. HOWEVER, if the query is unrelated to these industries, you MUST politely refuse to answer. \nCRITICAL: Always align your response style, technical depth, and vocabulary with the "USER BEHAVIOR & PREFERENCES" provided in the context.]'
    );
  });

  it('should handle web search mode', async () => {
    const webContext = { ...mockContext, isWeb: true, isDeep: false }; // Standard web search
    const result = await action.handle(webContext);

    expect(result.systemInstruction).toContain(AgentPrompts.WEB_SEARCH);
  });

  it('should handle deep research with web', async () => {
    const deepWebContext = { ...mockContext, isDeep: true, isWeb: true };
    const result = await action.handle(deepWebContext);

    expect(result.systemInstruction).toContain(AgentPrompts.DEEP_RESEARCH_WITH_WEB);
  });

  it('should handle empty RAG results', async () => {
    (formatRAGResults as jest.Mock).mockResolvedValue('');

    const result = await action.handle(mockContext);

    expect(result.context).toContain(
      '[System Note: No relevant historical documents found in RAG.]'
    );
    expect(result.context).not.toContain('### RETRIEVED KNOWLEDGE');
  });
});
