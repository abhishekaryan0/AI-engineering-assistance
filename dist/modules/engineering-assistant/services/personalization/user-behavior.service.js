"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userBehaviorService = exports.UserBehaviorService = void 0;
const db_1 = require("../../../../config/db");
const logger_1 = require("../../../../utils/logger");
const llm_service_1 = require("../../../../services/llm/llm.service");
const config_1 = require("../../../../config/config");
class UserBehaviorService {
    /**
     * Advanced AI-Powered Behavior Tracking
     */
    async trackInteraction(userId, orgId, query, intent, history, searchResult) {
        try {
            if (query.trim().length < 5)
                return; // Ignore very short queries
            logger_1.logger.debug(`🧠 Advanced tracking for user ${userId}...`);
            // 1. Fetch current profile
            const prefs = (await db_1.prisma.chat_user_preferences.findUnique({
                where: { userId },
            }));
            // 2. Fetch current memory (DB is now the primary and only storage)
            const dbMemory = prefs?.extracted_memory || {};
            const memoryStr = JSON.stringify(dbMemory);
            // 3. Fast AI Analysis (Now includes Search Context for deeper learning)
            const aiAnalysis = await this.analyzeBehaviorWithAI(query, intent, history, memoryStr, searchResult);
            if (!prefs) {
                await db_1.prisma.chat_user_preferences.create({
                    data: {
                        userId,
                        organization_id: orgId,
                        frequent_topics: aiAnalysis.topics,
                        style_alignment: aiAnalysis.detectedStyle || 'professional',
                        usage_stats: { [intent]: 1 },
                        extracted_memory: aiAnalysis.extractedFacts || {},
                    },
                });
                return;
            }
            // 3. Merging AI Analysis with Existing Profile
            const existingTopics = prefs.frequent_topics || [];
            const updatedTopics = Array.from(new Set([...existingTopics, ...aiAnalysis.topics])).slice(-15);
            const usageStats = prefs.usage_stats || {};
            usageStats[intent] = (usageStats[intent] || 0) + 1;
            // 4. Persistence (DB update - Exclusive High Performance Storage)
            const updatedMemory = {
                ...(prefs.extracted_memory || {}),
                ...aiAnalysis.extractedFacts,
            };
            await db_1.prisma.chat_user_preferences.update({
                where: { userId },
                data: {
                    frequent_topics: updatedTopics,
                    usage_stats: usageStats,
                    style_alignment: aiAnalysis.detectedStyle || prefs.style_alignment,
                    extracted_memory: updatedMemory, // ✅ Exclusively stored in DB
                    last_active: new Date(),
                    last_updated: new Date(),
                },
            });
            logger_1.logger.info(`✅ User profile evolved: Role=${aiAnalysis.role}, Style=${aiAnalysis.detectedStyle}`);
        }
        catch (error) {
            logger_1.logger.error('Error in advanced behavior tracking:', error);
        }
    }
    /**
     * Uses a fast LLM to extract industrial persona insights
     */
    async analyzeBehaviorWithAI(query, intent, history, existingMemory, searchResult) {
        // 🚀 High-Performance Bypass: Skip expensive LLM analysis for trivial queries
        if (query.trim().length < 2) {
            return {
                topics: [],
                detectedStyle: undefined,
                role: undefined,
                sophistication: undefined,
                extractedFacts: {},
            };
        }
        try {
            const recentHistory = history
                .slice(-6)
                .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
                .join('\n');
            const searchContext = searchResult?.results?.map((r) => r.content).join('\n\n') ||
                (searchResult?.context ? searchResult.context : 'No additional search context.');
            const prompt = `
        Analyze the current interaction in the context of persistent user behavior and knowledge extraction for the energy industry.
        
        **User Profile Analysis Objectives:**
        1. Identify the user's role and technical expertise.
        2. Detect their communication style preference (concise, detailed, technical, professional).
        3. Extract PERSISTENT facts, assets, or glossary terms from the query, the history, AND the provided search results.
        
        **Data for Analysis:**
        - **Current Query**: "${query}"
        - **Recent History**: 
          ${recentHistory}
        - **Retrieved Search Context (Analyze for inferred user assets/context)**:
          ${searchContext.substring(0, 4000)}
        - **Existing Memory**:
          ${existingMemory}
        
        **Output Format (JSON):**
        {
           "topics": ["topic1", "topic2"], 
           "detectedStyle": "concise | detailed | technical | professional",
           "role": "Role inferred from interaction",
           "extractedFacts": {
              "operational_context": "<project_or_location>",
              "technical_preferences": "<units_or_standards>",
              "frequent_assets": "<machinery_or_hardware>",
              "personal_details": "<name_or_role>",
              "local_glossary": { "acronym": "definition" },
              "user_sentiment": "frustrated | happy | neutral",
              "corrections": "What the user corrected about your previous knowledge",
              "other_insights": { "dynamic_key": "dynamic_value" }
           }
        }
        For 'extractedFacts', capture persistent engineering context and personal details. 
        CRITICAL: Analyze the 'Retrieved Search Context'. If the search results mention specific wells or assets that the user is clearly investigating, add them to 'frequent_assets'.
        CRITICAL: Be creative and observant. If you detect a unique behavior pattern (e.g., "Always asks for cost after technical data"), a specific workflow preference, or an unusual interest not covered by the standard keys, CREATE a new relevant key within 'extractedFacts' or 'other_insights' to store it.
        Critical: In 'extractedFacts', DO NOT REMOVE existing information from 'Existing Memory' unless the user explicitly corrects it. 
        Critical: If the user defines an acronym or local term (e.g., "In this field, ESP stands for X"), capture it in "local_glossary".
        Critical: If the user says "My name is X", you MUST capture it in "personal_details".
        Always include previously known facts in your output if they are still valid.
        Return ONLY valid JSON.
      `;
            const response = await llm_service_1.llmService.chatJson([
                {
                    role: 'system',
                    content: 'You are a Senior Industrial Behavioral Analyst handling Oil, Gas, and Water engineer profiling.',
                },
                { role: 'user', content: prompt },
            ], config_1.env.AI_MODEL_DECISION || config_1.env.AI_MODEL_NAME, 0.3);
            const content = response.content;
            let data = {};
            try {
                if (typeof content === 'string') {
                    data = JSON.parse(content);
                }
                else {
                    data = content;
                }
            }
            catch (e) {
                data = content;
            }
            return {
                topics: Array.isArray(data.topics) ? data.topics : [],
                detectedStyle: ['concise', 'detailed', 'technical', 'professional'].includes(data.detectedStyle)
                    ? data.detectedStyle
                    : 'professional',
                role: data.role || 'user',
                sophistication: data.sophistication || 'unknown',
                extractedFacts: data.extractedFacts || {},
            };
        }
        catch (err) {
            logger_1.logger.error('AI Behavior Analysis failed, falling back to basic extraction');
            return {
                topics: this.extractTopics(query),
                detectedStyle: undefined,
                role: undefined,
                sophistication: undefined,
                extractedFacts: {},
            };
        }
    }
    /**
     * Simple keyword-based topic extraction.
     * In a higher-level implementation, this would use an LLM or NLP library.
     */
    extractTopics(query) {
        const commonTerms = [
            // Assets & Equipment
            'well',
            'esp',
            'pump',
            'compressor',
            'valve',
            'pipeline',
            'tank',
            'turbine',
            'rig',
            'separator',
            'motor',
            'gauge',
            'manifold',
            'wellhead',
            'sensor',
            // Operations & Processes
            'production',
            'drilling',
            'injection',
            'completion',
            'workover',
            'maintenance',
            'shutdown',
            'startup',
            'flaring',
            'fracturing',
            'gathering',
            'refining',
            'midstream',
            'upstream',
            // Engineering Parameters
            'pressure',
            'temperature',
            'flow',
            'volume',
            'density',
            'viscosity',
            'torque',
            'vibration',
            'current',
            'voltage',
            'frequency',
            'osmosis',
            'salinity',
            'corrosion',
            // Fluid & Chemicals
            'oil',
            'gas',
            'crude',
            'condensate',
            'h2s',
            'water cut',
            'brine',
            'chemical',
            'polymer',
            'mud',
            // Maintenance & Performance
            'anomaly',
            'efficiency',
            'power',
            'downtime',
            'integrity',
            'reliability',
            'optimization',
            'failure',
            'leak',
            'spill',
            'degradation',
            'cycle',
            // Compliance & Management
            'report',
            'compliance',
            'safety',
            'hse',
            'environmental',
            'regulation',
            'api standard',
            'capex',
            'opex',
            'roi',
            'inventory',
        ];
        const lowerQuery = query.toLowerCase();
        return commonTerms.filter((term) => lowerQuery.includes(term));
    }
}
exports.UserBehaviorService = UserBehaviorService;
exports.userBehaviorService = new UserBehaviorService();
