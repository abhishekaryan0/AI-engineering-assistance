import { ToolRegistry } from '../../../../src/modules/engineering-assistant/tools/ToolRegistry';
import { llmService } from '../../../../src/services/llm/llm.service';
import { AgentTool } from '../../../../src/modules/engineering-assistant/interfaces/tool.interface';

// Mock dependencies
jest.mock('../../../../src/services/llm/llm.service', () => ({
  llmService: {
    chatJson: jest.fn(),
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the concrete tool classes to avoid instantiating them fully
jest.mock(
  '../../../../src/modules/engineering-assistant/tools/anomaly-report/anomaly-report.tool',
  () => {
    return {
      AnomalyReportTool: class {
        name = 'anomaly_report';
        description = 'Test Description';
        parameters = [{ name: 'site_id', type: 'string', description: 'ID' }];
        execute = jest.fn().mockResolvedValue('Report Data');
      },
    };
  }
);
jest.mock(
  '../../../../src/modules/engineering-assistant/tools/at-risk-assets/at-risk-assets.tool',
  () => {
    return {
      AtRiskAssetsTool: class {
        name = 'at_risk_assets';
        description = 'At Risk Assets';
        parameters = [];
        execute = jest.fn();
      },
    };
  }
);
jest.mock(
  '../../../../src/modules/engineering-assistant/tools/operational-recommendations/operational-recommendations.tool',
  () => {
    return {
      OperationalRecommendationsTool: class {
        name = 'op_recommendations';
        description = 'Ops Recs';
        parameters = [];
        execute = jest.fn();
      },
    };
  }
);
jest.mock(
  '../../../../src/modules/engineering-assistant/tools/production-data/production-data.tool',
  () => {
    return {
      ProductionDataTool: class {
        name = 'production_data';
        description = 'Prod Data';
        parameters = [];
        execute = jest.fn();
      },
    };
  }
);

describe('ToolRegistry', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    const {
      ToolRegistry,
    } = require('../../../../src/modules/engineering-assistant/tools/ToolRegistry'); // Re-require to get fresh instance if necessary, but we can just use the class
    toolRegistry = new ToolRegistry();
  });

  it('should register tools on initialization', () => {
    const tool = toolRegistry.getTool('anomaly_report');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('anomaly_report');
  });

  it('should generate tool signatures', () => {
    const signatures = toolRegistry.getToolSignatures();
    expect(signatures).toContain('anomaly_report');
    expect(signatures).toContain('Test Description');
  });


  it('should execute a valid tool', async () => {
    const result = await toolRegistry.executeTool('anomaly_report', { site_id: '123' });
    expect(result).toBe('Report Data');
  });

  it('should return error for invalid tool', async () => {
    const result = await toolRegistry.executeTool('invalid_tool', {});
    expect(result).toBe('No valid tool found for this request.');
  });
});
