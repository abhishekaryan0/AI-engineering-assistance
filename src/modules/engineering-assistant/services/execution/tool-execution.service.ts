/**
 * Tool Execution Service
 * Handles tool execution with retry logic, validation, and error handling
 */

import { toolRegistry } from '../../tools/ToolRegistry';
import { logger } from '../../../../utils/logger';

export interface ToolExecutionResult {
  success: boolean;
  data: string;
  error?: string;
  confidence: number; // 0-1, how confident in the result
  executionTime: number; // milliseconds
  retryAttempt: number;
  toolName: string;
  attempts: number;
}

export const toolExecutionService = {
  /**
   * Execute tool with automatic retry, timeout, and validation
   */
  async executeToolSafely(
    toolName: string,
    params: Record<string, unknown>,
    maxRetries = 2,
    timeoutMs = 90000
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempt = 0;

    logger.debug(`🔧 Tool Execution Started: ${toolName}`);

    for (attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`⏱️  Attempt ${attempt + 1}/${maxRetries + 1} for tool: ${toolName}`);

        // Execute with timeout protection
        // Execute with timeout protection
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`Tool execution timeout after ${timeoutMs / 1000} seconds`)),
            timeoutMs
          );
        });

        let data: string;
        try {
          data = await Promise.race([toolRegistry.executeTool(toolName, params), timeoutPromise]);
        } finally {
          if (timeoutId!) clearTimeout(timeoutId);
        }

        // Validate result
        const validationResult = this.validateToolOutput(data, toolName);
        if (!validationResult.isValid) {
          throw new Error(`Invalid tool output: ${validationResult.reason}`);
        }

        const executionTime = Date.now() - startTime;
        logger.info(
          `✅ Tool execution succeeded: ${toolName} (${executionTime}ms, attempt ${attempt + 1})`
        );

        return {
          success: true,
          data,
          confidence: 0.95,
          executionTime,
          retryAttempt: attempt,
          toolName,
          attempts: attempt + 1,
        };
      } catch (error) {
        lastError = error as Error;
        logger.warn(`⚠️  Attempt ${attempt + 1} failed for ${toolName}: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const backoffMs = Math.pow(2, attempt) * 100;
          logger.debug(`⏳ Retrying in ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    // All retries exhausted
    const executionTime = Date.now() - startTime;
    logger.error(
      `❌ Tool execution failed after ${attempt} attempts: ${toolName}. Error: ${lastError?.message}`
    );

    return {
      success: false,
      data: '',
      error: lastError?.message || 'Unknown error',
      confidence: 0,
      executionTime,
      retryAttempt: maxRetries,
      toolName,
      attempts: attempt,
    };
  },

  /**
   * Validate tool output format and content
   */
  validateToolOutput(data: string, toolName: string): { isValid: boolean; reason?: string } {
    const tool = toolRegistry.getTool(toolName);
    if (tool && typeof tool.validate === 'function') {
      return tool.validate(data);
    }

    // Default basic validation if tool specific validation is not available
    if (!data || data.trim().length === 0) {
      return { isValid: false, reason: 'Empty result' };
    }

    return { isValid: true };
  },

  /**
   * Get fallback response when tool execution fails
   */
  async getFallbackResponse(
    toolName: string,
    intent: string,
    originalError?: string
  ): Promise<string> {
    const tool = toolRegistry.getTool(toolName);
    if (tool && typeof tool.getFallbackMessage === 'function') {
      return tool.getFallbackMessage(new Error(originalError || 'Unknown error'));
    }

    let fallback =
      'The requested tool is temporarily unavailable. Please try again later or contact support if the issue persists.';

    // Add retry suggestion
    if (originalError?.includes('timeout')) {
      fallback += ' The request took too long to process - try a more specific query.';
    }

    return fallback;
  },

  /**
   * Check if tool result looks valid/complete
   */
  isResultComplete(result: ToolExecutionResult): boolean {
    if (!result.success) return false;
    if (result.confidence < 0.7) return false;
    if (result.data.length < 10) return false; // Minimum meaningful response
    return true;
  },

  /**
   * Get result summary for logging/monitoring
   */
  getResultSummary(result: ToolExecutionResult): string {
    return `${result.toolName}: ${result.success ? '✅' : '❌'} (${result.executionTime}ms, confidence: ${(result.confidence * 100).toFixed(0)}%, attempts: ${result.attempts})`;
  },
};
