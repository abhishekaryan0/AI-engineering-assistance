/**
 * @file text.utils.test.ts
 * @description Comprehensive tests for text utility functions
 */

import { cleanResponseText, processAIResponse } from '../../src/utils/text.utils';

describe('Text Utilities', () => {
    describe('cleanResponseText', () => {
        describe('Basic Functionality', () => {
            it('should clean empty string', () => {
                // Arrange & Act
                const result = cleanResponseText('');

                // Assert
                expect(result).toBe('');
            });

            it('should return empty string for null-like input', () => {
                // Arrange & Act
                const result = cleanResponseText('');

                // Assert
                expect(result).toBe('');
            });

            it('should clean simple text without markup', () => {
                // Arrange
                const input = 'This is simple text';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBe('This is simple text');
            });

            it('should preserve normal markdown links', () => {
                // Arrange
                const input = 'Check [this link](https://example.com) for details';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[this link](https://example.com)');
            });

            it('should remove numeric citations [1]', () => {
                // Arrange
                const input = 'Some text[1] with citation[2]';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).not.toContain('[1]');
                expect(result).not.toContain('[2]');
                expect(result).toContain('Some text with citation');
            });
        });

        describe('Markdown Link Protection', () => {
            it('should preserve single markdown link', () => {
                // Arrange
                const input = 'See [documentation](https://docs.example.com)';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[documentation](https://docs.example.com)');
            });

            it('should preserve multiple markdown links', () => {
                // Arrange
                const input = 'Check [link1](https://ex1.com) and [link2](https://ex2.com)';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[link1](https://ex1.com)');
                expect(result).toContain('[link2](https://ex2.com)');
            });

            it('should preserve markdown links with special characters in URL', () => {
                // Arrange
                const input = 'See [docs](https://example.com/path?param=value&other=123)';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[docs](https://example.com/path?param=value&other=123)');
            });

            it('should preserve markdown links with anchor', () => {
                // Arrange
                const input = 'Jump to [section](https://example.com#section)';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[section](https://example.com#section)');
            });

            it('should handle mixed markdown links and citations', () => {
                // Arrange
                const input = 'Text[1] with [link](https://example.com) and more[2]';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[link](https://example.com)');
                expect(result).not.toContain('[1]');
                expect(result).not.toContain('[2]');
            });
        });

        describe('Citation Removal', () => {
            it('should remove simple numeric citations', () => {
                // Arrange
                const input = 'This is text[1] with citations[2][3]';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).not.toContain('[1]');
                expect(result).not.toContain('[2]');
                expect(result).not.toContain('[3]');
                expect(result).toContain('This is text with citations');
            });

            it('should remove numbered source format [1: source]', () => {
                // Arrange
                const input = 'Information[1: https://source.com] from source';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).not.toContain('[1:');
                expect(result).not.toContain('https://source.com]');
            });

            it('should remove GLOSSARY TERMS markers', () => {
                // Arrange
                const input = 'Term explanation [GLOSSARY TERMS] in text';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).not.toContain('[GLOSSARY TERMS]');
                expect(result).toContain('Term explanation');
            });

            it('should remove Source citations', () => {
                // Arrange
                const input = 'Data[Source 1] and [Source 2] from sources';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).not.toContain('[Source 1]');
                expect(result).not.toContain('[Source 2]');
            });

            it('should handle case insensitive GLOSSARY removal', () => {
                // Arrange
                const inputs = [
                    'Text [GLOSSARY TERMS] here',
                    'Text [glossary terms] here',
                    'Text [Glossary Terms] here',
                ];

                // Act & Assert
                inputs.forEach((input) => {
                    const result = cleanResponseText(input);
                    expect(result.toLowerCase()).not.toContain('[glossary');
                });
            });
        });

        describe('Escaped Newline Handling', () => {
            it('should convert escaped newlines to actual newlines', () => {
                // Arrange
                const input = 'Line 1\\nLine 2\\nLine 3';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBe('Line 1\nLine 2\nLine 3');
            });

            it('should preserve actual newlines', () => {
                // Arrange
                const input = 'Line 1\nLine 2\nLine 3';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBe('Line 1\nLine 2\nLine 3');
            });

            it('should handle mixed newline styles', () => {
                // Arrange
                const input = 'Line 1\\nLine 2\nLine 3';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('\n');
            });
        });

        describe('Consecutive Newline Normalization', () => {
            it('should limit 3+ newlines to 2', () => {
                // Arrange
                const input = 'Text\n\n\nMore text';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).not.toContain('\n\n\n');
                expect(result).toContain('\n\n');
            });

            it('should handle multiple excessive newlines', () => {
                // Arrange
                const input = 'A\n\n\n\n\nB\n\n\n\nC';

                // Act
                const result = cleanResponseText(input);

                // Assert
                const matches = result.match(/\n{3,}/);
                expect(matches).toBeNull();
            });

            it('should preserve double newlines (paragraph breaks)', () => {
                // Arrange
                const input = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBe('Paragraph 1\n\nParagraph 2\n\nParagraph 3');
            });
        });

        describe('Trim and Whitespace', () => {
            it('should trim leading whitespace', () => {
                // Arrange
                const input = '   Text with leading spaces';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBe('Text with leading spaces');
            });

            it('should trim trailing whitespace', () => {
                // Arrange
                const input = 'Text with trailing spaces   \n  ';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBe('Text with trailing spaces');
            });

            it('should trim both ends', () => {
                // Arrange
                const input = '   Text in middle   \n';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBe('Text in middle');
            });
        });

        describe('Complex Scenarios', () => {
            it('should handle complex text with multiple elements', () => {
                // Arrange
                const input = `
        Text[1] with [link](https://example.com)[2] and more.
        
        
        Another paragraph[Source 1] here.
        `;

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[link](https://example.com)');
                expect(result).not.toContain('[1]');
                expect(result).not.toContain('[2]');
                expect(result).not.toContain('[Source 1]');
                expect(result).not.toContain('\n\n\n');
            });

            it('should handle markdown code blocks', () => {
                // Arrange
                const input = '```\nCode[1] here\n```';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('```');
                expect(result).toContain('Code here'); // Citation removed
            });

            it('should handle bold and italic markdown', () => {
                // Arrange
                const input = 'This is **bold[1]** and *italic[2]* text[3]';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('**bold**');
                expect(result).toContain('*italic*');
            });
        });

        describe('Edge Cases', () => {
            it('should handle very long text', () => {
                // Arrange
                const input = 'Word '.repeat(10000) + 'end';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toBeDefined();
                expect(result.length).toBeGreaterThan(0);
            });

            it('should handle unicode characters', () => {
                // Arrange
                const input = 'Text with émojis 🎉 and special chars ñ ü[1]';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('émojis');
                expect(result).toContain('🎉');
            });

            it('should handle URLs without protocol', () => {
                // Arrange
                const input = '[link](example.com)[1]';

                // Act
                const result = cleanResponseText(input);

                // Assert
                expect(result).toContain('[link](example.com)');
                expect(result).not.toContain('[1]');
            });
        });
    });

    describe('processAIResponse', () => {
        describe('Basic Functionality', () => {
            it('should process text without chart config', () => {
                // Arrange
                const input = 'Just plain text response';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result).toHaveProperty('response');
                expect(result).toHaveProperty('chartData');
                expect(result.response).toContain('Just plain text response');
                expect(result.chartData).toBeNull();
            });

            it('should return object with response and chartData properties', () => {
                // Arrange
                const input = 'Simple response';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result).toHaveProperty('response');
                expect(result).toHaveProperty('chartData');
                expect(typeof result.response).toBe('string');
                expect(
                    result.chartData === null || typeof result.chartData === 'object'
                ).toBe(true);
            });
        });

        describe('Response Cleaning', () => {
            it('should clean response text', () => {
                // Arrange
                const input = 'Response[1] text[2]';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result.response).not.toContain('[1]');
                expect(result.response).not.toContain('[2]');
            });

            it('should preserve markdown links in response', () => {
                // Arrange
                const input = 'Check [documentation](https://docs.com) for details[1]';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result.response).toContain('[documentation](https://docs.com)');
                expect(result.response).not.toContain('[1]');
            });
        });

        describe('Return Value Structure', () => {
            it('should return object with response key', () => {
                // Arrange
                const input = 'Test';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result).toHaveProperty('response');
                expect(typeof result.response).toBe('string');
            });

            it('should return object with chartData key', () => {
                // Arrange
                const input = 'Test';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result).toHaveProperty('chartData');
            });

            it('should have no additional properties', () => {
                // Arrange
                const input = 'Test';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(Object.keys(result)).toEqual(['response', 'chartData']);
            });
        });

        describe('Chart Data Handling', () => {
            it('should return null chartData when no config present', () => {
                // Arrange
                const input = 'Regular text without chart config';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result.chartData).toBeNull();
            });

            // Note: Without seeing extractChartConfig implementation,
            // we can't test extraction fully, but we can test the structure
            it('should maintain response integrity', () => {
                // Arrange
                const input = 'Complete response text';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result.response).toBeDefined();
                expect(typeof result.response).toBe('string');
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty string', () => {
                // Arrange
                const input = '';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result).toHaveProperty('response');
                expect(result).toHaveProperty('chartData');
            });

            it('should handle very long response', () => {
                // Arrange
                const input = 'Text '.repeat(5000);

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result.response).toBeDefined();
                expect(result.response.length).toBeGreaterThan(0);
            });

            it('should handle special characters', () => {
                // Arrange
                const input = 'Text with <>&"\'[1] special chars';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result.response).toBeDefined();
                expect(result.response).toContain('special chars');
            });

            it('should handle unicode characters', () => {
                // Arrange
                const input = 'Unicode: 中文, 日本語, 한글[1]';

                // Act
                const result = processAIResponse(input);

                // Assert
                expect(result.response).toContain('中文');
                expect(result.response).toContain('日本語');
                expect(result.response).toContain('한글');
            });

            it('should handle multiple consecutive calls', () => {
                // Arrange
                const inputs = [
                    'First response[1]',
                    'Second response[2]',
                    'Third response[3]',
                ];

                // Act
                const results = inputs.map((input) => processAIResponse(input));

                // Assert
                expect(results).toHaveLength(3);
                results.forEach((result) => {
                    expect(result).toHaveProperty('response');
                    expect(result).toHaveProperty('chartData');
                });
            });
        });
    });
});
