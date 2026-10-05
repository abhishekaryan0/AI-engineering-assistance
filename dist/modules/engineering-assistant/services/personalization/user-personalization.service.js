"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPersonalizationService = exports.UserPersonalizationService = void 0;
const db_1 = require("../../../../config/db");
const logger_1 = require("../../../../utils/logger");
class UserPersonalizationService {
    /**
     * Retrieves user preferences. If none exist, initializes default preferences.
     */
    async getUserPreferences(userId, orgId) {
        try {
            let prefs = (await db_1.prisma.chat_user_preferences.findUnique({
                where: { userId },
            }));
            if (!prefs) {
                prefs = (await db_1.prisma.chat_user_preferences.create({
                    data: {
                        userId,
                        organization_id: orgId,
                        preferred_format: 'text',
                        frequent_topics: [],
                    },
                }));
            }
            return prefs;
        }
        catch (error) {
            logger_1.logger.error('Error fetching user preferences:', error);
            // Fallback
            return {
                preferred_format: 'text',
                frequent_topics: [],
                usage_stats: {},
                style_alignment: 'professional',
            };
        }
    }
    /**
     * Generates instructions that can be spliced directly into the Agent's system prompt
     */
    async getPersonalizationPrompt(userId, orgId) {
        const prefs = await this.getUserPreferences(userId, orgId);
        let promptChunk = `\n--- USER CONTEXT & PERCEPTIONS ---\n`;
        promptChunk += `You are assisting user ${userId}.\n`;
        if (prefs.style_alignment) {
            promptChunk += `The user responds best to a ${prefs.style_alignment} communication style.\n`;
        }
        if (prefs.preferred_format && prefs.preferred_format !== 'text') {
            promptChunk += `The user has a stated preference for ${prefs.preferred_format} formatting.\n`;
        }
        if (prefs.frequent_topics &&
            Array.isArray(prefs.frequent_topics) &&
            prefs.frequent_topics.length > 0) {
            promptChunk += `Key engineering topics of interest for this user: ${prefs.frequent_topics.join(', ')}.\n`;
        }
        // 🚀 Hybrid Memory: Use Postgres for "Hot" access (Fast)
        const longTermMemory = prefs.extracted_memory;
        if (longTermMemory &&
            typeof longTermMemory === 'object' &&
            Object.keys(longTermMemory).length > 0) {
            try {
                const facts = Object.entries(longTermMemory)
                    .map(([key, value]) => {
                    if (typeof value === 'object' && value !== null) {
                        return `${key}: ${JSON.stringify(value)}`;
                    }
                    return `${key}: ${value}`;
                })
                    .join(', ');
                if (facts) {
                    promptChunk += `Long-term learned facts & local glossary about this user: ${facts}.\n`;
                }
            }
            catch (e) {
                logger_1.logger.error('Error processing Hot Memory from DB', e);
            }
        }
        promptChunk += `----------------------------------\n`;
        return promptChunk;
    }
}
exports.UserPersonalizationService = UserPersonalizationService;
exports.userPersonalizationService = new UserPersonalizationService();
