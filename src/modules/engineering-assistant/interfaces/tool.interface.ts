export interface ToolParameter {
  name: string;
  type: string; // e.g., "string", "number", "ISO Date string"
  description: string;
  required?: boolean;
}

export interface ToolValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolParameter[]; // Used to generate the prompt for the LLM
  execute(params: Record<string, unknown>): Promise<string>;

  /**
   * Validate the output of the tool execution
   */
  validate(data: string): ToolValidationResult;

  /**
   * Get a user-friendly fallback message when execution fails
   */
  getFallbackMessage(error: Error): string;
}
