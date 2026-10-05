/**
 * Intent Classification Service
 * Combines rule-based and LLM-based classification for robust intent detection
 */

import { llmService } from '../../../../services/llm/llm.service';
import { logger } from '../../../../utils/logger';
import { z } from 'zod';
import { env } from '../../../../config/config';
import { semanticRouterService } from './semantic-router.service';

export type Intent = 'research' | 'analysis' | 'action' | 'smart_action' | 'chat';
export type ResearchMode = 'simple' | 'deep_thinking' | 'web_search' | 'hybrid';

export interface IntentClassificationResult {
  intent: Intent;
  researchMode: ResearchMode;
  confidence: number; // 0-1
  reasoning: string;
  method: 'rules' | 'llm' | 'ensemble';
  executionTime: number;
  domain_allowed?: boolean;
  refusal?: string;
}

// Pattern matching for fast classification
const INTENT_PATTERNS = {
  smart_action: [
    /^(get|fetch|show|display|retrieve|list)\s+(current|active|latest|all).*(anomal|risk|alert|recommend|data|metric)/i,
    /^(give me|provide|show|send|display).*(anomaly|anomalies|at[_\s]?risk|active|current|alert)/i,
    /^(anomaly|anomalies|alert|risk|recommendation|suggestion)s?\s*(for|from|on)?/i,
    /^(what).*(anomal|risk|alert|active|current)/i,
  ],
  analysis: [
    /^(analyze|examine|review|inspect|assess|evaluate|compare|breakdown|dissect).*$/i,
    /^.*(chart|graph|visuali|plot|diagram|table|visualization|compare|breakdown)/i,
    /^(create|generate|make|build|draw|plot).*(chart|graph|visual|diagram|table)/i,
    /^(upload|process|analyze|scan|examine|summarize|read|check|extract).*(file|document|pdf|csv|spreadsheet|report)/i,
    /^(what is in|what does).*(file|document|pdf|this)/i,
  ],
  action: [
    /^(how to|how do|steps for|procedure for|process for|guide|tutorial|walkthrough).*/i,
    /^(create|develop|implement|execute|perform|conduct|build).*(plan|checklist|procedure|workflow|action)/i,
    /^(what are the steps|outline|describe.*process)/i,
  ],
  research: [
    /^(search|find|google|look up|get).*(latest|current|news|info|data)/i,
    /^(what is|explain|describe|tell me about|information about|define|clarify)/i,
    /^(why|how does|what causes|what are|compare|list|summary)/i,
    /^(background|overview|introduction|concept|theory)/i,
  ],
};

// EXCLUSION: If 'anomaly', 'risk', 'alert' is present, it should NOT be research unless explicitly asking for definitions.
const SMART_ACTION_KEYWORDS = /anomal|active|risk|alert|recommend|metric|production/i;

function calculatePatternMatchScore(pattern: RegExp, text: string): number {
  const match = text.match(pattern);
  if (!match) return 0;
  if (match.index === 0) return 1.0; // Favor exact beginning matches
  return Math.max(0.5, 1 - (match.index || text.length) / text.length);
}

export const intentClassifierService = {
  /**
   * Fast rule-based intent classification
   */
  classifyByRules(promptText: string): { intent: Intent; confidence: number } | null {
    const lower = promptText.toLowerCase().trim();

    // Check for greetings first
    if (
      /^(hi|hy|hey|hello|hallo|heyya|hola|greetings|good\s(morning|afternoon|evening)|welcome)/i.test(
        lower
      )
    ) {
      return { intent: 'chat', confidence: 0.95 };
    }

    // Check for meta-questions about the assistant itself
    if (
      /^(what can you do|who are you|how can you help)|(capabilities|which sector|what sector|what industries|what domains)/i.test(
        lower
      )
    ) {
      return { intent: 'chat', confidence: 0.95 };
    }

    // Score against each intent pattern
    let bestMatch: { intent: Intent; score: number } | null = null;

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(lower)) {
          // Special Case: Research shouldn't steal 'anomaly' queries
          if (intent === 'research' && SMART_ACTION_KEYWORDS.test(lower)) {
            continue;
          }

          const score = calculatePatternMatchScore(pattern, lower);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { intent: intent as Intent, score };
          }
        }
      }
    }

    if (bestMatch && bestMatch.score > 0.5) {
      return { intent: bestMatch.intent, confidence: Math.min(0.9, bestMatch.score) };
    }

    // Check for follow-up selection (1, 2, 3)
    if (/^([123])(\.|\s|$)/i.test(lower) && lower.length < 5) {
      return { intent: 'research', confidence: 0.99 }; // High confidence, let LLM resolve the actual question from history
    }

    return null;
  },

  /**
   * LLM-based intent classification with reasoning
   */
  async classifyByLLM(
    promptText: string,
    chatHistory: any[] = [],
    glossaryTerms: string[] = [],
    personalizationPrompt: string = ''
  ): Promise<IntentClassificationResult> {
    const historyContext = chatHistory
      .slice(-15)
      .map((m) => {
        let content = m.content;
        if (m.role === 'assistant' && (m as any).suggestions) {
          const suggs = (m as any).suggestions;
          if (Array.isArray(suggs) && suggs.length > 0) {
            content += `\n\n[SUGGESTIONS]: ${JSON.stringify(suggs)}`;
          }
        }
        return `${m.role}: ${content}`;
      })
      .join('\n');

    const glossaryContext =
      glossaryTerms.length > 0
        ? `Glossary Terms Found: ${glossaryTerms.join(', ')}`
        : 'No glossary terms found.';

    const systemPrompt = `You are an intent classifier for an Oil, Gas, Water & Energy Engineering Assistant.

STEP 1 - DOMAIN CHECK:
First check if the query is related to: Oil, Gas, Water Treatment, or Energy industries.
- Use context from Chat History and Glossary Terms.
- ERROR CORRECTION: Queries about "anomalies", "alerts", "risks", "recommendations", "wells", "production", or "machines" are ALWAYS considered DOMAIN RELEVANT.
- UPLOADED FILES: If the user asks about an uploaded file (e.g., "[FILE_SUMMARY]", "[FILE_ANALYSIS]"), it is ALWAYS considered DOMAIN RELEVANT.
- GREETINGS: Casual greetings (hi, hy, hello, hey, etc.) and polite conversation are ALWAYS considered DOMAIN RELEVANT.
- PERSONALIZATION: Queries about the user's name, role, identity, or preferences (that you should know from context/memory) are ALWAYS considered DOMAIN RELEVANT.
- META-QUESTIONS: Questions asking what you can do, which sectors you assist in, or your capabilities are ALWAYS considered DOMAIN RELEVANT.
- If terms match glossary, it IS domain allowed.
- If NOT related → return "domain_allowed": false immediately.

STEP 2 - INTENT CLASSIFICATION (only if domain allowed):
Classify into: research | chat | action | analysis | smart_action

INTENT DEFINITIONS:
1. **smart_action**: CRITICAL: User requests INTERNAL SYSTEM DATA (anomalies, active risks, alerts, recommendations, metrics, production data, sensor data, readings, well data). Even if they say "show me", "give me", or "search", if it refers to database metrics/readings, it is smart_action.
2. **analysis**: User wants to analyze data, uploaded files, OR requests visualization/charts.
3. **action**: User wants procedures, guides, checklists, step-by-step instructions.
4. **research**: General technical questions, explanations, definitions, background. Do NOT choose research for fetching specific sensor/well data!
5. **chat**: Greetings or casual conversation.

RESEARCH MODES for applicable intents:
- simple: Quick answer with basic info
- deep_thinking: Complex analysis with reasoning
- web_search: Search for current information
- hybrid: Combine deep thinking with web search

NUMERIC SELECTION:
- If the user query is just a number (e.g., "1", "2", "3"), look for the "[SUGGESTIONS]: [...]" block in the most recent Assistant message in Chat History.
- Map the number to the corresponding suggestion in that JSON list and classify the intent based on that suggestion's text.

RESPOND IN JSON:
{
  "domain_allowed": boolean,
  "refusal": "Only if domain_allowed is false — friendly message to user",
  "intent": "research | chat | action | analysis | smart_action",
  "researchMode": "simple | deep_thinking | web_search | hybrid",
  "confidence": 0.0-1.0,
  "reasoning": "brief reason"
}`;

    const userPrompt = `Classify this query:
${personalizationPrompt ? `User Personalization Context:\n${personalizationPrompt}\n\n` : ''}${historyContext ? `Chat History:\n${historyContext}\n\n` : ''}${glossaryContext}\n\nCurrent Query: "${promptText}"`;

    try {
      const startTime = Date.now();
      const result = await llmService.chatJson(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        env.AI_MODEL_DECISION
      );

      const IntentSchema = z.object({
        domain_allowed: z.union([
          z.boolean(),
          z.string().transform((val) => val.toLowerCase() === 'true'),
        ]),
        refusal: z.string().optional(),
        intent: z
          .union([
            z.enum(['research', 'analysis', 'action', 'smart_action', 'chat']),
            z.string().transform((val) => val as Intent),
          ])
          .nullable()
          .optional(),
        researchMode: z
          .union([
            z.enum(['simple', 'deep_thinking', 'web_search', 'hybrid']),
            z.string().transform((val) => val as ResearchMode),
          ])
          .nullable()
          .optional(),
        confidence: z
          .union([z.number(), z.string().transform((val) => parseFloat(val))])
          .optional(),
        reasoning: z.string().optional(),
      });

      const validated = IntentSchema.safeParse(result.content);
      if (validated.success) {
        return {
          intent: (validated.data.intent || 'chat') as Intent,
          researchMode: (validated.data.researchMode || 'simple') as ResearchMode,
          confidence: validated.data.confidence ?? 0,
          reasoning: validated.data.reasoning || 'No reasoning provided',
          domain_allowed: validated.data.domain_allowed,
          refusal: validated.data.refusal,
          method: 'llm',
          executionTime: Date.now() - startTime,
        };
      }

      console.error('\n\n=== VERBOSE PARSE ERROR ===');
      console.error('Raw LLM Result Content:', JSON.stringify(result.content, null, 2));
      console.error('Zod Error:', JSON.stringify(validated.error.format(), null, 2));
      console.error('===========================\n\n');

      logger.error('Zod validation failed:', validated.error.format());
      throw new Error('Invalid schema');
    } catch (error) {
      logger.error('❌ LLM classification failed:', error);
      // Fallback to rules
      const rulesResult = intentClassifierService.classifyByRules(promptText);
      return {
        intent: rulesResult?.intent || 'research',
        researchMode: 'simple',
        confidence: 0.5,
        reasoning: 'Fallback to rule-based classification due to LLM error',
        method: 'rules',
        executionTime: 0,
        domain_allowed: true, // Default to true on error to avoid blocking valid queries
      };
    }
  },

  /**
   * Ensemble classification: Rules (fast) + LLM (accurate)
   */
  async classifyWithEnsemble(
    promptText: string,
    chatHistory: any[] = [],
    glossaryTerms: string[] = [],
    personalizationPrompt: string = ''
  ): Promise<IntentClassificationResult> {
    const startTime = Date.now();

    // Fast rules classification
    const rulesResult = intentClassifierService.classifyByRules(promptText);

    // If high confidence from rules, return early ONLY for 'chat'
    // For other intents, we MUST run the LLM to perform strictly required Domain Checks.
    if (rulesResult && rulesResult.confidence >= 0.85 && rulesResult.intent === 'chat') {
      logger.debug(
        `✅ High-confidence rule match: ${rulesResult.intent} (${(rulesResult.confidence * 100).toFixed(1)}%)`
      );
      return {
        intent: rulesResult.intent,
        researchMode: 'simple',
        confidence: rulesResult.confidence,
        reasoning: 'High-confidence chat rule pattern match',
        method: 'rules',
        executionTime: Date.now() - startTime,
        domain_allowed: true, // Chat is always allowed
      };
    }

    // NEW PRE-FILTER: Semantic Router for Fast Industry Domain Verification
    try {
      // Small Optimization: Use Semantic Router if glossary terms are absent and rules failed
      // Bypass semantic router if there is active chat history OR if we have personalization memory.
      // Identity queries (like "who am I?") in a new session often fail strict semantic domain checks.
      if (glossaryTerms.length === 0 && chatHistory.length === 0 && !personalizationPrompt) {
        logger.debug(`🧠 Triggering Semantic Router for domain verification...`);
        const semanticCheck = await semanticRouterService.checkDomain(promptText);

        if (!semanticCheck.isAllowed) {
          logger.warn(`❌ Semantic Router blocked query as Out-Of-Domain`);
          return {
            intent: 'research',
            researchMode: 'simple',
            confidence: semanticCheck.confidence,
            reasoning: semanticCheck.reason,
            method: 'rules', // treated as pre-filter
            executionTime: Date.now() - startTime,
            domain_allowed: false,
            refusal:
              'I am an Engineering Assistant specializing in Oil, Gas, Water & Energy industries. I cannot assist with this topic.',
          };
        }
      }
    } catch (error) {
      logger.error(`Error in Semantic Router integration: ${error}`);
      // Fail gracefully and proceed to LLM
    }

    logger.debug(`⚠️ Ambiguous intent, using LLM for classification...`);

    // Fall back to LLM for ambiguous cases and deep classification
    const llmResult = await intentClassifierService.classifyByLLM(
      promptText,
      chatHistory,
      glossaryTerms,
      personalizationPrompt
    );
    logger.debug('llmResult', llmResult);
    // If rule and LLM agree, boost confidence
    const webKeywords = /search|find|google|web|latest|current|news|update|price/i;
    if (llmResult.intent === 'research' && webKeywords.test(promptText)) {
      llmResult.researchMode = 'web_search';
      logger.debug('🌐 Forced web_search mode due to keywords');
    }

    if (rulesResult && rulesResult.intent === (llmResult.intent as Intent)) {
      llmResult.confidence = Math.min(1, llmResult.confidence + 0.1);
      logger.debug(
        `🎯 Rules and LLM agree: confidence boosted to ${(llmResult.confidence * 100).toFixed(1)}%`
      );
    }

    return {
      ...llmResult,
      method: 'ensemble',
      executionTime: Date.now() - startTime,
    };
  },

  /**
   * Decompose multi-intent queries into separate intents
   * Handles queries like "Show anomalies AND provide recommendations"
   */
  async decomposeQuery(promptText: string): Promise<{
    intents: IntentClassificationResult[];
    isComposite: boolean;
    reasoning: string;
  }> {
    // Regex for logical connectors
    const compositeIndicators = /\s+(and|or|also|then|after|plus)\s+/i;

    if (!compositeIndicators.test(promptText)) {
      logger.debug(`📝 Single-intent query detected`);
      const result = await intentClassifierService.classifyWithEnsemble(promptText);
      return {
        intents: [result],
        isComposite: false,
        reasoning: 'No composite indicators found',
      };
    }

    logger.debug(`🔀 Composite query detected. Decomposing...`);

    // Split by logical connectors
    const parts = promptText.split(compositeIndicators).filter((p) => p.trim().length > 0);

    if (parts.length <= 1) {
      const result = await intentClassifierService.classifyWithEnsemble(promptText);
      return {
        intents: [result],
        isComposite: false,
        reasoning: 'Split resulted in single component',
      };
    }

    // Classify each part in parallel
    const classificationPromises = parts.map(async (part) => {
      if (part.match(/^(and|or|also|then|after|plus)$/i)) return null; // Skip connector words
      return await intentClassifierService.classifyWithEnsemble(part.trim());
    });

    const results = await Promise.all(classificationPromises);
    const intents = results.filter((r): r is IntentClassificationResult => r !== null);

    logger.info(`✅ Decomposition complete: ${intents.length} intents identified`);

    return {
      intents,
      isComposite: intents.length > 1,
      reasoning: `Query decomposed into ${intents.length} sub-queries: ${intents.map((i) => i.intent).join(' + ')}`,
    };
  },
};
