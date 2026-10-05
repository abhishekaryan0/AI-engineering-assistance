import { AnalyzeFileAction } from '../../../../../src/modules/engineering-assistant/services/actions/analyze-file.action';
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

describe('AnalyzeFileAction', () => {
  let action: AnalyzeFileAction;
  const mockContext: any = {
    promptText: 'Analyze this',
    searchResult: { results: [] },
    chatHistory: [],
    fileContext: 'File Content',
    glossaryTerms: [],
    hasFile: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    action = new AnalyzeFileAction();
    (contextOptimizerService.buildOptimizedContext as jest.Mock).mockResolvedValue({
      context: 'Analyzed Content Context',
      usedTokens: 200,
    });
  });

  it('should handle file analysis request', async () => {
    const result = await action.handle(mockContext);

    expect(result.systemInstruction).toContain(AgentPrompts.ANALYSIS);
    expect(result.systemInstruction).toContain('Analyze the provided file content deeply');
    expect(result.context).toContain('Analyzed Content Context');
  });

  it('should handle analysis without a file', async () => {
    const noFileCtx = { ...mockContext, hasFile: false, fileContext: '' };
    const result = await action.handle(noFileCtx);

    expect(result.systemInstruction).toContain('Since no file was uploaded');
  });
});
