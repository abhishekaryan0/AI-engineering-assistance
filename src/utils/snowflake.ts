import snowflake, { Connection, SnowflakeError, Binds, RowStatement } from 'snowflake-sdk';
import { env } from '../config/config';
import { logger } from './logger';

const connectionOptions = {
  account: env.SNOWFLAKE_ACCOUNT || 'test_account',
  username: env.SNOWFLAKE_USER || 'test_user',
  password: env.SNOWFLAKE_PASSWORD || 'test_password',
  warehouse: env.SNOWFLAKE_WAREHOUSE || 'test_warehouse',
  database: env.SNOWFLAKE_DATABASE || 'test_database',
  schema: env.SNOWFLAKE_SCHEMA || 'test_schema',
  role: env.SNOWFLAKE_ROLE || 'test_role',
};

let connection = snowflake.createConnection(connectionOptions);

export function executeQuery<T>(sql: string, binds: Binds = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const execute = (conn: Connection) => {
      conn.execute({
        sqlText: sql,
        binds: binds,

        complete: (err: SnowflakeError | undefined, _stmt: RowStatement, rows?: T[]) => {
          if (err) {
            logger.error('Failed to execute statement:', err.message);
            return reject(new Error('Snowflake query failed: ' + err.message));
          }
          resolve(rows || []);
        },
      });
    };

    if (connection.isUp()) {
      execute(connection);
    } else {
      logger.debug('Snowflake connection is down. Reconnecting...');
      connection = snowflake.createConnection(connectionOptions);
      connection.connect((err, _conn) => {
        if (err) {
          logger.error('Unable to connect to Snowflake:', err.message);
          return reject(new Error('Failed to connect to Snowflake'));
        }
        execute(connection);
      });
    }
  });
}
