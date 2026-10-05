"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionDataTool = void 0;
const production_data_service_1 = require("../../services/data/production-data.service");
const logger_1 = require("../../../../utils/logger");
class ProductionDataTool {
    constructor() {
        this.name = 'get_production_data';
        this.description = 'Fetch detailed production data (pressure, flow rate, temperature) for ONE SPECIFIC well. Use this ONLY when the user asks for charts or detailed metrics for a SINGLE KNOWN WELL ID (e.g. "for WELL-XXXX"). IF the user asks for generic data, summaries, daily totals, or cross-well reports (e.g. "tell me daily production data"), you MUST use the `sql_analytics_db` tool instead.';
        this.parameters = [
            {
                name: 'well_id',
                type: 'string',
                description: 'The ID of the well to fetch data for (e.g., WELL-XXXX).',
                required: true,
            },
            {
                name: 'anomaly_id',
                type: 'string',
                description: 'The ID of the anomaly if applicable.',
                required: false,
            },
            {
                name: 'startDate',
                type: 'string',
                description: 'Start date in ISO format.',
                required: false,
            },
            {
                name: 'endDate',
                type: 'string',
                description: 'End date in ISO format.',
                required: false,
            },
        ];
    }
    async execute(params) {
        try {
            const { well_id, anomaly_id, startDate, endDate, organization_id } = params;
            if (!well_id) {
                return 'Error: well_id is required.';
            }
            if (!organization_id) {
                return 'Error: organization_id is required.';
            }
            const result = await production_data_service_1.productionDataService.getProductionData(well_id, organization_id, startDate, endDate, anomaly_id);
            return JSON.stringify({
                summary: `Production data for ${well_id} (${result.source})`,
                dataCount: result.data.length,
                source: result.source,
                data: result.data,
            });
        }
        catch (err) {
            const error = err;
            logger_1.logger.error('Error executing ProductionDataTool:', error);
            return `Error fetching production data: ${error.message}`;
        }
    }
    validate(data) {
        // Empty result check
        if (!data || data.trim().length === 0) {
            return { isValid: false, reason: 'Empty result' };
        }
        // Check for error messages in output
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
            logger_1.logger.debug(`Note: Could not parse JSON from ${this.name}, but continuing...`);
        }
        return { isValid: true };
    }
    getFallbackMessage(error) {
        let fallback = 'Production data is temporarily unavailable. Please retry your request or check the system status.';
        if (error.message?.includes('timeout')) {
            fallback += ' The request took too long to process - try a more specific query.';
        }
        return fallback;
    }
}
exports.ProductionDataTool = ProductionDataTool;
