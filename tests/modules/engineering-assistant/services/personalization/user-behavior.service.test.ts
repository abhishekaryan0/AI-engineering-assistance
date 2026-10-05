import { userBehaviorService } from '../../../../../src/modules/engineering-assistant/services/personalization/user-behavior.service';
import { prisma } from '../../../../../src/config/db';
import { llmService } from '../../../../../src/services/llm/llm.service';
import { logger } from '../../../../../src/utils/logger';
import { ChatMessage } from '../../../../../src/modules/engineering-assistant/interfaces/agent.interface';

jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    chat_user_preferences: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chatJson: jest.fn(),
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock(
  '../../../../../src/modules/engineering-assistant/services/personalization/user-memory.service',
  () => ({
    userMemoryService: {
      getLongTermMemory: jest.fn().mockResolvedValue('{}'),
      updateLongTermMemory: jest.fn().mockResolvedValue(undefined),
    },
  })
);

describe('UserBehaviorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackInteraction', () => {
    const userId = 'user-1';
    const orgId = 'org-1';
    const query = 'Analyze the pressure in well 5';
    const intent = 'research';
    const history: ChatMessage[] = [{ role: 'user', content: 'hello' }];

    it('should create a new profile if one does not exist', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue(null);
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          topics: ['pressure', 'well'],
          detectedStyle: 'technical',
          role: 'Engineer',
          sophistication: 'senior',
        },
      });

      await userBehaviorService.trackInteraction(userId, orgId, query, intent, history);

      expect(prisma.chat_user_preferences.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          organization_id: orgId,
          frequent_topics: ['pressure', 'well'],
          style_alignment: 'technical',
        }),
      });
    });

    it('should update an existing profile', async () => {
      const existingPrefs = {
        userId,
        frequent_topics: ['pump'],
        usage_stats: { chat: 5 },
        style_alignment: 'concise',
      };
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue(existingPrefs);
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          topics: ['pressure'],
          detectedStyle: 'technical',
          role: 'Engineer',
        },
      });

      await userBehaviorService.trackInteraction(userId, orgId, query, intent, history);

      expect(prisma.chat_user_preferences.update).toHaveBeenCalledWith({
        where: { userId },
        data: expect.objectContaining({
          frequent_topics: ['pump', 'pressure'],
          style_alignment: 'technical',
        }),
      });

      const updateData = (prisma.chat_user_preferences.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData.usage_stats).toEqual({ chat: 5, [intent]: 1 });
    });

    it('should handle AI analysis failures with fallback to basic extraction', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue(null);
      (llmService.chatJson as jest.Mock).mockRejectedValue(new Error('AI Failed'));

      // Use a query with known keywords from extractTopics
      const technicalQuery = 'Check the pressure and temperature of the well';
      await userBehaviorService.trackInteraction(userId, orgId, technicalQuery, intent, history);

      expect(logger.error).toHaveBeenCalledWith(
        'AI Behavior Analysis failed, falling back to basic extraction'
      );
      expect(prisma.chat_user_preferences.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          frequent_topics: expect.arrayContaining(['pressure', 'temperature', 'well']),
          style_alignment: 'professional',
        }),
      });
    });

    it('should catch and log errors during tracking', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockRejectedValue(
        new Error('DB Error')
      );

      await userBehaviorService.trackInteraction(userId, orgId, query, intent, history);

      expect(logger.error).toHaveBeenCalledWith(
        'Error in advanced behavior tracking:',
        expect.any(Error)
      );
    });

    it('should handle short queries (e.g., "hi") gracefully', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue(null);
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          topics: [],
          detectedStyle: 'concise',
          role: 'user',
        },
      });

      await userBehaviorService.trackInteraction(userId, orgId, 'hello', 'chat', []);

      expect(prisma.chat_user_preferences.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          frequent_topics: [],
          usage_stats: { chat: 1 },
        }),
      });
    });

    it('should merge topics and limit to 15', async () => {
      const existingTopics = Array.from({ length: 14 }, (_, i) => `topic-${i}`);
      const existingPrefs = {
        userId,
        frequent_topics: existingTopics,
        usage_stats: {},
      };
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue(existingPrefs);
      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          topics: ['new-topic-1', 'new-topic-2'],
          detectedStyle: 'technical',
        },
      });

      await userBehaviorService.trackInteraction(userId, orgId, query, intent, history);

      const updateCall = (prisma.chat_user_preferences.update as jest.Mock).mock.calls[0][0];
      const updatedTopics = updateCall.data.frequent_topics;

      expect(updatedTopics.length).toBe(15);
      expect(updatedTopics).toContain('new-topic-1');
      expect(updatedTopics).toContain('new-topic-2');
      // Should have dropped the oldest topic (topic-0 or topic-1 depending on slice)
    });

    it('should correctly track complex industrial engineering keywords', async () => {
      const complexQuery = 'What is the ESP pump efficiency and discharge pressure for well-102?';
      const expectedTopics = ['esp', 'pump', 'efficiency', 'pressure', 'well'];

      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue({
        userId,
        frequent_topics: ['maintenance'],
        usage_stats: { research: 2 },
      });

      (llmService.chatJson as jest.Mock).mockResolvedValue({
        content: {
          topics: expectedTopics,
          detectedStyle: 'technical',
          role: 'Production Engineer',
          sophistication: 'senior',
        },
      });

      await userBehaviorService.trackInteraction(userId, orgId, complexQuery, 'research', []);

      expect(prisma.chat_user_preferences.update).toHaveBeenCalledWith({
        where: { userId },
        data: expect.objectContaining({
          frequent_topics: expect.arrayContaining(expectedTopics),
          style_alignment: 'technical',
        }),
      });

      const updateData = (prisma.chat_user_preferences.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData.usage_stats.research).toBe(3); // 2 existing + 1 new
    });
  });
});
