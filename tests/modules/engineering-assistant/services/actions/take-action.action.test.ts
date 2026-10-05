import { TakeActionAction } from '../../../../../src/modules/engineering-assistant/services/actions/take-action.action';
import { contextOptimizerService } from '../../../../../src/modules/engineering-assistant/services/core/context-optimizer.service';
import { AgentPrompts } from '../../../../../src/modules/engineering-assistant/services/core/agent.prompts';

// Mock contextOptimizerService
jest.mock(
  '../../../../../src/modules/engineering-assistant/services/core/context-optimizer.service',
  () => ({
    contextOptimizerService: {
      buildOptimizedContext: jest.fn(),
    },
  })
);

describe('TakeActionAction', () => {
  let action: TakeActionAction;
  const mockContext: any = {
    promptText: 'Draft a plan',
    searchResult: { results: [] },
    chatHistory: [],
    fileContext: '',
    glossaryTerms: [],
    hasFile: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    action = new TakeActionAction();
    (contextOptimizerService.buildOptimizedContext as jest.Mock).mockResolvedValue({
      context: 'Optimized Action Context',
      usedTokens: 100,
    });
  });

  it('should handle take action request', async () => {
    const result = await action.handle(mockContext);

    expect(result.systemInstruction).toContain(AgentPrompts.ACTION);
    expect(result.context).toContain('Optimized Action Context');
    expect(contextOptimizerService.buildOptimizedContext).toHaveBeenCalled();
  });

  it('should pass file context if present', async () => {
    const fileCtx = { ...mockContext, hasFile: true, fileContext: 'Machine Manual' };
    await action.handle(fileCtx);

    expect(contextOptimizerService.buildOptimizedContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      'Machine Manual',
      expect.any(Array),
      8000
    );
  });
});
