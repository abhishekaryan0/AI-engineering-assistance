/**
 * Text Handler Tests
 * Tests for plain text file processing
 */

import { TextHandler } from '../../../src/services/handlers/text.handler';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Text Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should return plain text as is', () => {
      const buffer = Buffer.from('Plain text content');
      const result = TextHandler.process(buffer, 'text/plain');

      expect(result).toBe('Plain text content');
    });

    it('should format JSON content', () => {
      const jsonObject = { key: 'value', nested: { id: 1 } };
      const buffer = Buffer.from(JSON.stringify(jsonObject));

      const result = TextHandler.process(buffer, 'application/json');
      const parsed = JSON.parse(result);

      expect(parsed).toEqual(jsonObject);
    });

    it('should handle invalid JSON gracefully', () => {
      const buffer = Buffer.from('{ invalid json }');
      const result = TextHandler.process(buffer, 'application/json');

      expect(result).toBe('{ invalid json }');
    });

    it('should handle CSV content', () => {
      const csvData = 'id,name\n1,Test\n2,User';
      const buffer = Buffer.from(csvData);
      const result = TextHandler.process(buffer, 'text/csv');

      expect(result).toBe(csvData);
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from('');
      const result = TextHandler.process(buffer, 'text/plain');

      expect(result).toBe('');
    });

    it('should handle special characters', () => {
      const text = 'Text with !@#$%^&*() special chars';
      const buffer = Buffer.from(text);
      const result = TextHandler.process(buffer, 'text/plain');

      expect(result).toBe(text);
    });

    it('should handle unicode characters', () => {
      const text = 'Unicode: é, à, ü, ñ, ç';
      const buffer = Buffer.from(text);
      const result = TextHandler.process(buffer, 'text/plain');

      expect(result).toBe(text);
    });

    it('should handle newlines and whitespace', () => {
      const text = 'Line 1\n  Line 2  \r\nLine 3';
      const buffer = Buffer.from(text);
      const result = TextHandler.process(buffer, 'text/plain');

      expect(result).toBe(text);
    });

    it('should handle various mime types as plain text fallback', () => {
      const buffer = Buffer.from('Content');
      // Random mime type
      const result = TextHandler.process(buffer, 'application/x-unknown');
      expect(result).toBe('Content');
    });

    it('should handle null buffer gracefully (by throwing in Buffer.toString)', () => {
      expect(() => TextHandler.process(null as any, 'text/plain')).toThrow();
    });
  });
});
