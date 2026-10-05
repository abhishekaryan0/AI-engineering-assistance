"use strict";
/**
 * Semantic Re-Ranker Service
 * Re-ranks RAG results using LLM to validate actual relevance
 * Prevents low-quality but high-similarity results from misleading responses
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.semanticRerankerService = void 0;
const llm_service_1 = require("../../../../services/llm/llm.service");
const logger_1 = require("../../../../utils/logger");
const config_1 = require("../../../../config/config");
exports.semanticRerankerService = {
    /**
     * Re-rank RAG results by validating relevance with LLM
     * Filters out false positives from vector similarity alone
     */
    async reRankResults(query, originalResults, threshold = 0.65 // Only keep results scoring > 65%
    ) {
        if (originalResults.length === 0)
            return [];
        logger_1.logger.debug(`🔄 Re-ranking ${originalResults.length} RAG results for query: "${query.substring(0, 60)}..."`);
        const startTime = Date.now();
        // Prepare content snippets for re-ranking
        const resultsForReRank = originalResults.map((r, idx) => ({
            idx,
            snippet: r.content.substring(0, 500), // Limit snippet length
            original: r,
        }));
        const systemPrompt = `You are a relevance assessor for Oil, Gas, and Water industry queries.
Your task is to evaluate how relevant each search result is to the query.
Consider semantic meaning, technical accuracy, and domain relevance.

Rate each result on:
1. **Domain Relevance**: Is it about Oil/Gas/Water/Energy operations?
2. **Query Match**: Does it answer or relate to the query?
3. **Quality**: Is the content technically sound?

Return ONLY a valid JSON object matching this exact format:
{
  "results": [
    { "index": 0, "relevance_score": 0.95, "reasoning": "..." },
    { "index": 1, "relevance_score": 0.45, "reasoning": "..." }
  ]
}`;
        const userPrompt = `Query: "${query}"

Results to evaluate:
${resultsForReRank.map((r, i) => `${i + 1}. "${r.snippet.replace(/"/g, '\\"')}"`).join('\n\n')}`;
        try {
            const reRankedData = await llm_service_1.llmService.chatJson([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], config_1.env.AI_MODEL_DECISION);
            let rankings = [];
            const content = reRankedData?.content;
            if (content && typeof content === 'object') {
                if (Array.isArray(content.results)) {
                    rankings = content.results;
                }
                else if (Array.isArray(content)) {
                    rankings = content;
                }
            }
            if (!Array.isArray(rankings))
                rankings = [];
            const reRanked = resultsForReRank
                .map((r) => {
                const ranking = rankings.find((rk) => rk.index === r.idx);
                const relevanceScore = ranking?.relevance_score ?? 0;
                return {
                    content: r.original.content,
                    metadata: r.original.metadata,
                    similarity: r.original.similarity,
                    relevanceScore,
                    rank: 0, // Will be set after filtering
                    reasoning: ranking?.reasoning || 'No reasoning provided',
                };
            })
                .filter((r) => r.relevanceScore >= threshold)
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .map((r, idx) => ({ ...r, rank: idx + 1 }));
            const executionTime = Date.now() - startTime;
            logger_1.logger.info(`✅ Re-ranking complete: ${reRanked.length}/${originalResults.length} results passed threshold (${executionTime}ms)`);
            if (reRanked.length === 0) {
                logger_1.logger.warn(`⚠️ No results passed relevance threshold (${threshold}). Consider lowering threshold.`);
            }
            return reRanked;
        }
        catch (error) {
            logger_1.logger.error(`❌ Error during re-ranking: ${error}`);
            // Fallback: return original results sorted by similarity
            return originalResults
                .map((r, idx) => ({
                content: r.content,
                metadata: r.metadata,
                similarity: r.similarity,
                relevanceScore: r.similarity, // Use similarity as fallback
                rank: idx + 1,
                reasoning: 'Fallback to similarity score due to re-ranking error',
            }))
                .filter((r) => r.similarity >= threshold);
        }
    },
    /**
     * Quick relevance check for single result
     * Faster than full re-ranking for individual validation
     */
    async quickValidateResult(query, content, threshold = 0.6) {
        const systemPrompt = `You are a relevance validator. Quickly assess if the content is relevant to the query.
Return JSON: { "is_relevant": boolean, "score": 0-1, "reasoning": "..." }`;
        const userPrompt = `Query: "${query}"
Content: "${content.substring(0, 400)}"

Is this relevant? Return JSON only.`;
        try {
            const result = await llm_service_1.llmService.chatJson([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], config_1.env.AI_MODEL_DECISION);
            const score = result.content.score ?? 0;
            return {
                isRelevant: score >= threshold,
                score,
                reasoning: result.content.reasoning || '',
            };
        }
        catch (error) {
            logger_1.logger.warn(`⚠️ Quick validation failed: ${error}`);
            return { isRelevant: true, score: 0.5, reasoning: 'Validation defaulted to true' };
        }
    },
};
