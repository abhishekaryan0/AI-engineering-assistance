"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnomalyReportTool = void 0;
const db_1 = require("../../../../config/db");
const logger_1 = require("../../../../utils/logger");
class AnomalyReportTool {
    constructor() {
        this.name = 'get_anomaly_report';
        this.description = 'Fetch a history of confirmed, reviewed anomalies. Use this for "past anomalies", "anomaly reports", or "history of defects".';
        this.parameters = [
            { name: 'startDate', type: 'ISO string', description: 'Filter by start date (or null)' },
            { name: 'endDate', type: 'ISO string', description: 'Filter by end date (or null)' },
            {
                name: 'limit',
                type: 'number',
                description: "Default is 5. IMPORTANT: If user asks for 'all', 'everything', or a specific date range, set limit to 100.",
            },
            {
                name: 'status',
                type: 'string',
                description: "Optional filter: '[STATUS_VALUE]', etc",
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
            const { startDate, endDate, limit, status, organization_id } = params;
            const where = { organization_id };
            if (startDate || endDate) {
                where.detected_at = {};
                if (startDate) {
                    where.detected_at.gte = new Date(startDate);
                }
                if (endDate) {
                    where.detected_at.lte = new Date(endDate);
                }
            }
            if (status) {
                where.status = status;
            }
            const reviews = await db_1.prisma.anomaly_review.findMany({
                where,
                orderBy: { detected_at: 'desc' },
                take: limit || 5,
            });
            if (reviews.length === 0) {
                return 'No anomalies found for the specified criteria.';
            }
            const formattedReviews = reviews.map((r) => ({
                ...r,
                detected_at: r.detected_at
                    ? r.detected_at
                        .toISOString()
                        .replace('T', ' ')
                        .replace(/\.\d+Z$/, ' UTC')
                    : 'N/A',
            }));
            return `Found ${reviews.length} anomalies:\n${JSON.stringify(formattedReviews, null, 2)}`;
        }
        catch (err) {
            const error = err;
            logger_1.logger.error('Error in getAnomalyReport:', error);
            return `Error fetching anomalies: ${error.message}`;
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
            // Ignore JSON parse errors as some tools return plain text
        }
        return { isValid: true };
    }
    getFallbackMessage(error) {
        let fallback = 'Unable to retrieve anomaly reports at this time. This could be due to a temporary system issue. Please try again in a few moments.';
        if (error.message?.includes('timeout')) {
            fallback += ' The request took too long to process - try a more specific query.';
        }
        return fallback;
    }
}
exports.AnomalyReportTool = AnomalyReportTool;
