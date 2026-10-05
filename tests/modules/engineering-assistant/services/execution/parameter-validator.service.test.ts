/**
 * Parameter Validator Service Tests
 * Tests for tool parameter extraction and validation
 */

import {
  parameterValidatorService,
  ParameterValidationResult,
} from '../../../../../src/modules/engineering-assistant/services/execution/parameter-validator.service';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { logger } from '../../../../../src/utils/logger';
import { AgentTool } from '../../../../../src/modules/engineering-assistant/interfaces/tool.interface';

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chatJson: jest.fn(),
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../../src/config/config', () => ({
  env: {
    AI_MODEL_DECISION: 'gpt-4o-mini',
  },
}));

describe('Parameter Validator Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTool: AgentTool = {
    name: 'search_anomalies',
    description: 'Search for well anomalies in date range',
    parameters: [
      { name: 'well_id', type: 'string', required: true, description: 'ID of the well' },
      { name: 'start_date', type: 'date', required: true, description: 'Start date (YYYY-MM-DD)' },
      { name: 'end_date', type: 'date', required: false, description: 'End date (YYYY-MM-DD)' },
      { name: 'severity', type: 'enum', required: false, description: 'Anomaly severity level' },
    ],
    execute: jest.fn(),
    validate: jest.fn(),
    getFallbackMessage: jest.fn(),
  };

  describe('extractAndValidateParameters', () => {
    it('should extract parameters from prompt', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
            end_date: '2024-12-31',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Show me anomalies for well WELL_001 in 2024',
        mockTool
      );

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('params');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('executionTime');
    });

    it('should mark as invalid when required parameters are missing', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            start_date: '2024-01-01', // missing well_id
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Show me anomalies',
        mockTool
      );

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate parameter types', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
            end_date: '2024-12-31',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Find anomalies for WELL_001',
        mockTool
      );

      expect(typeof result.params.well_id).toBe('string');
    });

    it('should handle optional parameters', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
            // end_date is optional, not provided
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Anomalies for WELL_001 from January',
        mockTool
      );

      expect(result.isValid || result.errors.length === 0).toBe(true);
    });

    it('should include chat history context', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
          },
        },
      });

      const chatHistory = [
        { role: 'user' as const, content: 'Focus on WELL_001' },
        { role: 'assistant' as const, content: 'Understood' },
      ];

      await parameterValidatorService.extractAndValidateParameters(
        'Show anomalies',
        mockTool,
        chatHistory
      );

      const call = (llmService.chatJson as jest.Mock).mock.calls[0];
      const messages = call[0];
      expect(JSON.stringify(messages)).toContain('WELL_001');
    });

    it('should measure execution time', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get anomalies',
        mockTool
      );

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should set confidence score', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
            end_date: '2024-12-31',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get anomalies for WELL_001',
        mockTool
      );

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle LLM errors gracefully', async () => {
      (llmService.chatJson as jest.Mock).mockRejectedValue(new Error('LLM Service Error'));

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get anomalies',
        mockTool
      );

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
    });

    it('should report type validation errors', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: 'not-a-date', // invalid date
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get anomalies',
        mockTool
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('start_date');
    });

    it('should report warnings', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'a'.repeat(1001), // warning for string length > 1000
            start_date: '2024-01-01',
          },
        },
      });

      // Update mock tool definition to allow string parameter checking for length warning
      // The current mock tool has well_id as string.

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get anomalies',
        mockTool
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('well_id');
    });
  });

  describe('Parameter type handling', () => {
    it('should handle string parameters', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_123',
            start_date: '2024-01-01',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Search WELL_123',
        mockTool
      );

      expect(result.params.well_id).toBe('WELL_123');
    });

    it('should handle date parameters', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
            end_date: '2024-12-31',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Anomalies in 2024',
        mockTool
      );

      expect(new Date(result.params.start_date as string).toISOString()).toContain('2024-01-01');
    });

    it('should handle enum parameters', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
            severity: 'high',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'High severity anomalies',
        mockTool
      );

      expect(result.params.severity).toBe('high');
    });
  });

  describe('Date range handling', () => {
    it('should convert "last week" to date range', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-12-19',
            end_date: '2024-12-26',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Anomalies last week',
        mockTool
      );

      expect(result.params.start_date).toBeDefined();
      expect(result.params.end_date).toBeDefined();
    });

    it('should handle relative dates', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-12-19',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Anomalies today',
        mockTool
      );

      expect(result.params.start_date).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty prompt', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {},
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters('', mockTool);

      expect(result).toHaveProperty('isValid');
    });

    it('should handle very long prompt', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
          },
        },
      });

      const longPrompt = 'a'.repeat(10000) + ' for WELL_001';
      const result = await parameterValidatorService.extractAndValidateParameters(
        longPrompt,
        mockTool
      );

      expect(result).toHaveProperty('isValid');
    });

    it('should handle special characters in parameters', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: "WELL_001'DROP--",
            start_date: '2024-01-01',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Anomalies',
        mockTool
      );

      expect(result).toHaveProperty('isValid');
    });

    it('should handle malformed chat history', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
          },
        },
      });

      const malformedHistory = [
        { role: 'user' as const, content: 'Test' },
        { role: 'invalid' as any, content: 'Bad' },
      ];

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get data',
        mockTool,
        malformedHistory
      );

      expect(result).toHaveProperty('isValid');
    });

    it('should handle missing LLM response property', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue(null);

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get data',
        mockTool
      );

      expect(result).toHaveProperty('isValid');
    });
  });

  describe('Validation result structure', () => {
    it('should return all required properties', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          tool: 'search_anomalies',
          params: {
            well_id: 'WELL_001',
            start_date: '2024-01-01',
          },
        },
      });

      const result = await parameterValidatorService.extractAndValidateParameters(
        'Get anomalies',
        mockTool
      );

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('params');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('executionTime');

      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.executionTime).toBe('number');
    });
  });

  describe('getSummary', () => {
    it('should return valid summary string', () => {
      const result: ParameterValidationResult = {
        isValid: true,
        params: {},
        errors: [],
        warnings: ['Warning 1'],
        confidence: 0.9,
        executionTime: 100,
      };
      const summary = parameterValidatorService.getSummary(result);
      expect(summary).toContain('✅ Valid');
      expect(summary).toContain('90%');
      expect(summary).toContain('1 warnings');
    });

    it('should return invalid summary string', () => {
      const result: ParameterValidationResult = {
        isValid: false,
        params: {},
        errors: ['Error 1', 'Error 2'],
        warnings: [],
        confidence: 0,
        executionTime: 100,
      };
      const summary = parameterValidatorService.getSummary(result);
      expect(summary).toContain('❌ Invalid');
      expect(summary).toContain('Error 1; Error 2');
    });
  });

  describe('validateAndConvertType', () => {
    it('should handle "last week" date string', () => {
      const result = parameterValidatorService.validateAndConvertType(
        'last week',
        'date',
        'start_date'
      );
      expect(result.isValid).toBe(true);
      expect(result.converted).toBeDefined();
    });

    it('should handle "last month" date string', () => {
      const result = parameterValidatorService.validateAndConvertType(
        'last month',
        'date',
        'start_date'
      );
      expect(result.isValid).toBe(true);
    });

    it('should handle "today" date string', () => {
      const result = parameterValidatorService.validateAndConvertType(
        'today',
        'date',
        'start_date'
      );
      expect(result.isValid).toBe(true);
    });

    it('should handle "yesterday" date string', () => {
      const result = parameterValidatorService.validateAndConvertType(
        'yesterday',
        'date',
        'start_date'
      );
      expect(result.isValid).toBe(true);
    });

    it('should fail on invalid date string', () => {
      const result = parameterValidatorService.validateAndConvertType(
        'not-a-date',
        'date',
        'start_date'
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid date format');
    });

    it('should parse number strings', () => {
      const result = parameterValidatorService.validateAndConvertType('123.45', 'number', 'limit');
      expect(result.isValid).toBe(true);
      expect(result.converted).toBe(123.45);
    });

    it('should fail on invalid number strings', () => {
      const result = parameterValidatorService.validateAndConvertType('abc', 'number', 'limit');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Expected number');
    });

    it('should pass through number values', () => {
      const result = parameterValidatorService.validateAndConvertType(123, 'number', 'limit');
      expect(result.isValid).toBe(true);
      expect(result.converted).toBe(123);
    });

    it('should fail on empty strings', () => {
      const result = parameterValidatorService.validateAndConvertType('', 'string', 'name');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Empty string');
    });

    it('should warn on long strings', () => {
      const longStr = 'a'.repeat(1001);
      const result = parameterValidatorService.validateAndConvertType(longStr, 'string', 'desc');
      expect(result.isValid).toBe(true);
      expect(result.warning).toContain('may be too long');
    });

    it('should pass through unknown types', () => {
      const result = parameterValidatorService.validateAndConvertType(true, 'boolean', 'flag');
      expect(result.isValid).toBe(true);
      expect(result.converted).toBe(true);
    });
  });

  describe('validateParameterLogic', () => {
    it('should catch startDate > endDate', () => {
      const params = {
        startDate: '2024-01-02',
        endDate: '2024-01-01',
      };
      const errors = parameterValidatorService.validateParameterLogic(params);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('startDate must be BEFORE endDate');
    });

    it('should catch invalid date formats', () => {
      let errors = parameterValidatorService.validateParameterLogic({
        startDate: 'invalid-date',
        endDate: '2024-01-01',
      });
      expect(errors[0]).toContain('Invalid startDate format');

      errors = parameterValidatorService.validateParameterLogic({
        startDate: '2024-01-01',
        endDate: 'invalid-date',
      });
      expect(errors[0]).toContain('Invalid endDate format');
    });

    it('should warn if startDate == endDate', () => {
      const params = {
        startDate: '2024-01-01',
        endDate: '2024-01-01',
      };
      parameterValidatorService.validateParameterLogic(params);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('startDate equals endDate'));
    });

    it('should warn if large date range', () => {
      const params = {
        startDate: '2020-01-01',
        endDate: '2024-01-01',
      };
      parameterValidatorService.validateParameterLogic(params);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Large date range'));
    });

    it('should warn if end date is in future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const params = {
        startDate: '2024-01-01',
        endDate: futureDate.toISOString().split('T')[0],
      };
      parameterValidatorService.validateParameterLogic(params);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('End date is in the future')
      );
    });

    it('should catch invalid limit', () => {
      let errors = parameterValidatorService.validateParameterLogic({ limit: 'abc' });
      expect(errors[0]).toContain('must be a number');

      errors = parameterValidatorService.validateParameterLogic({ limit: -1 });
      expect(errors[0]).toContain('must be >= 1');
    });

    it('should cap limit at 1000', () => {
      const params = { limit: 2000 };
      parameterValidatorService.validateParameterLogic(params);
      expect(params.limit).toBe(1000);
      // Should also warn? Function calls logger.push? No, errors.push for errors, but modifying params in place
      // The code: errors.push(`⚠️ ...`) AND params.limit = 1000;
      // Wait, line 293: errors.push(`⚠️ ...`) ?
      // If it pushes to errors, isValid will be false in extractAndValidateParameters logic?
      // Line 116: if (crossErrors.length > 0) errors.push...
      // So warnings are treated as errors here?
      // "⚠️ limit requested..." - this looks like a warning but it's pushed to errors array in the service code.
      expect(params.limit).toBe(1000);
    });

    it('should warn if startDate only', () => {
      parameterValidatorService.validateParameterLogic({ startDate: '2024-01-01' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('startDate specified without endDate')
      );
    });

    it('should warn if endDate only', () => {
      parameterValidatorService.validateParameterLogic({ endDate: '2024-01-01' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('endDate specified without startDate')
      );
    });

    it('should warn if maxPressure is too high', () => {
      parameterValidatorService.validateParameterLogic({ minPressure: 0, maxPressure: 15000 });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('exceeds typical well pressures')
      );
    });

    it('should validate pressure bounds', () => {
      let errors = parameterValidatorService.validateParameterLogic({
        minPressure: 100,
        maxPressure: 50,
      });
      expect(errors[0]).toContain('minPressure (100) must be <= maxPressure (50)');

      errors = parameterValidatorService.validateParameterLogic({
        minPressure: -1,
        maxPressure: 10,
      });
      expect(errors[0]).toContain('Pressure values cannot be negative');
    });

    it('should validate temperature bounds', () => {
      let errors = parameterValidatorService.validateParameterLogic({
        minTemperature: 100,
        maxTemperature: 50,
      });
      expect(errors[0]).toContain('minTemperature (100°F) must be <= maxTemperature (50°F)');

      // Warning expectation
      parameterValidatorService.validateParameterLogic({
        minTemperature: -100,
        maxTemperature: 600,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Temperature out of typical range')
      );
    });

    it('should validate well_id strictness', () => {
      let errors = parameterValidatorService.validateParameterLogic({ well_id: '   ' });
      expect(errors[0]).toContain('well_id cannot be empty');

      errors = parameterValidatorService.validateParameterLogic({ well_id: 'Invalid@Char' });
      expect(errors[0]).toContain('well_id contains invalid characters');
    });

    it('should catch well_id too long', () => {
      const longId = 'a'.repeat(101);
      const errors = parameterValidatorService.validateParameterLogic({ well_id: longId });
      expect(errors[0]).toContain(`well_id too long`);
    });

    it('should validate assetType', () => {
      parameterValidatorService.validateParameterLogic({ assetType: 'unknown_type' });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown assetType'));
    });

    it('should validate confidence', () => {
      let errors = parameterValidatorService.validateParameterLogic({ confidence: 1.5 });
      expect(errors[0]).toContain('must be between 0 and 1');

      errors = parameterValidatorService.validateParameterLogic({ confidence: 'invalid' });
      expect(errors[0]).toContain('must be a number');
    });

    it('should apply default limit for Anomaly tool', () => {
      const params: any = {};
      parameterValidatorService.validateParameterLogic(params, 'Anomaly Tool');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Anomaly tool used without limit')
      );
      expect(params.limit).toBe(50);
    });

    it('should handle unexpected errors', () => {
      // Create a params object that throws error when accessed
      const errorParams = {
        get startDate() {
          throw new Error('Unexpected error');
        },
      };
      const errors = parameterValidatorService.validateParameterLogic(errorParams);
      expect(errors[0]).toContain('Logic validation error');
      expect(errors[0]).toContain('Unexpected error');
    });
  });
});
