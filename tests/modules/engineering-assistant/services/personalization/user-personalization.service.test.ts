import { userPersonalizationService } from '../../../../../src/modules/engineering-assistant/services/personalization/user-personalization.service';
import { prisma } from '../../../../../src/config/db';
import { logger } from '../../../../../src/utils/logger';

jest.mock('../../../../../src/config/db', () => ({
  prisma: {
    chat_user_preferences: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
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

describe('UserPersonalizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserPreferences', () => {
    it('should return existing preferences if found', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue({
        userId: 'user1',
        preferred_format: 'json',
        frequent_topics: ['topic1'],
      });

      const prefs = await userPersonalizationService.getUserPreferences('user1', 'org-123');
      expect(prefs.preferred_format).toBe('json');
      expect(prisma.chat_user_preferences.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user1' },
      });
      expect(prisma.chat_user_preferences.create).not.toHaveBeenCalled();
    });

    it('should create and return default preferences if none exist', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.chat_user_preferences.create as jest.Mock).mockResolvedValue({
        userId: 'user2',
        preferred_format: 'text',
        frequent_topics: [],
      });

      const prefs = await userPersonalizationService.getUserPreferences('user2', 'org-123');
      expect(prisma.chat_user_preferences.create).toHaveBeenCalledWith({
        data: {
          userId: 'user2',
          organization_id: 'org-123',
          preferred_format: 'text',
          frequent_topics: [],
        },
      });
      expect((prefs as any).userId).toBe('user2');
      expect(prefs.preferred_format).toBe('text');
    });

    it('should catch errors and return fallback preferences', async () => {
      (prisma.chat_user_preferences.findUnique as jest.Mock).mockRejectedValue(
        new Error('DB error')
      );

      const prefs = await userPersonalizationService.getUserPreferences('user3', 'org-123');
      expect(logger.error).toHaveBeenCalled();
      expect(prefs).toEqual({
        preferred_format: 'text',
        frequent_topics: [],
        usage_stats: {},
        style_alignment: 'professional',
      });
    });
  });

  describe('getPersonalizationPrompt', () => {
    it('should return a prompt block with frequent topics', async () => {
      jest.spyOn(userPersonalizationService, 'getUserPreferences').mockResolvedValueOnce({
        userId: 'user4',
        preferred_format: 'markdown',
        frequent_topics: ['oil', 'gas'],
      } as any);

      const prompt = await userPersonalizationService.getPersonalizationPrompt('user4');

      expect(prompt).toContain('You are assisting user user4');
      expect(prompt).toContain('The user has a stated preference for markdown formatting');
      expect(prompt).toContain('Key engineering topics of interest for this user: oil, gas');
    });

    it('should handle lacking frequent_topics', async () => {
      jest.spyOn(userPersonalizationService, 'getUserPreferences').mockResolvedValueOnce({
        userId: 'user5',
        preferred_format: 'markdown',
        frequent_topics: [],
      } as any);

      const prompt = await userPersonalizationService.getPersonalizationPrompt('user5');

      expect(prompt).toContain('The user has a stated preference for markdown formatting');
      expect(prompt).not.toContain('Key engineering topics of interest for this user');
    });
  });
});
