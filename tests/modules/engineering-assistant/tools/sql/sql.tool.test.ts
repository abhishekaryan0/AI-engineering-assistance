import { SqlAnalyticsTool } from '../../../../../src/modules/engineering-assistant/tools/sql/sql.tool';
import { executeQuery } from '../../../../../src/utils/snowflake';
import { logger } from '../../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../../src/utils/snowflake', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('SqlAnalyticsTool', () => {
  let tool: SqlAnalyticsTool;

  beforeEach(() => {
    tool = new SqlAnalyticsTool();
    jest.clearAllMocks();
  });

  describe('Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('sql_analytics_db');
    });

    it('should have description', () => {
      expect(tool.description).toContain('Executes a direct READ-ONLY SQL query');
    });

    it('should define required parameters', () => {
      expect(tool.parameters).toHaveLength(2);
      expect(tool.parameters[0].name).toBe('sql_query');
      expect(tool.parameters[0].required).toBe(true);
      expect(tool.parameters[1].name).toBe('organization_id');
      expect(tool.parameters[1].required).toBe(true);
    });
  });

  describe('execute()', () => {
    it('should return error if no query is provided', async () => {
      const result = await tool.execute({ sql_query: '' });
      expect(result).toBe('Execution failed. No SQL query provided.');
    });

    it('should block non-SELECT queries', async () => {
      const result = await tool.execute({
        sql_query: 'DROP TABLE something',
        organization_id: 'org-123',
      });
      expect(result).toBe('Security Error: Only SELECT queries are permitted.');

      const result2 = await tool.execute({
        sql_query: 'DELETE FROM test',
        organization_id: 'org-123',
      });
      expect(result2).toBe('Security Error: Only SELECT queries are permitted.');
    });

    it('should append LIMIT 200 as default if missing', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([{ id: 1 }]);

      const query = 'SELECT * FROM WELL_STATUS';
      await tool.execute({ sql_query: query, organization_id: 'org-123' });

      expect(executeQuery).toHaveBeenCalledWith(`${query} LIMIT 200`);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should infer LIMIT from user-requested count in query (e.g. "100 readings")', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([{ id: 1 }]);

      // Simulate query having no LIMIT but matching a number pattern from the original SQL text
      const query = `SELECT * FROM WELL_SENSOR_READINGS WHERE WELL_ID='Bronco-22-1-V' ORDER BY TIMESTAMP DESC`;
      // This passes '100 readings' inside sql_query so our regex can infer the limit
      await tool.execute({
        sql_query: `${query} -- last 100 readings`,
        organization_id: 'org-123',
      });

      // The inferred limit from "100 readings" should be applied since no LIMIT in query
      const calledWith = (executeQuery as jest.Mock).mock.calls[0][0] as string;
      expect(calledWith).toContain('LIMIT 100');
    });

    it('should NOT append LIMIT if already present', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([{ id: 1 }]);

      const query = 'SELECT * FROM WELL_STATUS LIMIT 10';
      await tool.execute({ sql_query: query, organization_id: 'org-123' });

      expect(executeQuery).toHaveBeenCalledWith(query);
    });

    it('should correctly extract table names for logging', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([]);

      const query = 'SELECT * FROM TABLE_A JOIN TABLE_B ON A=B LIMIT 10';
      await tool.execute({ sql_query: query, organization_id: 'org-123' });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('TABLE_A, TABLE_B'));
    });

    it('should log UNKNOWN_TABLE if no table names are found', async () => {
      (executeQuery as jest.Mock).mockResolvedValue([{ 1: 1 }]);

      const query = 'SELECT 1 LIMIT 1';
      await tool.execute({ sql_query: query, organization_id: 'org-123' });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('UNKNOWN_TABLE'));
    });

    it('should execute successfully and return JSON string', async () => {
      const mockData = [{ id: 1, val: 'test' }];
      (executeQuery as jest.Mock).mockResolvedValue(mockData);

      const resultString = await tool.execute({
        sql_query: 'SELECT * FROM test',
        organization_id: 'org-123',
      });
      const result = JSON.parse(resultString);

      expect(result.success).toBe(true);
      expect(result.row_count).toBe(1);
      expect(result.data).toEqual(mockData);
    });

    it('should handle database errors gracefully', async () => {
      (executeQuery as jest.Mock).mockRejectedValue(new Error('Syntax error'));

      const result = await tool.execute({
        sql_query: 'SELECT * FROM bad_table',
        organization_id: 'org-123',
      });

      expect(result).toBe('Database Error: Syntax error. Verify table names and syntax.');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('validate()', () => {
    it('should always return valid', () => {
      expect(tool.validate('any data')).toEqual({ isValid: true });
    });
  });

  describe('getFallbackMessage()', () => {
    it('should return a standard fallback message', () => {
      expect(tool.getFallbackMessage(new Error('timeout'))).toBe(
        'Unable to query the analytics database at this time.'
      );
    });
  });
});
