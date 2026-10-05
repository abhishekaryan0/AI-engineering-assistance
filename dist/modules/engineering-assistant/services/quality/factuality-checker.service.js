"use strict";
/**
 * Factuality Checker Service
 * Detects hallucinations by validating AI responses against source documents
 * Prevents the model from claiming facts not supported by RAG sources
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.factualityCheckerService = void 0;
const llm_service_1 = require("../../../../services/llm/llm.service");
const logger_1 = require("../../../../utils/logger");
const config_1 = require("../../../../config/config");
exports.factualityCheckerService = {
    /**
     * Check if response's claims are supported by source documents
     */
    async checkFactuality(response, ragSources, query) {
        if (ragSources.length === 0) {
            logger_1.logger.warn('⚠️ No RAG sources provided for factuality check. Skipping.');
            return {
                isFactual: true,
                factScore: 0.5,
                hallucinations: [],
                supportedClaims: [],
                unsupportedClaims: [],
                reasoning: 'No sources available for validation',
                confidence: 0.3,
            };
        }
        logger_1.logger.debug(`🔍 Checking factuality of response (${response.length} chars) against ${ragSources.length} sources`);
        const startTime = Date.now();
        // Prepare source context (limit to avoid token overflow)
        const sourceContext = ragSources
            .slice(0, 5) // Top 5 sources
            .map((s, idx) => `[Source ${idx + 1}]: ${s.content.substring(0, 300)}`)
            .join('\n\n');
        const systemPrompt = `You are a fact-checker for Oil, Gas, and Water industry content.
Your task: Verify if the AI response's claims are supported by the provided sources.

Return ONLY a valid JSON object matching this exact format:
{
  "hallucinations": [
    { "claim": "...", "evidence": "...", "severity": "high" }
  ],
  "supported_claims": ["...", "..."],
  "unsupported_claims": ["...", "..."],
  "fact_score": 0.85,
  "reasoning": "..."
}
Note: severity strictly must be "high", "medium", or "low".`;
        const userPrompt = `Query: "${query}"

AI Response:
"${response.substring(0, 1000)}"

Source Documents:
${sourceContext}`;
        try {
            const result = await llm_service_1.llmService.chatJson([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], config_1.env.AI_MODEL_DECISION || 'gpt-4o-mini');
            const content = result.content;
            const hallucinations = (content.hallucinations || []).filter((h) => ['high', 'medium', 'low'].includes(h.severity));
            const supportedClaims = content.supported_claims || [];
            const unsupportedClaims = content.unsupported_claims || [];
            const factScore = Math.max(0, Math.min(1, Number(content.fact_score ?? 0.8)));
            const reasoning = content.reasoning || 'No reasoning provided';
            const executionTime = Date.now() - startTime;
            // Calculate overall factuality
            const hasSevereHallucinations = hallucinations.some((h) => h.severity === 'high');
            const isFactual = !hasSevereHallucinations && factScore >= 0.7;
            const confidence = hallucinations.length === 0 ? 0.95 : 0.75;
            logger_1.logger.info(`✅ Factuality check complete (${executionTime}ms): Score=${(factScore * 100).toFixed(0)}%, Hallucinations=${hallucinations.length}, Confidence=${(confidence * 100).toFixed(0)}%`);
            if (hallucinations.length > 0) {
                logger_1.logger.warn(`⚠️ Potential hallucinations detected: ${hallucinations.map((h) => `"${h.claim}" (${h.severity})`).join(', ')}`);
            }
            return {
                isFactual,
                factScore,
                hallucinations,
                supportedClaims,
                unsupportedClaims,
                reasoning,
                confidence,
            };
        }
        catch (error) {
            logger_1.logger.error(`❌ Error during factuality check: ${error}`);
            // Conservative fallback: warn about unverified content
            return {
                isFactual: false,
                factScore: 0.5,
                hallucinations: [{ claim: response.substring(0, 100), evidence: null, severity: 'medium' }],
                supportedClaims: [],
                unsupportedClaims: [],
                reasoning: `Factuality check failed. Response could not be verified against sources: ${error}`,
                confidence: 0.3,
            };
        }
    },
    /**
     * Sanitize RAG content before injection into prompts
     * Prevents prompt injection attacks through malicious documents
     */
    sanitizeRagContent(content) {
        // Escape special characters that could break prompt structure
        return (content
            // Escape backticks and quotes
            .replace(/```/g, '` ` `')
            .replace(/`/g, "'")
            // Remove or escape control characters
            .replace(/[\x00-\x1F\x7F]/g, ' ')
            // Limit length to prevent token bloat
            .substring(0, 5000));
    },
    /**
     * Validate that claims in response don't contradict sources
     */
    async quickValidateClaim(claim, sources) {
        if (sources.length === 0)
            return { isSupported: true, confidence: 0.5 };
        const sourceContext = sources.map((s) => s.content.substring(0, 200)).join('\n');
        const systemPrompt = `Is this claim supported by the sources? Answer "yes" or "no" only.`;
        const userPrompt = `Claim: "${claim}"\n\nSources:\n${sourceContext}`;
        try {
            const result = await llm_service_1.llmService.chatJson([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], 'gpt-4o-mini');
            // Simple heuristic for boolean response
            const answer = result.content.toString().toLowerCase().includes('yes');
            return { isSupported: answer, confidence: 0.8 };
        }
        catch (error) {
            return { isSupported: true, confidence: 0.3 }; // Default to accepting to avoid over-filtering
        }
    },
};
