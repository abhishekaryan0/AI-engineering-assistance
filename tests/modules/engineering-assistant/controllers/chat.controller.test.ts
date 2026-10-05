import { Request, Response, NextFunction } from 'express';
import { ChatController } from '../../../../src/modules/engineering-assistant/controllers/chat.controller';
import { prisma } from '../../../../src/config/db';
import { fileService } from '../../../../src/services/file.service';
import { llmService } from '../../../../src/services/llm/llm.service';
import { agentService } from '../../../../src/modules/engineering-assistant/services/core/agent.service';
import { chatService } from '../../../../src/services/chat.service';
import { intentClassifierService } from '../../../../src/modules/engineering-assistant/services/core/intent-classifier.service';
import { responsePostProcessor } from '../../../../src/services/utils/response.postprocessor';
import { suggestionService } from '../../../../src/modules/engineering-assistant/services/quality/suggestion.service';
import { AgentRequestSchema } from '../../../../src/validators/chat.validator';
import { buildEngineeringPrompt } from '../../../../src/services/prompt.service';

// ----------------------------------------------------------------------------
// Mocks
// ----------------------------------------------------------------------------

jest.mock('../../../../src/services/prompt.service', () => ({
  buildEngineeringPrompt: jest.fn().mockReturnValue([]),
}));

jest.mock('../../../../src/config/db', () => ({
  prisma: {
    chat_sessions: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../../../../src/services/file.service', () => ({
  fileService: {
    processAndUpload: jest.fn(),
  },
}));

jest.mock('../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chat: jest.fn(),
    chatStream: jest.fn(),
  },
}));

jest.mock('../../../../src/modules/engineering-assistant/services/core/agent.service', () => ({
  agentService: {
    handleUserMessage: jest.fn(),
  },
}));

jest.mock('../../../../src/services/chat.service', () => ({
  chatService: {
    getChatHistory: jest.fn(),
    getLastFileContent: jest.fn(),
    saveTransaction: jest.fn(),
  },
}));

jest.mock(
  '../../../../src/modules/engineering-assistant/services/core/intent-classifier.service',
  () => ({
    intentClassifierService: {
      decomposeQuery: jest.fn(),
    },
  })
);

jest.mock(
  '../../../../src/modules/engineering-assistant/services/quality/suggestion.service',
  () => ({
    suggestionService: {
      generateSuggestions: jest
        .fn()
        .mockResolvedValue([{ text: 'fallback', type: 'text', score: 0.5 }]),
      getFallbackSuggestions: jest
        .fn()
        .mockReturnValue([{ text: 'fallback', type: 'text', score: 0.5 }]),
    },
  })
);

jest.mock('../../../../src/services/utils/response.postprocessor', () => ({
  responsePostProcessor: {
    process: jest.fn(),
  },
}));

jest.mock('../../../../src/modules/glossary', () => ({
  glossaryService: {
    findTerms: jest.fn().mockReturnValue([]),
  },
}));

jest.mock(
  '../../../../src/modules/engineering-assistant/services/quality/factuality-checker.service',
  () => ({
    factualityCheckerService: {
      checkFactuality: jest.fn().mockResolvedValue({ factScore: 1, hallucinations: [] }),
    },
  })
);

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('ChatController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      user: { id: 'user-123', organization_id: 'org-123' } as any,
    };

    res = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      headersSent: false,
    };

    next = jest.fn();
  });

  describe('sendMessage', () => {
    it('should create a new session if not provided', async () => {
      req.body = { promptText: 'Hello' };
      (prisma.chat_sessions.create as jest.Mock).mockResolvedValue({ id: 'new-session-id' });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({
        systemPrompt: 'sys',
        context: 'ctx',
        model: 'model',
        chainOfThought: 'cot',
      });
      (llmService.chatStream as jest.Mock).mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'AI Response' } }] };
      });
      (responsePostProcessor.process as jest.Mock).mockResolvedValue('AI Response');

      await ChatController.sendMessage(req as Request, res as Response, next);

      expect(prisma.chat_sessions.create).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      // Ensure we verify at least one write call with session ID
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('new-session-id'));
    });

    it('should use existing session if provided and valid', async () => {
      req.body = { promptText: 'Hello', sessionId: 'existing-session' };
      req.user = { id: 'user-123', organization_id: 'org-456' };
      (prisma.chat_sessions.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-session' });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({
        model: 'model',
      });
      (llmService.chatStream as jest.Mock).mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'AI Response' } }] };
      });
      (responsePostProcessor.process as jest.Mock).mockResolvedValue('AI Response');

      await ChatController.sendMessage(req as Request, res as Response, next);

      expect(prisma.chat_sessions.findFirst).toHaveBeenCalledWith({
        where: { id: 'existing-session', organization_id: 'org-456' },
      });
      expect(prisma.chat_sessions.create).not.toHaveBeenCalled();
    });

    it('should handle file uploads', async () => {
      req.body = { promptText: 'Analyze this' };
      req.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test'),
      } as any;

      (prisma.chat_sessions.create as jest.Mock).mockResolvedValue({ id: 'session-id' });
      (fileService.processAndUpload as jest.Mock).mockResolvedValue({
        textContent: 'Extracted text',
        s3Key: 'key',
        s3Url: 'url',
      });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({
        model: 'model',
        fileContext: 'Extracted text',
      });
      (llmService.chatStream as jest.Mock).mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'Analysis' } }] };
      });
      (responsePostProcessor.process as jest.Mock).mockResolvedValue('Analysis');

      await ChatController.sendMessage(req as Request, res as Response, next);

      expect(fileService.processAndUpload).toHaveBeenCalled();
      expect(agentService.handleUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          fileContext: 'Extracted text',
        })
      );
    });

    it('should handle agent direct response (no streaming)', async () => {
      req.body = { promptText: 'Hello' };
      (prisma.chat_sessions.create as jest.Mock).mockResolvedValue({ id: 'session-id' });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({
        directResponse: 'Direct Answer',
      });

      await ChatController.sendMessage(req as Request, res as Response, next);

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Direct Answer'));
      expect(llmService.chat).not.toHaveBeenCalled();
      expect(llmService.chatStream).not.toHaveBeenCalled();
    });

    it('should handle web search mode (non-streaming)', async () => {
      req.body = { promptText: 'Search', researchMode: 'web_search' };
      (prisma.chat_sessions.create as jest.Mock).mockResolvedValue({ id: 'session-id' });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({
        model: 'model',
      });
      (llmService.chat as jest.Mock).mockResolvedValue({
        content: 'Search Result',
      });
      (responsePostProcessor.process as jest.Mock).mockResolvedValue('Search Result');

      await ChatController.sendMessage(req as Request, res as Response, next);

      expect(llmService.chat).toHaveBeenCalled();
      expect(llmService.chatStream).not.toHaveBeenCalled();
    });

    it('should handle chart transformations for suggestions without type chart', async () => {
      req.body = { promptText: 'Show trend' };
      (prisma.chat_sessions.create as jest.Mock).mockResolvedValue({ id: 'session-id' });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({
        chartData: null,
      });
      (suggestionService.generateSuggestions as jest.Mock).mockResolvedValue([
        { type: 'text', text: 'Compare these values' },
      ]);
      (llmService.chatStream as jest.Mock).mockImplementation(async function* () {
        // Since `chat.controller.ts` directly calls `processAIResponse(fullAiResponse)`,
        // yielding valid chart formatting natively applies the transformation internally!
        yield { choices: [{ delta: { content: '```json\n{ "type": "line", "data": [] }\n```' } }] };
      });

      await ChatController.sendMessage(req as Request, res as Response, next);

      // Verify write gets called with the processed chart transformation array mapped to "type":"chart"
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"chart"'));
    });

    it('should catch errors during stream iteration and call error fallback', async () => {
      req.body = { promptText: 'Fail stream' };
      (prisma.chat_sessions.create as jest.Mock).mockResolvedValue({ id: 'session-id' });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({ model: 'model' });

      const asyncIter = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'start' } }] };
          throw new Error('Stream Error');
        },
      };
      (llmService.chatStream as jest.Mock).mockResolvedValue(asyncIter);

      res.headersSent = true; // explicitly set to mock normal Express behavior mid-stream

      await ChatController.sendMessage(req as Request, res as Response, next);

      // The controller sends `{ error: "Stream Error" }` when response headers are already sent
      // However the `ChatController.sendMessage` catches stream errors inside `try/catch` wrapping the loop
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Stream Error'));
    });

    it('should handle factuality check logic path asynchronously without awaiting', async () => {
      req.body = { promptText: 'Check fact asynchronously', sessionId: 'sess-fact-asc' };
      req.user = { id: 'user-123', organization_id: 'org-456' };
      (prisma.chat_sessions.findFirst as jest.Mock).mockResolvedValue({
        id: 'sess-fact-asc',
        user_id: 'user-123',
        organization_id: 'org-456',
      });
      (chatService.getChatHistory as jest.Mock).mockResolvedValue([]);
      (intentClassifierService.decomposeQuery as jest.Mock).mockResolvedValue({
        isComposite: false,
      });

      // In order to trigger the factuality branch, agentOutput.context must exist
      // And we need formattedMessages (which uses buildEngineeringPrompt) to include 'RETRIEVED KNOWLEDGE'
      (agentService.handleUserMessage as jest.Mock).mockResolvedValue({
        model: 'model',
        context: 'Long enough context'.repeat(10), // length > 100
      });

      // Override the builder so `formattedMessages` has the target filter condition
      const mockPromptBuilderBlock = [
        { role: 'user', content: 'RETRIEVED KNOWLEDGE: Mocked knowledge' },
      ];
      const promptBuilderSpy = jest.requireMock(
        '../../../../src/services/prompt.service'
      ).buildEngineeringPrompt;
      promptBuilderSpy.mockReturnValueOnce(mockPromptBuilderBlock);

      (llmService.chatStream as jest.Mock).mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'Done.' } }] };
      });

      const checkFactualityMock = jest.requireMock(
        '../../../../src/modules/engineering-assistant/services/quality/factuality-checker.service'
      ).factualityCheckerService.checkFactuality;
      checkFactualityMock.mockImplementationOnce(async () => {
        return {
          isFactual: false,
          hallucinations: [{ claim: 'False', severity: 'high' }],
          factScore: 0.1,
        };
      });

      await ChatController.sendMessage(req as Request, res as Response, next);

      // Wait for process ticks fully resolving unawaited catches
      await new Promise((resolve) => setImmediate(resolve));

      expect(checkFactualityMock).toHaveBeenCalled();
    });

    it('should fallback securely when headers are already sent', async () => {
      req.body = { promptText: 'Headers test' };
      res.headersSent = true;
      (prisma.chat_sessions.create as jest.Mock).mockRejectedValue(new Error('DB Failed'));

      await ChatController.sendMessage(req as Request, res as Response, next);

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('DB Failed'));
      expect(next).not.toHaveBeenCalled();
    });

    it('should throw next error when headers are NOT sent but fatal crash happens', async () => {
      req.body = { promptText: 'Next test' };
      res.headersSent = false;
      const criticalErr = new Error('Critical Setup Fail');
      (prisma.chat_sessions.create as jest.Mock).mockRejectedValue(criticalErr);

      await ChatController.sendMessage(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(criticalErr);
    });
  });
});
