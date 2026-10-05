import { AgentTool } from '../interfaces/tool.interface';
import { AnomalyReportTool } from './anomaly-report/anomaly-report.tool';
import { AtRiskAssetsTool } from './at-risk-assets/at-risk-assets.tool';
import { OperationalRecommendationsTool } from './operational-recommendations/operational-recommendations.tool';
import { ProductionDataTool } from './production-data/production-data.tool';
import { logger } from '../../../utils/logger';

import { SqlAnalyticsTool } from './sql/sql.tool';
import { ClarifyIntentTool } from './clarify/clarify.tool';

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  constructor() {
    this.registerTool(new AnomalyReportTool());
    this.registerTool(new AtRiskAssetsTool());
    this.registerTool(new OperationalRecommendationsTool());
    this.registerTool(new ProductionDataTool());
    this.registerTool(new SqlAnalyticsTool());
    this.registerTool(new ClarifyIntentTool());
  }

  private registerTool(tool: AgentTool) {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns a formatted string of tool signatures.
   */
  public getToolSignatures(organizationId?: string): string {
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

  public async executeTool(toolName: string, params: Record<string, unknown>): Promise<string> {
    logger.debug(`🔧 Executing Tool: ${toolName}`, params);
    const tool = this.tools.get(toolName);
    if (!tool) {
      return 'No valid tool found for this request.';
    }

    try {
      // Execute tool with 30-second timeout to prevent hanging
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Tool execution timeout after 90 seconds')),
          90000
        );
      });

      try {
        const result = await Promise.race([tool.execute(params), timeoutPromise]);
        logger.debug(`✅ Tool execution succeeded: ${toolName}`);
        return result;
      } finally {
        if (timeoutId!) clearTimeout(timeoutId);
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      logger.error(`❌ Tool execution failed for ${toolName}:`, errorMsg);
      return `Error executing ${toolName}: ${errorMsg}`;
    }
  }
}

export const toolRegistry = new ToolRegistry();
