import { userBehaviorService } from '../../../../../src/modules/engineering-assistant/services/personalization/user-behavior.service';
import { intentClassifierService } from '../../../../../src/modules/engineering-assistant/services/core/intent-classifier.service';
import { userPersonalizationService } from '../../../../../src/modules/engineering-assistant/services/personalization/user-personalization.service';
import { userMemoryService } from '../../../../../src/modules/engineering-assistant/services/personalization/user-memory.service';
import { prisma } from '../../../../../src/config/db';
import { llmService } from '../../../../../src/services/llm/llm.service';

jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    chat_user_preferences: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    chat_messages: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chatJson: jest.fn(),
  },
}));

jest.mock(
  '../../../../../src/modules/engineering-assistant/services/personalization/user-memory.service',
  () => ({
    userMemoryService: {
      getLongTermMemory: jest.fn(),
      updateLongTermMemory: jest.fn().mockResolvedValue(undefined),
    },
  })
);

describe('System Verification: User Personalization & Behavior', () => {
  const userId = 'user-1';
  const orgId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Fact Extraction & Memory', () => {
    it('should extract facts from a message and update S3 memory', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue({
        userId,
        frequent_topics: [],
        usage_stats: {},
      });

      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          topics: ['name'],
          detectedStyle: 'professional',
          extractedFacts: { personal_details: 'Name is Manoj' },
        },
      });

      await userBehaviorService.trackInteraction(userId, orgId, 'My name is Manoj', 'chat', []);

      // Verify DB update was called with the extracted fact
      expect(prisma.chat_user_preferences.update).toHaveBeenCalledWith({
        where: { userId },
        data: expect.objectContaining({
          extracted_memory: { personal_details: 'Name is Manoj' },
        }),
      });
    });
  });

  describe('Personalization in Response', () => {
    it('should include learned facts in the personalization prompt', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue({
        userId,
        organization_id: orgId,
        style_alignment: 'professional',
        extracted_memory: { personal_details: 'Name is Manoj' },
      });

      const prompt = await userPersonalizationService.getPersonalizationPrompt(userId, orgId);

      expect(prompt).toContain('Long-term learned facts & local glossary about this user');
      expect(prompt).toContain('personal_details: Name is Manoj');
    });
  });

  describe('Intent Classification Updates', () => {
    it('should allow queries about user identity as domain relevant', async () => {
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          domain_allowed: true,
          intent: 'chat',
          reasoning: 'Personalization query',
        },
      });

      const result = await intentClassifierService.classifyWithEnsemble('tell me my name', [], []);

      expect(result.domain_allowed).toBe(true);
      expect(result.intent).toBe('chat');
    });

    it('should instruct LLM to handle numeric selections from history', async () => {
      // We are checking if the call to LLM contains the instruction we added
      await intentClassifierService.classifyByLLM(
        '1',
        [
          {
            role: 'assistant',
            content: 'Here are options: [SUGGESTIONS]: ["Option A", "Option B"]',
          },
        ],
        []
      );

      const systemPrompt = (llmService.chatJson as jest.Mock).mock.calls[0][0][0].content;
      expect(systemPrompt).toContain('NUMERIC SELECTION:');
      expect(systemPrompt).toContain('[SUGGESTIONS]:');
    });
  });
});
