import { z } from 'zod';

export const AgentRequestSchema = z.object({
  promptText: z.string().optional(),
  sessionId: z.string().optional(),
  researchMode: z.string().optional(),
  settings: z.string().optional(), // JSON string of settings
});
