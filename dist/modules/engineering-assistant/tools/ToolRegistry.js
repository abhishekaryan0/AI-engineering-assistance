"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolRegistry = exports.ToolRegistry = void 0;
const anomaly_report_tool_1 = require("./anomaly-report/anomaly-report.tool");
const at_risk_assets_tool_1 = require("./at-risk-assets/at-risk-assets.tool");
const operational_recommendations_tool_1 = require("./operational-recommendations/operational-recommendations.tool");
const production_data_tool_1 = require("./production-data/production-data.tool");
const logger_1 = require("../../../utils/logger");
const sql_tool_1 = require("./sql/sql.tool");
const clarify_tool_1 = require("./clarify/clarify.tool");
class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.registerTool(new anomaly_report_tool_1.AnomalyReportTool());
        this.registerTool(new at_risk_assets_tool_1.AtRiskAssetsTool());
        this.registerTool(new operational_recommendations_tool_1.OperationalRecommendationsTool());
        this.registerTool(new production_data_tool_1.ProductionDataTool());
        this.registerTool(new sql_tool_1.SqlAnalyticsTool());
        this.registerTool(new clarify_tool_1.ClarifyIntentTool());
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    getTool(name) {
        return this.tools.get(name);
    }
    /**
     * Returns a formatted string of tool signatures.
     */
    getToolSignatures(organizationId) {
        let prompt = ``;
        let index = 1;
        this.tools.forEach((tool) => {
            let description = tool.description;
            if (organizationId) {
                description = description.replace(/\{\{organization_id\}\}/g, organizationId);
            }
            prompt += `${index}. "${tool.name}": ${description}\n`;
            prompt += `   - params:\n`;
            tool.parameters.forEach((p) => {
                prompt += `     - ${p.name} (${p.type})${p.required === false ? ' (optional)' : ''}. ${p.description}\n`;
            });
            prompt += `\n`;
            index++;
        });
        return prompt;
    }
    async executeTool(toolName, params) {
        logger_1.logger.debug(`🔧 Executing Tool: ${toolName}`, params);
        const tool = this.tools.get(toolName);
        if (!tool) {
            return 'No valid tool found for this request.';
        }
        try {
            // Execute tool with 30-second timeout to prevent hanging
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Tool execution timeout after 90 seconds')), 90000);
            });
            try {
                const result = await Promise.race([tool.execute(params), timeoutPromise]);
                logger_1.logger.debug(`✅ Tool execution succeeded: ${toolName}`);
                return result;
            }
            finally {
                if (timeoutId)
                    clearTimeout(timeoutId);
            }
        }
        catch (error) {
            const errorMsg = error.message;
            logger_1.logger.error(`❌ Tool execution failed for ${toolName}:`, errorMsg);
            return `Error executing ${toolName}: ${errorMsg}`;
        }
    }
}
exports.ToolRegistry = ToolRegistry;
exports.toolRegistry = new ToolRegistry();
