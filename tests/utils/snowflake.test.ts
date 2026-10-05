/**
 * Snowflake Utility Tests
 * Tests for Snowflake database connection and query execution
 */

import * as snowflake from 'snowflake-sdk';
import { executeQuery } from '../../src/utils/snowflake';
import { env } from '../../src/config/config';
import { logger } from '../../src/utils/logger';

jest.mock('snowflake-sdk', () => {
  const mConnection = {
    isUp: jest.fn(),
    execute: jest.fn(),
    connect: jest.fn(),
  };
  return {
    createConnection: jest.fn(() => mConnection),
  };
});

jest.mock('../../src/config/config', () => ({
  env: {
    SNOWFLAKE_ACCOUNT: 'test_account',
    SNOWFLAKE_USER: 'test_user',
    SNOWFLAKE_PASSWORD: 'test_password',
    SNOWFLAKE_WAREHOUSE: 'test_warehouse',
    SNOWFLAKE_DATABASE: 'test_database',
    SNOWFLAKE_SCHEMA: 'test_schema',
    SNOWFLAKE_ROLE: 'test_role',
  },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Snowflake Utility', () => {
  let mockConnection: any;

  beforeEach(() => {
    // Retrieve the latest mock connection object
    const createConnMock = snowflake.createConnection as jest.Mock;
    if (createConnMock.mock.results.length > 0) {
      mockConnection = createConnMock.mock.results[createConnMock.mock.results.length - 1].value;
    }

    // Reset implementations for each test if connection exists
    if (mockConnection) {
      mockConnection.isUp.mockReset();
      mockConnection.execute.mockReset();
      mockConnection.connect.mockReset();

      mockConnection.isUp.mockReturnValue(true);
      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });
      mockConnection.connect.mockImplementation((cb: Function) => cb(null, mockConnection));
    }
  });

  describe('executeQuery', () => {
    it('should execute simple query', async () => {
      const sql = 'SELECT * FROM users';
      const mockRows = [{ id: 1, name: 'John' }];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql);

      expect(result).toEqual(mockRows);
    });

    it('should execute query with binds', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const binds = [1];
      const mockRows = [{ id: 1, name: 'John' }];

      mockConnection.execute.mockImplementation(({ sqlText, binds: queryBinds, complete }: any) => {
        expect(sqlText).toBe(sql);
        expect(queryBinds).toEqual(binds);
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql, binds);

      expect(result).toEqual(mockRows);
    });

    it('should execute query with multiple parameters', async () => {
      const sql = 'SELECT * FROM users WHERE name = ? AND email = ?';
      const binds = ['John', 'john@example.com'];
      const mockRows = [{ id: 1, name: 'John', email: 'john@example.com' }];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql, binds);

      expect(result).toEqual(mockRows);
    });

    it('should return empty array for no results', async () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const binds = [999];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      const result = await executeQuery(sql, binds);

      expect(result).toEqual([]);
    });

    it('should return undefined as empty array', async () => {
      const sql = 'SELECT * FROM users';

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, undefined);
      });

      const result = await executeQuery(sql);

      expect(result).toEqual([]);
    });

    it('should handle query errors', async () => {
      const sql = 'SELECT * FROM nonexistent_table';
      const error = new Error('Table does not exist');

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(error, null);
      });

      await expect(executeQuery(sql)).rejects.toThrow('Snowflake query failed');
    });

    it('should log errors on query failure', async () => {
      const sql = 'SELECT * FROM users';
      const error = new Error('Connection error');

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(error, null);
      });

      await expect(executeQuery(sql)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });

    it('should support INSERT statements', async () => {
      const sql = 'INSERT INTO users (name, email) VALUES (?, ?)';
      const binds = ['John', 'john@example.com'];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      const result = await executeQuery(sql, binds);

      expect(result).toEqual([]);
    });

    it('should support UPDATE statements', async () => {
      const sql = 'UPDATE users SET name = ? WHERE id = ?';
      const binds = ['Jane', 1];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, [{ updated: 1 }]);
      });

      const result = await executeQuery(sql, binds);

      expect(result).toEqual([{ updated: 1 }]);
    });

    it('should support DELETE statements', async () => {
      const sql = 'DELETE FROM users WHERE id = ?';
      const binds = [1];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      const result = await executeQuery(sql, binds);

      expect(result).toEqual([]);
    });

    it('should support aggregate queries', async () => {
      const sql = 'SELECT COUNT(*) as count FROM users';
      const mockRows = [{ count: 100 }];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql);

      expect(result).toEqual(mockRows);
    });

    it('should support JOIN queries', async () => {
      const sql = 'SELECT u.name, o.order_id FROM users u JOIN orders o ON u.id = o.user_id';
      const mockRows = [
        { name: 'John', order_id: 1 },
        { name: 'John', order_id: 2 },
      ];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql);

      expect(result).toEqual(mockRows);
    });

    it('should support GROUP BY queries', async () => {
      const sql = 'SELECT department, COUNT(*) FROM employees GROUP BY department';
      const mockRows = [
        { department: 'sales', count: 10 },
        { department: 'engineering', count: 15 },
      ];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql);

      expect(result).toEqual(mockRows);
    });

    it('should support complex WHERE clauses', async () => {
      const sql = 'SELECT * FROM users WHERE age > ? AND status = ?';
      const binds = [18, 'active'];
      const mockRows = [{ id: 1, name: 'John', age: 25, status: 'active' }];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql, binds);

      expect(result).toEqual(mockRows);
    });

    it('should handle large result sets', async () => {
      const sql = 'SELECT * FROM large_table';
      const mockRows = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        data: `Row ${i + 1}`,
      }));

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = await executeQuery(sql);

      expect(result.length).toBe(10000);
    });

    it('should preserve data types', async () => {
      const sql = 'SELECT * FROM mixed_types';
      const mockRows = [
        {
          string: 'text',
          number: 42,
          decimal: 3.14,
          boolean: true,
          date: '2024-01-01',
          null: null,
        },
      ];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, mockRows);
      });

      const result = (await executeQuery(sql)) as any[];

      expect(result[0].number).toBe(42);
      expect(result[0].decimal).toBe(3.14);
      expect(result[0].boolean).toBe(true);
      expect(result[0].null).toBe(null);
    });
  });

  describe('connection management', () => {
    it('should reuse active connection', async () => {
      mockConnection.isUp.mockReturnValue(true);

      const sql = 'SELECT * FROM users';
      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      await executeQuery(sql);

      expect(mockConnection.isUp).toHaveBeenCalled();
      expect(mockConnection.execute).toHaveBeenCalled();
    });

    it('should reconnect if connection is down', async () => {
      mockConnection.isUp.mockReturnValue(false);

      const newConnection = {
        isUp: jest.fn().mockReturnValue(true),
        execute: jest.fn(),
        connect: jest.fn(),
      };

      let createConnectionCallCount = 0;
      (snowflake.createConnection as jest.Mock).mockImplementation(() => {
        createConnectionCallCount++;
        return createConnectionCallCount === 1 ? mockConnection : newConnection;
      });

      mockConnection.connect.mockImplementation((callback: Function) => {
        callback(undefined, newConnection);
      });

      newConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      const sql = 'SELECT * FROM users';
      await executeQuery(sql);

      expect(mockConnection.connect).toHaveBeenCalled();
    });

    it.skip('should handle connection errors on reconnect', async () => {
      mockConnection.isUp.mockReturnValue(false);

      mockConnection.connect.mockImplementation((callback: Function) => {
        callback(new Error('Connection timeout'), null);
      });

      const sql = 'SELECT * FROM users';

      await expect(executeQuery(sql)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });

    it.skip('should log debug message when reconnecting', async () => {
      mockConnection.isUp.mockReturnValue(false);

      mockConnection.connect.mockImplementation((callback: Function) => {
        callback(new Error('Reconnection failed'), null);
      });

      const sql = 'SELECT * FROM users';

      await expect(executeQuery(sql)).rejects.toThrow();

      expect(logger.debug).toHaveBeenCalledWith(expect.stringMatching(/reconnecting/i));
    });
  });

  describe('edge cases', () => {
    it('should handle empty binds array', async () => {
      const sql = 'SELECT * FROM users';

      mockConnection.execute.mockImplementation(({ binds, complete }: any) => {
        expect(binds).toEqual([]);
        complete(undefined, null, []);
      });

      const result = await executeQuery(sql, []);

      expect(result).toEqual([]);
    });

    it('should handle null binds parameter', async () => {
      const sql = 'SELECT * FROM users';

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      const result = await executeQuery(sql, undefined as any);

      expect(result).toEqual([]);
    });

    it('should handle SQL with special characters', async () => {
      const sql = 'SELECT * FROM users WHERE email LIKE ?';
      const binds = ['%@example.com'];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      await executeQuery(sql, binds);

      expect(mockConnection.execute).toHaveBeenCalled();
    });

    it('should handle SQL injection prevention with binds', async () => {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const binds = ["'; DROP TABLE users; --"];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      await executeQuery(sql, binds);

      expect(mockConnection.execute).toHaveBeenCalled();
    });

    it('should handle concurrent queries', async () => {
      mockConnection.execute.mockImplementation(({ complete }: any) => {
        setTimeout(() => complete(undefined, null, []), 10);
      });

      const queries = [
        executeQuery('SELECT 1'),
        executeQuery('SELECT 2'),
        executeQuery('SELECT 3'),
      ];

      const results = await Promise.all(queries);

      expect(results).toHaveLength(3);
    });

    it('should handle timeout-like delays', async () => {
      mockConnection.execute.mockImplementation(({ complete }: any) => {
        setTimeout(() => complete(undefined, null, []), 100);
      });

      const result = await executeQuery('SELECT * FROM users');

      expect(result).toEqual([]);
    });

    it('should handle multiple consecutive queries', async () => {
      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, [{ id: 1 }]);
      });

      const result1 = await executeQuery('SELECT * FROM table1');
      const result2 = await executeQuery('SELECT * FROM table2');
      const result3 = await executeQuery('SELECT * FROM table3');

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
      expect(result3).toHaveLength(1);
    });

    it('should handle query with no WHERE clause', async () => {
      const sql = 'SELECT * FROM users';

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      await executeQuery(sql);

      expect(mockConnection.execute).toHaveBeenCalled();
    });

    it('should handle parameterized query with special operators', async () => {
      const sql = 'SELECT * FROM users WHERE age >= ? AND age <= ?';
      const binds = [18, 65];

      mockConnection.execute.mockImplementation(({ complete }: any) => {
        complete(undefined, null, []);
      });

      await executeQuery(sql, binds);

      expect(mockConnection.execute).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should use environment variables for connection', () => {
      expect(snowflake.createConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'test_account',
          username: 'test_user',
          password: 'test_password',
          warehouse: 'test_warehouse',
          database: 'test_database',
          schema: 'test_schema',
          role: 'test_role',
        })
      );
    });

    it('should verify all connection parameters', () => {
      const callArgs = (snowflake.createConnection as jest.Mock).mock.calls[0][0];

      expect(callArgs).toHaveProperty('account');
      expect(callArgs).toHaveProperty('username');
      expect(callArgs).toHaveProperty('password');
      expect(callArgs).toHaveProperty('warehouse');
      expect(callArgs).toHaveProperty('database');
      expect(callArgs).toHaveProperty('schema');
      expect(callArgs).toHaveProperty('role');
    });
  });
});
