import { ChatMessage } from '../../interfaces/agent.interface';
import { urlValidator } from '../../../../services/utils/url.validator';

export interface ActionContext {
  promptText: string;
  searchResult: { results: any[]; usage?: any }; // Be specific if possible
  chatHistory: ChatMessage[];
  fileContext: string;
  hasFile: boolean;
  glossaryTerms: string[];
  isDeep: boolean;
  isWeb: boolean;
  currentContext: string; // The base context (history + file list) so we can append to it
  organizationId?: string; // Scope for organization data
  userId?: string; // Current user performing the action
}

export interface ActionResult {
  systemInstruction: string;
  context: string;
}

export interface AgentActionHandler {
  handle(context: ActionContext): Promise<ActionResult>;
}

export async function formatRAGResults(
  results: Array<{ content: string; metadata?: Record<string, unknown>; similarity?: number }>
): Promise<string> {
  if (!Array.isArray(results) || results.length === 0) return '';

  const formatted = await Promise.all(
    results.map(async (r, index) => {
      let sourceInfo = `[Source ${index + 1}]: ${r.content}`;
      const metadata = r.metadata as { filename?: string; url?: string } | undefined;

      if (metadata && metadata.filename) {
        sourceInfo += ` (File: ${metadata.filename})`;
      }

      if (metadata && metadata.url) {
        const rawUrl = metadata.url as string;
        if (urlValidator.isTrustedDomain(rawUrl)) {
          const validUrl = await urlValidator.cleanUrl(rawUrl);
          if (validUrl) sourceInfo += ` [${validUrl}]`;
        }
      }
      return sourceInfo;
    })
  );
  return formatted.join('\n\n');
}
