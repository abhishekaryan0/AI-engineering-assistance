import { toolExecutionService } from '../../../../../src/modules/engineering-assistant/services/execution/tool-execution.service';
import { toolRegistry } from '../../../../../src/modules/engineering-assistant/tools/ToolRegistry';
import { logger } from '../../../../../src/utils/logger';

// Mock ToolRegistry
jest.mock('../../../../../src/modules/engineering-assistant/tools/ToolRegistry', () => ({
  toolRegistry: {
    executeTool: jest.fn(),
    getTool: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ToolExecutionService', () => {
  const toolName = 'test_tool';
  const params = { key: 'value' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeToolSafely', () => {
    it('should execute tool successfully', async () => {
      (toolRegistry.executeTool as jest.Mock).mockResolvedValue('Tool Output');
      (toolRegistry.getTool as jest.Mock).mockReturnValue({
        validate: jest.fn().mockReturnValue({ isValid: true }),
      });

      const result = await toolExecutionService.executeToolSafely(toolName, params);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Tool Output');
      expect(result.attempts).toBe(1);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should retry on failure', async () => {
      (toolRegistry.executeTool as jest.Mock)
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('Success on Retry');
      (toolRegistry.getTool as jest.Mock).mockReturnValue({
        validate: jest.fn().mockReturnValue({ isValid: true }),
      });

      const result = await toolExecutionService.executeToolSafely(toolName, params);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Success on Retry');
      expect(result.attempts).toBe(2);
      expect(toolRegistry.executeTool).toHaveBeenCalledTimes(2);
    });

    it('should return failure after max retries', async () => {
      (toolRegistry.executeTool as jest.Mock).mockRejectedValue(new Error('Always Fail'));

      const result = await toolExecutionService.executeToolSafely(toolName, params, 2);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Always Fail');
      expect(result.attempts).toBe(3); // Initial + 2 retries
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle timeout', async () => {
      // We can't easily adhere to real timeouts in unit tests without extensive mocking or slow tests.
      // Instead, we rely on the internal Promise.race logic.
      // We can simulate a timeout by making the executeTool mock hang or reject with the timeout error manually if we were testing the race logic deeply.
      // But here we can mock the Promise.race outcome if we want, or just let executeTool block.
      // Actually, it's easier to verify that it handles errors including timeout errors.

      (toolRegistry.executeTool as jest.Mock).mockRejectedValue(
        new Error('Tool execution timeout after 30 seconds')
      );

      const result = await toolExecutionService.executeToolSafely(toolName, params, 0); // 0 retries

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should validate tool output', async () => {
      (toolRegistry.executeTool as jest.Mock).mockResolvedValue('Invalid Content');
      (toolRegistry.getTool as jest.Mock).mockReturnValue({
        validate: jest.fn().mockReturnValue({ isValid: false, reason: 'Bad format' }),
      });

      const result = await toolExecutionService.executeToolSafely(toolName, params, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid tool output: Bad format');
    });
  });

  describe('validateToolOutput', () => {
    it('should use tool specific validation if available', () => {
      const validateMock = jest.fn().mockReturnValue({ isValid: true });
      (toolRegistry.getTool as jest.Mock).mockReturnValue({ validate: validateMock });

      const result = toolExecutionService.validateToolOutput('data', toolName);

      expect(validateMock).toHaveBeenCalledWith('data');
      expect(result.isValid).toBe(true);
    });

    it('should use default validation if tool has no validation', () => {
      (toolRegistry.getTool as jest.Mock).mockReturnValue({});

      const valid = toolExecutionService.validateToolOutput('some data', toolName);
      const invalid = toolExecutionService.validateToolOutput('', toolName);

      expect(valid.isValid).toBe(true);
      expect(invalid.isValid).toBe(false);
    });
  });

  describe('getFallbackResponse', () => {
    it('should get tool specific fallback', async () => {
      const fallbackMock = jest.fn().mockReturnValue('Custom fallback');
      (toolRegistry.getTool as jest.Mock).mockReturnValue({ getFallbackMessage: fallbackMock });

      const msg = await toolExecutionService.getFallbackResponse(toolName, 'intent', 'Error');

      expect(msg).toBe('Custom fallback');
      expect(fallbackMock).toHaveBeenCalled();
    });

    it('should return default fallback', async () => {
      (toolRegistry.getTool as jest.Mock).mockReturnValue({});

      const msg = await toolExecutionService.getFallbackResponse(toolName, 'intent');

      expect(msg).toContain('temporarily unavailable');
    });

    it('should include timeout advice', async () => {
      (toolRegistry.getTool as jest.Mock).mockReturnValue({});

      const msg = await toolExecutionService.getFallbackResponse(
        toolName,
        'intent',
        'Execution timeout'
      );

      expect(msg).toContain('took too long');
    });
  });

  describe('Helper methods', () => {
    it('should check result completeness', () => {
      expect(toolExecutionService.isResultComplete({ success: false } as any)).toBe(false);
      expect(toolExecutionService.isResultComplete({ success: true, confidence: 0.5 } as any)).toBe(
        false
      );
      expect(
        toolExecutionService.isResultComplete({
          success: true,
          confidence: 1,
          data: 'short',
        } as any)
      ).toBe(false);
      expect(
        toolExecutionService.isResultComplete({
          success: true,
          confidence: 1,
          data: 'Long enough response',
        } as any)
      ).toBe(true);
    });

    it('should format result summary', () => {
      const summary = toolExecutionService.getResultSummary({
        toolName: 'test',
        success: true,
        executionTime: 100,
        confidence: 0.9,
        attempts: 1,
      } as any);
      expect(summary).toContain('test: ✅ (100ms, confidence: 90%, attempts: 1)');
    });
  });
});
