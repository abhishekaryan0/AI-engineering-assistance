"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtRiskAssetsTool = void 0;
const db_1 = require("../../../../config/db");
const logger_1 = require("../../../../utils/logger");
class AtRiskAssetsTool {
    constructor() {
        this.name = 'get_at_risk_assets';
        this.description = 'Fetch assets currently identified as "at risk" or having "active anomalies". Use this when the user asks about "anomalies at risk", "risk suggestions", or "active alerts". Returns operational metrics.';
        this.parameters = [
            {
                name: 'limit',
                type: 'number',
                description: "Default is 5. IMPORTANT: If user asks for 'all', 'everything', or a specific date range, set limit to 100.",
            },
            {
                name: 'minConfidence',
                type: 'string',
                description: "Optional filter, e.g. '[LEVEL]'",
                required: false,
            },
            {
                name: 'organization_id',
                type: 'string',
                description: 'The organization ID for data scoping (REQUIRED)',
                required: true,
            },
        ];
    }
    async execute(params) {
        try {
            const { limit, organization_id } = params;
            const suggestions = await db_1.prisma.anomaly_suggestions.findMany({
                where: { organization_id },
                orderBy: { timestamp: 'desc' },
                take: limit || 5,
            });
            if (suggestions.length === 0) {
                return 'No at-risk assets found.';
            }
            const formattedSuggestions = suggestions.map((s) => ({
                ...s,
                timestamp: s.timestamp
                    ? s.timestamp
                        .toISOString()
                        .replace('T', ' ')
                        .replace(/\.\d+Z$/, ' UTC')
                    : 'N/A',
            }));
            return `Found ${suggestions.length} at-risk assets:\n${JSON.stringify(formattedSuggestions, null, 2)}`;
        }
        catch (err) {
            const error = err;
            logger_1.logger.error('Error in getAtRiskAssets:', error);
            return `Error fetching at-risk assets: ${error.message}`;
        }
    }
    validate(data) {
        if (!data || data.trim().length === 0) {
            return { isValid: false, reason: 'Empty result' };
        }
        if (data.includes('Error fetching') ||
            (data.toLowerCase().includes('error') && data.length < 200)) {
            return { isValid: false, reason: 'Tool returned error message' };
        }
        try {
            // If we got JSON, it shouldn't be empty
            const jsonMatch = data.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
                    return { isValid: false, reason: 'Empty JSON result' };
                }
            }
        }
        catch {
            // Ignore
        }
        return { isValid: true };
    }
    getFallbackMessage(error) {
        let fallback = 'Unable to fetch at-risk assets currently. Please ensure your system has recent data or try refreshing. If the issue persists, contact support.';
        if (error.message?.includes('timeout')) {
            fallback += ' The request took too long to process - try a more specific query.';
        }
        return fallback;
    }
}
exports.AtRiskAssetsTool = AtRiskAssetsTool;
