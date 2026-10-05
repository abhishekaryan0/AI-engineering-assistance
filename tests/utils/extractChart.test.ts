import { extractChartConfig, removeChartConfig } from '../../src/utils/extractChart';

describe('extractChart', () => {
  describe('extractChartConfig', () => {
    it('should extract from code block', () => {
      const text =
        'Here is the chart:\n```json\n{"chartConfig": {"type": "bar", "data": [1, 2]}}\n```';
      const config: any = extractChartConfig(text);
      expect(config.type).toBe('bar');
    });

    it('should extract type/data format', () => {
      const text = '```json\n{"type": "line", "data": {"vals": [1]}}\n```';
      const config: any = extractChartConfig(text);
      expect(config.type).toBe('line');
    });

    it('should extract without code block using braces', () => {
      const text = 'Some text {"chartConfig": {"type": "pie"}} more text';
      const config: any = extractChartConfig(text);
      expect(config.type).toBe('pie');
    });

    it('should return null if no config found', () => {
      expect(extractChartConfig('just text')).toBeNull();
    });

    it('should handle loose JSON parsing using vm', () => {
      const text = '```json\n{ type: "bar", data: [1] }\n```';
      const config: any = extractChartConfig(text);
      expect(config).toBeDefined();
      expect(config.type).toBe('bar');
    });

    it('should handle loose JSON parsing with array using vm', () => {
      // It's not a common expected format but let's test safeLooseParse fallback for arrays
      const text = '```json\n[ { type: "bar", data: [1] } ]\n```';
      const config: any = extractChartConfig(text);
      expect(config).toBeDefined();
      expect(config.type).toBe('bar');
    });

    it('should handle string escape characters', () => {
      const text = 'Some text {"chartConfig": {"type": "pie", "label": "a \\" b"}} more';
      const config: any = extractChartConfig(text);
      expect(config.label).toBe('a " b');
    });

    it('should skip invalid JSON inside braces without throwing', () => {
      const text = 'Some text { invalid } more text {"chartConfig": {"type": "pie"}}';
      const config: any = extractChartConfig(text);
      expect(config.type).toBe('pie');
    });

    it('should return null on completely malformed JSON block', () => {
      const text = '```json\n{ chartConfig: { missing_bracket }\n```';
      expect(extractChartConfig(text)).toBeNull();
    });

    it('should handle global catch block gracefully', () => {
      // By passing null or ignoring TS we can force text.matchAll to fail
      const result = extractChartConfig(null as any);
      expect(result).toBeNull();
    });

    it('should sanitize circular structures', () => {
      const circular: any = { type: 'bar' };
      circular.data = circular;
      // To test sanitizeChartData's catch block, we need to pass a JSON object that has a circular reference.
      // But safeLooseParse parses a string. So we can't really pass a circular reference stringified because that's impossible.
      // Let's just mock JSON.stringify in sanitizeChartData implicitly:
      jest.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
        throw new Error('mock');
      });
      const text = '```json\n{"type": "bar", "data": [1, 2]}\n```';
      const config = extractChartConfig(text);
      expect(config).toBeNull();
      jest.restoreAllMocks();
    });
  });

  describe('removeChartConfig', () => {
    it('should remove chart config from text', () => {
      const text = 'Part 1\n```json\n{"chartConfig": {"foo": "bar"}}\n```\nPart 2';
      const cleaned = removeChartConfig(text);
      expect(cleaned).toBe('Part 1\n\nPart 2');
    });

    it('should remove inline config', () => {
      const text = 'Before {"type": "line", "data": {}} After';
      const cleaned = removeChartConfig(text);
      expect(cleaned).toContain('Before');
      expect(cleaned).toContain('After');
      expect(cleaned).not.toContain('"type": "line"');
    });

    it('should leave non-chart valid json intact', () => {
      const text = 'Before {"key": "value"} After';
      const cleaned = removeChartConfig(text);
      expect(cleaned).toContain('{"key": "value"}');
    });

    it('should handle global error safely', () => {
      const cleaned = removeChartConfig(null as any);
      expect(cleaned).toBeNull(); // because the catch block returns text (which is null)
    });
  });
});
