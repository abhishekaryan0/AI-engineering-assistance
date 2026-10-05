import { ClarifyIntentTool } from '../../../../../src/modules/engineering-assistant/tools/clarify/clarify.tool';

describe('ClarifyIntentTool', () => {
  let tool: ClarifyIntentTool;

  beforeEach(() => {
    tool = new ClarifyIntentTool();
  });

  describe('execute', () => {
    it('should generate a formatted clarification string from parameters', async () => {
      const params = { question_to_user: 'Which zone in the west? Offshore or Onshore?' };
      const result = await tool.execute(params);
      expect(result).toBe('CLARIFICATION_REQUIRED: Which zone in the west? Offshore or Onshore?');
    });
  });

  describe('validate', () => {
    it('should return isValid true', () => {
      const result = tool.validate('dummy');
      expect(result).toEqual({ isValid: true });
    });
  });

  describe('getFallbackMessage', () => {
    it('should return static fallback message format', () => {
      const result = tool.getFallbackMessage(new Error('test'));
      expect(result).toBe('Could you please clarify your request with more detail?');
    });
  });

  describe('parameters', () => {
    it('should have the correct parameters structure outlined', () => {
      expect(tool.name).toBe('ask_clarifying_question');
      expect(tool.parameters).toHaveLength(1);
      expect(tool.parameters[0].name).toBe('question_to_user');
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});
