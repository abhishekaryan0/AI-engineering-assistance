export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentParams {
  promptText: string;
  sessionId: string;
  fileContext?: string;
  researchMode?: string;
  chatHistory?: ChatMessage[]; // Add chat history for context
  glossaryTerms?: string[]; // Add found glossary terms
  organizationId?: string; // Added organization scope
  userId?: string; // Current user ID
}
