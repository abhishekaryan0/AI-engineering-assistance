import { AgentSettings } from '../types/type';
import OpenAI from 'openai';

interface PromptParams {
  promptText: string;
  ragContext: string;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  settings?: AgentSettings;
  overrideSystemPrompt?: string;
  image?: string; // ✅ ADDED: Optional Base64 Image string
}

export function buildEngineeringPrompt({
  promptText,
  ragContext,
  history,
  settings,
  overrideSystemPrompt,
  image,
}: PromptParams) {
  const detailLevel = settings?.detailLevel || 0.5;
  const expertise = settings?.expertiseLevel || 'junior_engineer';
  const refsLevel = settings?.referencesLevel || 0.5;

  const systemMsg = `${overrideSystemPrompt || 'You are a helpful AI Assistant.'}

    SETTINGS:
    - Expertise Level: ${expertise}
    - Detail Level: ${detailLevel}
    - Reference Level: ${refsLevel}

    MEMORY & PERSONALIZATION:
    - User Context: Use the "USER CONTEXT & PERCEPTIONS" block ONLY to personalize the communication style and language.
    - Consistency: Treat historical facts (e.g., specific assets like Wells or Equipment) in that block as background knowledge.
    - PRIORITY RULE: Always prioritize the CURRENT Query and provided RAG Context. 
    - Relevance: NEVER mention previous assets (e.g., from memory) unless the user explicitly asks for a comparison or if they are directly relevant to the current topic.
    - Avoid Confusion: Do NOT mix up the current search results with historical data stored in the memory block.

    Use the provided CONTEXT to answer.`;

  let userBlock = `### USER QUERY:\n${promptText}`;

  if (ragContext && ragContext.trim()) {
    userBlock += `\n\n${ragContext}`;
  }

  let userMessageContent: string | OpenAI.Chat.ChatCompletionContentPart[] = userBlock;

  if (image) {
    userMessageContent = [
      { type: 'text', text: userBlock },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${image}`,
        },
      },
    ];
  }

  return [
    { role: 'system', content: systemMsg },
    ...history,
    { role: 'user', content: userMessageContent },
  ] as OpenAI.Chat.ChatCompletionMessageParam[];
}
