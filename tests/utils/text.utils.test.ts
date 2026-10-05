import { cleanResponseText, processAIResponse } from '../../src/utils/text.utils';

describe('textUtils', () => {
  describe('cleanResponseText', () => {
    it('should remove numeric citations [1], [2] but keep markdown links', () => {
      const text = 'This is true [1]. Check this [Google](https://google.com).';
      const cleaned = cleanResponseText(text);
      expect(cleaned).toBe('This is true . Check this [Google](https://google.com).');
    });

    it('should remove boilerplate markers', () => {
      const text = '[GLOSSARY TERMS]\n[Source 1] Content';
      const cleaned = cleanResponseText(text);
      expect(cleaned).toBe('Content');
    });

    it('should normalize newlines', () => {
      const text = 'Line 1\n\n\n\nLine 2';
      const cleaned = cleanResponseText(text);
      expect(cleaned).toBe('Line 1\n\nLine 2');
    });
  });

  describe('processAIResponse', () => {
    it('should extract chart and clean text', () => {
      const text =
        'Look at this bar chart:\n```json\n{"type": "bar", "data": [1, 2]}\n```\nCool right?';
      const result = processAIResponse(text);

      expect(result.chartData).toEqual({ type: 'bar', data: [1, 2] });
      expect(result.response).toContain('Look at this bar chart:');
      expect(result.response).not.toContain('```json');
    });
  });
});
