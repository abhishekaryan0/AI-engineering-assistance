import { prisma } from '../../../../config/db';
import { ChatMessage } from '../../interfaces/agent.interface';
import { logger } from '../../../../utils/logger';
import { llmService } from '../../../../services/llm/llm.service';
import { env } from '../../../../config/config';

export interface UserBehaviorData {
  topics: string[];
  preferredStyle?: 'concise' | 'detailed' | 'technical';
  toolUsage?: Record<string, number>;
}

export class UserBehaviorService {
  /**
   * Advanced AI-Powered Behavior Tracking
   */
  async trackInteraction(
    userId: string,
    orgId: string,
    query: string,
    intent: string,
    history: ChatMessage[],
    searchResult?: any
  ) {
    try {
      if (query.trim().length < 5) return; // Ignore very short queries

      logger.debug(`🧠 Advanced tracking for user ${userId}...`);

      // 1. Fetch current profile
      const prefs = (await prisma.chat_user_preferences.findUnique({
        where: { userId },
      })) as any;

      // 2. Fetch current memory (DB is now the primary and only storage)
      const dbMemory = prefs?.extracted_memory || {};
      const memoryStr = JSON.stringify(dbMemory);

      // 3. Fast AI Analysis (Now includes Search Context for deeper learning)
      const aiAnalysis = await this.analyzeBehaviorWithAI(
        query,
        intent,
        history,
        memoryStr,
        searchResult
      );

      if (!prefs) {
        await prisma.chat_user_preferences.create({
          data: {
            userId,
            organization_id: orgId,
            frequent_topics: aiAnalysis.topics,
            style_alignment: aiAnalysis.detectedStyle || 'professional',
            usage_stats: { [intent]: 1 },
            extracted_memory: aiAnalysis.extractedFacts || {},
          } as any,
        });
        return;
      }

      // 3. Merging AI Analysis with Existing Profile
      const existingTopics = (prefs.frequent_topics as string[]) || [];
      const updatedTopics = Array.from(new Set([...existingTopics, ...aiAnalysis.topics])).slice(
        -15
      );

      const usageStats = (prefs.usage_stats as Record<string, number>) || {};
      usageStats[intent] = (usageStats[intent] || 0) + 1;

      // 4. Persistence (DB update - Exclusive High Performance Storage)
      const updatedMemory = {
        ...((prefs.extracted_memory as object) || {}),
        ...aiAnalysis.extractedFacts,
      };

      await prisma.chat_user_preferences.update({
        where: { userId },
        data: {
          frequent_topics: updatedTopics,
          usage_stats: usageStats,
          style_alignment: aiAnalysis.detectedStyle || prefs.style_alignment,
          extracted_memory: updatedMemory, // ✅ Exclusively stored in DB
          last_active: new Date(),
          last_updated: new Date(),
        } as any,
      });

      logger.info(
        `✅ User profile evolved: Role=${aiAnalysis.role}, Style=${aiAnalysis.detectedStyle}`
      );
    } catch (error) {
      logger.error('Error in advanced behavior tracking:', error);
    }
  }

  /**
   * Uses a fast LLM to extract industrial persona insights
   */
  private async analyzeBehaviorWithAI(
    query: string,
    intent: string,
    history: ChatMessage[],
    existingMemory: string,
    searchResult?: any
  ) {
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

      const searchContext =
        searchResult?.results?.map((r: any) => r.content).join('\n\n') ||
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

      const response = await llmService.chatJson(
        [
          {
            role: 'system',
            content:
              'You are a Senior Industrial Behavioral Analyst handling Oil, Gas, and Water engineer profiling.',
          },
          { role: 'user', content: prompt },
        ],
        env.AI_MODEL_DECISION || env.AI_MODEL_NAME,
        0.3
      );

      const content = response.content;
      let data: any = {};

      try {
        if (typeof content === 'string') {
          data = JSON.parse(content);
        } else {
          data = content;
        }
      } catch (e) {
        data = content;
      }

      return {
        topics: Array.isArray(data.topics) ? data.topics : [],
        detectedStyle: ['concise', 'detailed', 'technical', 'professional'].includes(
          data.detectedStyle
        )
          ? data.detectedStyle
          : 'professional',
        role: data.role || 'user',
        sophistication: data.sophistication || 'unknown',
        extractedFacts: data.extractedFacts || {},
      };
    } catch (err) {
      logger.error('AI Behavior Analysis failed, falling back to basic extraction');
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
  private extractTopics(query: string): string[] {
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

export const userBehaviorService = new UserBehaviorService();
