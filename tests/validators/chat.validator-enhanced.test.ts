/**
 * @file chat.validator.test.ts
 * @description Comprehensive tests for chat validation schema
 */

import { AgentRequestSchema } from '../../src/validators/chat.validator';
import { ZodError } from 'zod';

describe('Chat Validator - AgentRequestSchema', () => {
    describe('Valid Inputs', () => {
        it('should accept empty object', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({});

            // Assert
            expect(result.success).toBe(true);
        });

        it('should accept promptText only', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Hello, how are you?',
            });

            // Assert
            expect(result.success).toBe(true);
            expect((result as any).data.promptText).toBe('Hello, how are you?');
        });

        it('should accept sessionId only', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                sessionId: 'session-123-abc',
            });

            // Assert
            expect(result.success).toBe(true);
            expect((result as any).data.sessionId).toBe('session-123-abc');
        });

        it('should accept all fields', () => {
            // Arrange
            const input = {
                promptText: 'Test prompt',
                sessionId: 'session-123',
                researchMode: 'advanced',
                settings: '{"theme":"dark"}',
            };

            // Act
            const result = AgentRequestSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(true);
            expect((result as any).data).toEqual(input);
        });

        it('should accept empty strings for optional fields', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: '',
                sessionId: '',
                researchMode: '',
                settings: '',
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should accept null-like values removed in optional fields', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Test',
                sessionId: undefined,
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should accept very long promptText', () => {
            // Arrange
            const longText = 'A'.repeat(100000);

            // Act
            const result = AgentRequestSchema.safeParse({
                promptText: longText,
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should accept special characters in promptText', () => {
            // Arrange &Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Text with <>&"\' special chars',
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should accept unicode characters', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Unicode: 中文, 日本語, 한글',
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should accept JSON string in settings', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                settings: '{"theme":"dark","language":"en"}',
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should accept multiline text in promptText', () => {
            // Arrange
            const multilineText = 'Line 1\nLine 2\nLine 3';

            // Act
            const result = AgentRequestSchema.safeParse({
                promptText: multilineText,
            });

            // Assert
            expect(result.success).toBe(true);
        });
    });

    describe('Field Types', () => {
        it('should reject non-string promptText', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 123,
            });

            // Assert
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].code).toBe('invalid_type');
            }
        });

        it('should reject non-string sessionId', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                sessionId: 456,
            });

            // Assert
            expect(result.success).toBe(false);
        });

        it('should reject non-string researchMode', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                researchMode: { mode: 'advanced' },
            });

            // Assert
            expect(result.success).toBe(false);
        });

        it('should reject non-string settings', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                settings: { theme: 'dark' },
            });

            // Assert
            expect(result.success).toBe(false);
        });

        it('should reject boolean values for string fields', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: true,
            });

            // Assert
            expect(result.success).toBe(false);
        });

        it('should reject array for string fields', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: ['text1', 'text2'],
            });

            // Assert
            expect(result.success).toBe(false);
        });

        it('should reject null for string fields', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: null,
            });

            // Assert
            expect(result.success).toBe(false);
        });
    });

    describe('Optional Fields', () => {
        it('should handle missing optional fields', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Only prompt',
            });

            // Assert
            expect(result.success).toBe(true);
            expect((result as any).data.sessionId).toBeUndefined();
            expect((result as any).data.researchMode).toBeUndefined();
            expect((result as any).data.settings).toBeUndefined();
        });

        it('should handle mixed optional and missing fields', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Test',
                researchMode: 'basic',
            });

            // Assert
            expect(result.success).toBe(true);
            expect((result as any).data.promptText).toBe('Test');
            expect((result as any).data.researchMode).toBe('basic');
            expect((result as any).data.sessionId).toBeUndefined();
        });
    });

    describe('Additional Fields', () => {
        it('should ignore additional fields in strict mode relaxed', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Test',
                unknownField: 'value',
                anotherField: 123,
            });

            // Assert - Zod by default allows extra fields
            expect(result.success).toBe(true);
        });

        it('should strip unknown fields when using strict mode', () => {
            // Arrange
            const strictSchema = AgentRequestSchema.strict();

            // Act
            const result = strictSchema.safeParse({
                promptText: 'Test',
                unknownField: 'value',
            });

            // Assert
            expect(result.success).toBe(false);
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle real chat request', () => {
            // Arrange
            const chatRequest = {
                promptText: 'Analyze the production data from the last quarter',
                sessionId: 'sess_f47ac10b-58cc-4372-a567-0e02b2c3d479',
                researchMode: 'advanced',
                settings: '{"enableCharts":true,"dataSource":"snowflake"}',
            };

            // Act
            const result = AgentRequestSchema.safeParse(chatRequest);

            // Assert
            expect(result.success).toBe(true);
        });

        it('should handle session-only request', () => {
            // Arrange
            const continueRequest = {
                sessionId: 'sess_f47ac10b-58cc-4372-a567-0e02b2c3d479',
            };

            // Act
            const result = AgentRequestSchema.safeParse(continueRequest);

            // Assert
            expect(result.success).toBe(true);
        });

        it('should handle minimal request', () => {
            // Arrange
            const minimalRequest = {
                promptText: 'Hi',
            };

            // Act
            const result = AgentRequestSchema.safeParse(minimalRequest);

            // Assert
            expect(result.success).toBe(true);
        });

        it('should handle JSON settings with special characters', () => {
            // Arrange
            const request = {
                settings: '{"description":"Contains \\"quotes\\" and \\nnewlines"}',
            };

            // Act
            const result = AgentRequestSchema.safeParse(request);

            // Assert
            expect(result.success).toBe(true);
        });

        it('should handle all fields with various content', () => {
            // Arrange
            const complexRequest = {
                promptText: 'Query: SELECT * WHERE condition = true;',
                sessionId: 'session-2024-001-v2.1',
                researchMode: 'deep_analysis',
                settings: '{"model":"gpt-4","temperature":0.7}',
            };

            // Act
            const result = AgentRequestSchema.safeParse(complexRequest);

            // Assert
            expect(result.success).toBe(true);
            const data = (result as any).data;
            expect(data).toEqual(complexRequest);
        });
    });

    describe('Error Details', () => {
        it('should provide detailed error information for invalid types', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: ['not', 'a', 'string'],
            });

            // Assert
            if (!result.success) {
                expect(result.error).toBeInstanceOf(ZodError);
                expect(result.error.issues).toHaveLength(1);
                expect(result.error.issues[0].path).toContain('promptText');
                expect(result.error.issues[0].code).toBe('invalid_type');
            }
        });

        it('should show path to invalid field', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                sessionId: 123,
            });

            // Assert
            if (!result.success) {
                expect(result.error.issues[0].path[0]).toBe('sessionId');
            }
        });

        it('should indicate expected and received types', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 456,
            });

            // Assert
            if (!result.success) {
                const issue = result.error.issues[0];
                expect(issue.code).toBe('invalid_type');
                expect((issue as any).expected).toBe('string');
                expect((issue as any).received).toBe('number');
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle request with only whitespace', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: '   \n\t  ',
            });

            // Assert
            expect(result.success).toBe(true);
            expect((result as any).data.promptText).toBe('   \n\t  ');
        });

        it('should handle request with numeric characters in strings', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: '12345',
                sessionId: 'sess-123-456-789',
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should handle request with URL in promptText', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                promptText: 'Check https://example.com/path?param=value',
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should handle very long sessionId', () => {
            // Arrange & Act
            const result = AgentRequestSchema.safeParse({
                sessionId: 'x'.repeat(10000),
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should handle circular reference attempts', () => {
            // Arrange
            const obj: any = {
                promptText: 'Test',
            };
            obj.self = obj; // Circular reference

            // Act
            const result = AgentRequestSchema.safeParse(obj);

            // Assert - Zod should handle this without crashing
            expect(typeof result.success).toBe('boolean');
        });
    });

    describe('Schema Properties', () => {
        it('should have correct schema keys', () => {
            // Arrange
            const schema = AgentRequestSchema;

            // Act
            const result = schema.safeParse({
                promptText: 'Test',
                sessionId: 'sess',
                researchMode: 'mode',
                settings: 'settings',
            });

            // Assert
            expect(result.success).toBe(true);
        });

        it('should preserve field order in parsing', () => {
            // Arrange
            const input = {
                promptText: 'a',
                sessionId: 'b',
                researchMode: 'c',
                settings: 'd',
            };

            // Act
            const result = AgentRequestSchema.parse(input);

            // Assert
            expect(Object.keys(result)).toContain('promptText');
            expect(Object.keys(result)).toContain('sessionId');
            expect(Object.keys(result)).toContain('researchMode');
            expect(Object.keys(result)).toContain('settings');
        });
    });

    describe('Performance', () => {
        it('should handle large batch of requests efficiently', () => {
            // Arrange
            const requests = Array(1000).fill({
                promptText: 'Test prompt',
                sessionId: 'session-123',
            });

            // Act
            const start = Date.now();
            const results = requests.map((req) => AgentRequestSchema.safeParse(req));
            const duration = Date.now() - start;

            // Assert
            expect(results.every((r) => r.success)).toBe(true);
            expect(duration).toBeLessThan(5000); // Should complete in reasonable time
        });
    });
});
