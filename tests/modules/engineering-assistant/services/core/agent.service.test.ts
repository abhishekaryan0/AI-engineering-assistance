import { agentService } from '../../../../../src/modules/engineering-assistant/services/core/agent.service';
import { intentClassifierService } from '../../../../../src/modules/engineering-assistant/services/core/intent-classifier.service';
import { ragService } from '../../../../../src/services/rag/rag.service';
import { contextOptimizerService } from '../../../../../src/modules/engineering-assistant/services/core/context-optimizer.service';
import { env } from '../../../../../src/config/config';

// Import action classes to spy on prototypes
import { ChatOnlyAction } from '../../../../../src/modules/engineering-assistant/services/actions/chat-only.action';
import { SearchRagAction } from '../../../../../src/modules/engineering-assistant/services/actions/search-rag.action';
import { SmartActionAction } from '../../../../../src/modules/engineering-assistant/services/actions/smart-action.action';
import { TakeActionAction } from '../../../../../src/modules/engineering-assistant/services/actions/take-action.action';
import { AnalyzeFileAction } from '../../../../../src/modules/engineering-assistant/services/actions/analyze-file.action';

// Mocks for dependencies
jest.mock(
  '../../../../../src/modules/engineering-assistant/services/core/intent-classifier.service',
  () => ({
    intentClassifierService: {
      classifyWithEnsemble: jest.fn(),
    },
  })
);

jest.mock('../../../../../src/services/rag/rag.service', () => ({
  ragService: {
    search: jest.fn(),
    getFiles: jest.fn(),
  },
}));

jest.mock(
  '../../../../../src/modules/engineering-assistant/services/core/context-optimizer.service',
  () => ({
    contextOptimizerService: {
      selectRelevantHistory: jest.fn().mockReturnValue([]),
    },
  })
);

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../../../../src/config/config', () => ({
  env: {
    AI_MODEL_NAME: 'default-model',
    OPENROUTER_API_KEY: 'mock-api-key',
    OPENROUTER_BASE: 'https://mock.url',
  },
}));

describe('AgentService', () => {
  let chatOnlySpy: jest.SpyInstance;
  let searchRagSpy: jest.SpyInstance;
  let smartActionSpy: jest.SpyInstance;
  let takeActionSpy: jest.SpyInstance;
  let analyzeFileSpy: jest.SpyInstance;

  beforeAll(() => {
    // Spy on prototype methods to capture calls on existing instances
    chatOnlySpy = jest
      .spyOn(ChatOnlyAction.prototype, 'handle')
      .mockResolvedValue({ systemInstruction: 'Sys', context: 'Ctx' });
    searchRagSpy = jest
      .spyOn(SearchRagAction.prototype, 'handle')
      .mockResolvedValue({ systemInstruction: 'Sys', context: 'Ctx' });
    smartActionSpy = jest
      .spyOn(SmartActionAction.prototype, 'handle')
      .mockResolvedValue({ systemInstruction: 'Sys', context: 'Ctx' });
    takeActionSpy = jest
      .spyOn(TakeActionAction.prototype, 'handle')
      .mockResolvedValue({ systemInstruction: 'Sys', context: 'Ctx' });
    analyzeFileSpy = jest
      .spyOn(AnalyzeFileAction.prototype, 'handle')
      .mockResolvedValue({ systemInstruction: 'Sys', context: 'Ctx' });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject out-of-domain queries', async () => {
    (intentClassifierService.classifyWithEnsemble as jest.Mock).mockResolvedValue({
      domain_allowed: false,
      refusal: 'Not allowed',
    });

    const result = await agentService.handleUserMessage({
      promptText: 'How to bake a cake?',
      sessionId: '123',
    });

    expect(result.directResponse).toBe('Not allowed');
    expect(result.intent).toBe('chat');
  });

  it('should route to chat_only for chat intent', async () => {
    (intentClassifierService.classifyWithEnsemble as jest.Mock).mockResolvedValue({
      domain_allowed: true,
      intent: 'chat',
      researchMode: 'simple',
    });

    await agentService.handleUserMessage({
      promptText: 'Hello',
      sessionId: '123',
    });

    expect(chatOnlySpy).toHaveBeenCalled();
  });

  it('should route to search_rag for research intent', async () => {
    (intentClassifierService.classifyWithEnsemble as jest.Mock).mockResolvedValue({
      domain_allowed: true,
      intent: 'research',
      researchMode: 'deep_thinking',
    });
    (ragService.search as jest.Mock).mockResolvedValue({ results: [] });

    const result = await agentService.handleUserMessage({
      promptText: 'Explain deep learning',
      sessionId: '123',
    });

    expect(ragService.search).toHaveBeenCalled();
    // The original spy `searchRagSpy` is still active and captures calls to the prototype.
    // The user's requested change to use `mock.instances[0]` would require `SearchRagAction` itself to be mocked,
    // not just its prototype spied on. Sticking to the existing spy for consistency.
    expect(searchRagSpy).toHaveBeenCalled();
    expect(result.derivedMode.isDeep).toBe(true);
  });

  it('should handle history context optimization', async () => {
    (intentClassifierService.classifyWithEnsemble as jest.Mock).mockResolvedValue({
      domain_allowed: true,
      intent: 'chat',
    });
    (contextOptimizerService.selectRelevantHistory as jest.Mock).mockReturnValue([
      { role: 'user', content: 'prev message' },
    ]);

    await agentService.handleUserMessage({
      promptText: 'Follow up',
      sessionId: '123',
      chatHistory: [{ role: 'user', content: 'prev message' }],
    });

    expect(contextOptimizerService.selectRelevantHistory).toHaveBeenCalled();
  });
});
