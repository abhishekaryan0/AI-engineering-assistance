import { SmartActionAction } from '../../../../../src/modules/engineering-assistant/services/actions/smart-action.action';
import { queryCacheService } from '../../../../../src/modules/engineering-assistant/services/data/query-cache.service';
import { toolRegistry } from '../../../../../src/modules/engineering-assistant/tools/ToolRegistry';
import { toolExecutionService } from '../../../../../src/modules/engineering-assistant/services/execution/tool-execution.service';
import { llmService } from '../../../../../src/services/llm/llm.service';
import {
  ActionContext,
  ActionResult,
} from '../../../../../src/modules/engineering-assistant/services/actions/action.interface';

jest.mock(
  '../../../../../src/modules/engineering-assistant/services/data/query-cache.service',
  () => ({
    queryCacheService: {
      get: jest.fn(),
      set: jest.fn(),
    },
  })
);

jest.mock('../../../../../src/modules/engineering-assistant/tools/ToolRegistry', () => ({
  toolRegistry: {
    getToolSignatures: jest.fn().mockReturnValue('Mock Tool Signatures'),
  },
}));

jest.mock(
  '../../../../../src/modules/engineering-assistant/services/execution/tool-execution.service',
  () => ({
    toolExecutionService: {
      executeToolSafely: jest.fn(),
    },
  })
);

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chat: jest.fn(),
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../../../src/config/config', () => ({
  env: {
    AI_MODEL_REASONING: 'reasoning-model',
    AI_MODEL_NAME: 'default-model',
    OPENAI_API_KEY: 'test-key',
  },
}));

describe('SmartActionAction', () => {
  jest.setTimeout(15000);
  let smartAction: SmartActionAction;
  let mockCtx: ActionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    smartAction = new SmartActionAction();
    mockCtx = {
      promptText: 'Test Query',
      searchResult: { results: [] },
      currentContext: 'Ctx',
      hasFile: false,
      fileContext: '',
    } as any;
  });

  it('should use cached result if available', async () => {
    (queryCacheService.get as jest.Mock).mockReturnValue('Cached Result');

    const result = await smartAction.handle(mockCtx);

    expect(result.systemInstruction).toContain('Cached Result');
    expect(queryCacheService.get).toHaveBeenCalledWith('Test Query', { type: 'smart_action' });
    expect(llmService.chat).not.toHaveBeenCalled();
  });

  it('should execute ReAct loop and return final answer', async () => {
    (queryCacheService.get as jest.Mock).mockReturnValue(null);
    (llmService.chat as jest.Mock).mockResolvedValue({ content: 'Final Answer: Solved' });

    const result = await smartAction.handle(mockCtx);

    expect(result.systemInstruction).toContain('Solved');
    expect(llmService.chat).toHaveBeenCalledTimes(1);
    expect(queryCacheService.set).toHaveBeenCalled();
  });

  it('should execute tool when requested by LLM', async () => {
    (queryCacheService.get as jest.Mock).mockReturnValue(null);

    // First call: Request Action
    // Second call: Final Answer
    (llmService.chat as jest.Mock)
      .mockResolvedValueOnce({
        content:
          'Thought: I need to use a tool.\nAction: test_tool\nAction Input: {"key": "value"}',
      })
      .mockResolvedValueOnce({
        content: 'Final Answer: Tool worked',
      });

    (toolExecutionService.executeToolSafely as jest.Mock).mockResolvedValue({
      success: true,
      data: 'Tool Output',
    });

    const result = await smartAction.handle(mockCtx);

    expect(toolExecutionService.executeToolSafely).toHaveBeenCalledWith('test_tool', {
      key: 'value',
    });
    expect(result.systemInstruction).toContain('Tool worked');
  });

  it('should handle loop limit', async () => {
    (queryCacheService.get as jest.Mock).mockReturnValue(null);
    (llmService.chat as jest.Mock).mockResolvedValue({ content: 'Thought: Thinking...' });

    const result = await smartAction.handle(mockCtx);

    // Should run 8 times (new MAX_LOOPS) then fail gracefully
    expect(llmService.chat).toHaveBeenCalledTimes(8);
    expect(result.systemInstruction).toContain(
      'I could not complete the request within the reasoning limit'
    );
  });
});
