"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationalRecommendationsTool = void 0;
const db_1 = require("../../../../config/db");
const logger_1 = require("../../../../utils/logger");
class OperationalRecommendationsTool {
    constructor() {
        this.name = 'get_operational_recommendations';
        this.description = 'Fetch operational optimization suggestions.';
        this.parameters = [
            {
                name: 'limit',
                type: 'number',
                description: "Default is 5. IMPORTANT: If user asks for 'all', 'everything', or a specific date range, set limit to 100.",
            },
            {
                name: 'status',
                type: 'string',
                description: "Optional: '[STATUS_FILTER]'",
                required: false,
            },
            {
                name: 'priority',
                type: 'string',
                description: "Optional: '[PRIORITY_LEVEL]'",
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
            const { limit, status, priority, organization_id } = params;
            const where = { organization_id };
            if (status)
                where.status = status;
            if (priority)
                where.priority = priority;
            const recommendations = await db_1.prisma.operation_suggestion.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: limit || 5,
            });
            if (recommendations.length === 0) {
                return 'No operational recommendations found for the specified criteria.';
            }
            const formattedRecommendations = recommendations.map((r) => ({
                ...r,
                created_at: r.created_at
                    ? r.created_at
                        .toISOString()
                        .replace('T', ' ')
                        .replace(/\.\d+Z$/, ' UTC')
                    : 'N/A',
            }));
            return `Found ${recommendations.length} operational recommendations:\n${JSON.stringify(formattedRecommendations, null, 2)}`;
        }
        catch (err) {
            const error = err;
            logger_1.logger.error('Error in getOperationalRecommendations:', error);
            return `Error fetching recommendations: ${error.message}`;
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
        let fallback = 'Operational recommendations are temporarily unavailable. Please try again or check if the system is processing updates.';
        if (error.message?.includes('timeout')) {
            fallback += ' The request took too long to process - try a more specific query.';
        }
        return fallback;
    }
}
exports.OperationalRecommendationsTool = OperationalRecommendationsTool;
