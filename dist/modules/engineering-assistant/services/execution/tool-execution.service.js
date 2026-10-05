"use strict";
/**
 * Tool Execution Service
 * Handles tool execution with retry logic, validation, and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolExecutionService = void 0;
const ToolRegistry_1 = require("../../tools/ToolRegistry");
const logger_1 = require("../../../../utils/logger");
exports.toolExecutionService = {
    /**
     * Execute tool with automatic retry, timeout, and validation
     */
    async executeToolSafely(toolName, params, maxRetries = 2, timeoutMs = 90000) {
        const startTime = Date.now();
        let lastError = null;
        let attempt = 0;
        logger_1.logger.debug(`🔧 Tool Execution Started: ${toolName}`);
        for (attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                logger_1.logger.debug(`⏱️  Attempt ${attempt + 1}/${maxRetries + 1} for tool: ${toolName}`);
                // Execute with timeout protection
                // Execute with timeout protection
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`Tool execution timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
                });
                let data;
                try {
                    data = await Promise.race([ToolRegistry_1.toolRegistry.executeTool(toolName, params), timeoutPromise]);
                }
                finally {
                    if (timeoutId)
                        clearTimeout(timeoutId);
                }
                // Validate result
                const validationResult = this.validateToolOutput(data, toolName);
                if (!validationResult.isValid) {
                    throw new Error(`Invalid tool output: ${validationResult.reason}`);
                }
                const executionTime = Date.now() - startTime;
                logger_1.logger.info(`✅ Tool execution succeeded: ${toolName} (${executionTime}ms, attempt ${attempt + 1})`);
                return {
                    success: true,
                    data,
                    confidence: 0.95,
                    executionTime,
                    retryAttempt: attempt,
                    toolName,
                    attempts: attempt + 1,
                };
            }
            catch (error) {
                lastError = error;
                logger_1.logger.warn(`⚠️  Attempt ${attempt + 1} failed for ${toolName}: ${lastError.message}`);
                if (attempt < maxRetries) {
                    // Exponential backoff: 100ms, 200ms, 400ms
                    const backoffMs = Math.pow(2, attempt) * 100;
                    logger_1.logger.debug(`⏳ Retrying in ${backoffMs}ms...`);
                    await new Promise((r) => setTimeout(r, backoffMs));
                }
            }
        }
        // All retries exhausted
        const executionTime = Date.now() - startTime;
        logger_1.logger.error(`❌ Tool execution failed after ${attempt} attempts: ${toolName}. Error: ${lastError?.message}`);
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
    validateToolOutput(data, toolName) {
        const tool = ToolRegistry_1.toolRegistry.getTool(toolName);
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
    async getFallbackResponse(toolName, intent, originalError) {
        const tool = ToolRegistry_1.toolRegistry.getTool(toolName);
        if (tool && typeof tool.getFallbackMessage === 'function') {
            return tool.getFallbackMessage(new Error(originalError || 'Unknown error'));
        }
        let fallback = 'The requested tool is temporarily unavailable. Please try again later or contact support if the issue persists.';
        // Add retry suggestion
        if (originalError?.includes('timeout')) {
            fallback += ' The request took too long to process - try a more specific query.';
        }
        return fallback;
    },
    /**
     * Check if tool result looks valid/complete
     */
    isResultComplete(result) {
        if (!result.success)
            return false;
        if (result.confidence < 0.7)
            return false;
        if (result.data.length < 10)
            return false; // Minimum meaningful response
        return true;
    },
    /**
     * Get result summary for logging/monitoring
     */
    getResultSummary(result) {
        return `${result.toolName}: ${result.success ? '✅' : '❌'} (${result.executionTime}ms, confidence: ${(result.confidence * 100).toFixed(0)}%, attempts: ${result.attempts})`;
    },
};
