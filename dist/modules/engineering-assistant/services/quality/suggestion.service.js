"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestionService = void 0;
const logger_1 = require("../../../../utils/logger");
const llm_service_1 = require("../../../../services/llm/llm.service");
const config_1 = require("../../../../config/config");
// ─────────────────────────────────────────────────────────────
// HELPER: Pick N unique random items from an array
// ─────────────────────────────────────────────────────────────
function pickRandom(arr, count) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}
// ─────────────────────────────────────────────────────────────
// HELPER: Extract historical context — what topics were
// discussed earlier in this session, and did the topic shift?
// ─────────────────────────────────────────────────────────────
function extractHistoricalContext(chatHistory) {
    if (!chatHistory || chatHistory.length === 0) {
        return { topicSummary: '', pastUserQueries: [], pastAiResponses: [], hasTopicShift: false };
    }
    // Collect all user messages from the session
    const userMessages = chatHistory
        .filter((m) => m.role === 'user')
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .filter(Boolean);
    const pastUserQueries = userMessages.slice(-20);
    // Collect past AI (assistant) responses — summary snippet of each
    const pastAiResponses = chatHistory
        .filter((m) => m.role === 'assistant')
        .map((m) => (typeof m.content === 'string' ? m.content.substring(0, 200).trim() : ''))
        .filter(Boolean)
        .slice(-10);
    if (pastUserQueries.length < 2) {
        return { topicSummary: '', pastUserQueries, pastAiResponses, hasTopicShift: false };
    }
    // Compare latest two queries by keyword overlap to detect topic shift
    const recentQuery = pastUserQueries[pastUserQueries.length - 1] || '';
    const olderQuery = pastUserQueries[pastUserQueries.length - 2] || '';
    const recentWords = new Set(recentQuery
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3));
    const olderWords = new Set(olderQuery
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3));
    const overlap = Array.from(recentWords).filter((w) => olderWords.has(w)).length;
    const hasTopicShift = overlap < 2 && recentWords.size > 2 && olderWords.size > 2;
    // All earlier queries joined as a readable summary for the LLM
    const topicSummary = pastUserQueries.slice(0, -1).join(' | ');
    return { topicSummary, pastUserQueries, pastAiResponses, hasTopicShift };
}
exports.suggestionService = {
    /**
     * Suggestion Policy Engine — Unified History-Aware Mode
     *
     * Single prompt handles ALL query types:
     * - Short/simple queries  → brief 7-10 word suggestions
     * - Technical/complex     → specific cross-topic suggestions
     * - Topic shift detected  → at least 1 suggestion bridges old + new topic
     * - Same topic continues  → deeper layered follow-ups from full history
     *
     * Always returns exactly 3 unique suggestions.
     */
    async generateSuggestions(userQuery, contextInfo, aiResponse, chatHistory, intent, hasChartData = false, fileContext = '', personalizationContext = '') {
        logger_1.logger.debug(`🧠 Suggestion Engine: "${userQuery.substring(0, 40)}..." | intent: ${intent}`);
        // No suggestions for casual chat or AI refusals
        if (intent === 'chat' || intent === 'chat_only' || this.isRefusal(aiResponse)) {
            logger_1.logger.debug('🚫 Suggestions disabled: Casual chat or refusal detected');
            return [];
        }
        try {
            // ── Full session history (last 30 messages) ──────────────────────────
            const historyStr = chatHistory
                .slice(-30)
                .map((m) => `${m.role}: ${m.content}`)
                .join('\n');
            // ── Detect topic shift + extract history (user queries + AI responses)
            const { topicSummary, pastUserQueries, pastAiResponses, hasTopicShift } = extractHistoricalContext(chatHistory);
            // ── Past AI responses section for relation-checking ──────────────────
            // We show summarized past AI responses so the LLM can detect if the
            // current response is related to something the AI previously answered.
            const pastAiSection = pastAiResponses.length > 0
                ? `
=== PAST AI RESPONSES (summaries from this session) ===
${pastAiResponses.map((r, i) => `[Response ${i + 1}]: ${r}`).join('\n')}

=== RELATION-CHECK INSTRUCTION ===
Carefully compare the CURRENT AI RESPONSE above with each PAST AI RESPONSE listed here.
If the current response shares any topic, asset, KPI, equipment, metric, or theme with a past AI response:
  → Include at least 1 suggestion that bridges/connects them (e.g., "[Past data] remains consistent with [Current data] - why?").
If no direct relation exists across responses, focus all 3 suggestions on the current response.`
                : '';
            // ── Build cross-topic / history section for user-query tracking ──────
            let historicalSection = '';
            if (topicSummary && pastUserQueries.length > 1) {
                historicalSection = `
=== EARLIER USER TOPICS IN THIS SESSION ===
${topicSummary}

=== TOPIC-SHIFT INSTRUCTION ===
${hasTopicShift
                    ? `The user has CHANGED topics. You MUST:
  1. Check if the current response shares any element (asset, metric, equipment, KPI) with earlier user topics.
  2. If YES → include at least 1 suggestion connecting the current response to the earlier topic.
  3. If NO relation → generate 2 from current response + 1 suggestion to revisit an earlier topic.`
                    : `The user is continuing on the same topic. Use full history to suggest DEEPER follow-ups that build on both current and earlier context — not just the last message.`}`;
            }
            // ── Adaptive length instruction based on query length ─────────────────
            const queryWordCount = userQuery.trim().split(/\s+/).length;
            const lengthInstruction = queryWordCount <= 5
                ? 'Keep each suggestion brief: 7 to 10 words. Plain language, no jargon.'
                : 'Keep each suggestion concise: max 12 words. Use domain-specific terms where relevant.';
            // ── Single unified prompt ────────────────────────────────────────────
            const systemInstruction = `You are the AI Suggestion Engine for "Agentic Energy", an industrial AI assistant.

YOUR GOAL: Generate exactly 3 follow-up questions that help the user explore the topic further.

CORE RULES:
1. Generate EXACTLY 3 suggestions — no more, no less.
2. ALL 3 must be UNIQUE — each must explore a different angle, asset, or insight.
3. PERSONALIZATION: Use the "USER ROLE/CONTEXT" (Memory) to make suggestions relevant to the user's specific role, past-mentioned assets (e.g., specific Wells or Pumps), and technical preferences.
4. PROACTIVITY: At least one suggestion should be a proactive next step based on the user's expertise or ongoing project mentioned in their memory.
5. ${lengthInstruction}
6. Phrased as natural user questions (e.g., "[QUESTION_1]", "[QUESTION_2]").
7. Based on BOTH the current AI response AND the full session history (user queries + past AI responses).
8. NO emojis, NO bullet numbers inside the suggestion text.

OUTPUT FORMAT: Return ONLY a valid JSON array of exactly 3 strings.
Example: ["Question one here", "Question two here", "Question three here"]

===========================
FULL SESSION CHAT HISTORY (last 30 messages):
${historyStr || '(No prior history — first message in session)'}
${pastAiSection}
${historicalSection}

CURRENT USER QUERY:
"${userQuery}"

CURRENT AI RESPONSE:
"${(aiResponse || '').substring(0, 1200)}"
${personalizationContext ? `\nUSER ROLE/CONTEXT: ${personalizationContext}` : ''}
===========================

Remember: Check current AI response vs past AI responses for any relation. Return a JSON array of exactly 3 unique suggestion strings.`;
            const model = config_1.env.AI_MODEL_DECISION || config_1.env.AI_MODEL_NAME;
            const response = await llm_service_1.llmService.chatJson([{ role: 'system', content: systemInstruction }], model, 0.4);
            const suggestions = this._parseSuggestions(response.content, hasChartData);
            logger_1.logger.debug(`✅ ${suggestions.length} suggestions generated (topicShift=${hasTopicShift}, hasHistory=${!!topicSummary})`);
            return suggestions;
        }
        catch (error) {
            logger_1.logger.error(`❌ Suggestion Engine error: ${error}`);
            return this.getFallbackSuggestions();
        }
    },
    // ─────────────────────────────────────────────────────────────────────────
    // Internal: parse LLM JSON response → Suggestion[]
    // Guarantees exactly 3 unique suggestions — pads from random pool if needed
    // ─────────────────────────────────────────────────────────────────────────
    _parseSuggestions(content, hasChartData) {
        let list = [];
        if (Array.isArray(content)) {
            list = content.filter((s) => typeof s === 'string' && s.trim().length > 2);
        }
        else if (content && typeof content === 'object') {
            const data = content.suggestions || content.questions || Object.values(content);
            if (Array.isArray(data)) {
                list = data.filter((s) => typeof s === 'string' && s.trim().length > 2);
            }
        }
        // Deduplicate and clean
        list = [...new Set(list.map((s) => s.trim()))].filter((s) => s.length > 2);
        const toSuggestion = (text) => {
            let type = 'text';
            const lower = text.toLowerCase();
            if (hasChartData || lower.includes('compare') || lower.includes('trend'))
                type = 'chart';
            if (lower.includes('recommend') || lower.includes('action') || lower.includes('step'))
                type = 'action';
            return { text, score: 0.9, type };
        };
        const result = list.slice(0, 3).map(toSuggestion);
        // Pad to exactly 3 using RANDOM picks from the pool — avoids repeated fallbacks
        if (result.length < 3) {
            logger_1.logger.warn(`⚠️ LLM returned only ${result.length} suggestion(s), padding to 3.`);
            const existingTexts = new Set(result.map((r) => r.text.toLowerCase()));
            const pool = this._getFallbackPool();
            const available = pool.filter((p) => !existingTexts.has(p.text.toLowerCase()));
            const pads = pickRandom(available, 3 - result.length);
            result.push(...pads);
        }
        logger_1.logger.debug(`📋 Final suggestion count: ${result.length}`);
        return result.slice(0, 3);
    },
    // ── Diverse fallback pool (15 options) — random 3 picked on demand ───────
    _getFallbackPool() {
        const pool = [
            { text: 'Show recent equipment anomalies', type: 'text' },
            { text: 'Compare performance with last month', type: 'chart' },
            { text: 'Which assets are at highest risk?', type: 'text' },
            { text: 'Generate maintenance recommendations', type: 'action' },
            { text: 'Show real-time sensor readings', type: 'text' },
            { text: 'What are the top KPI deviations?', type: 'text' },
            { text: 'List upcoming maintenance schedules', type: 'action' },
            { text: 'Show efficiency trend over time', type: 'chart' },
            { text: 'Which wells have pressure warnings?', type: 'text' },
            { text: 'Compare current vs target performance', type: 'chart' },
            { text: 'What caused the latest alert?', type: 'text' },
            { text: 'Show downtime summary this week', type: 'text' },
            { text: 'Identify underperforming assets', type: 'text' },
            { text: 'Get operational status overview', type: 'text' },
            { text: 'Show production output trends', type: 'chart' },
        ];
        return pool.map((p) => ({ ...p, score: 0.5 }));
    },
    /**
     * Returns 3 random fallback suggestions from the pool.
     * Called when the entire LLM generation fails.
     */
    getFallbackSuggestions() {
        return pickRandom(this._getFallbackPool(), 3);
    },
    /**
     * Detects if a response is a refusal or too short to warrant suggestions.
     */
    isRefusal(response) {
        if (!response || response.trim().length < 5)
            return true;
        const patterns = [
            /i'm sorry/i,
            /cannot assist/i,
            /not relate to/i,
            /out of scope/i,
            /internal error/i,
            /unable to/i,
            /could you please provide more context/i,
            /how can i assist you today/i,
        ];
        return patterns.some((p) => p.test(response.substring(0, 150)));
    },
    /**
     * @deprecated Suggestions are returned as metadata only.
     */
    getFormattedBlock(_suggestions) {
        return '';
    },
};
