"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeQuery = executeQuery;
const snowflake_sdk_1 = __importDefault(require("snowflake-sdk"));
const config_1 = require("../config/config");
const logger_1 = require("./logger");
const connectionOptions = {
    account: config_1.env.SNOWFLAKE_ACCOUNT || 'test_account',
    username: config_1.env.SNOWFLAKE_USER || 'test_user',
    password: config_1.env.SNOWFLAKE_PASSWORD || 'test_password',
    warehouse: config_1.env.SNOWFLAKE_WAREHOUSE || 'test_warehouse',
    database: config_1.env.SNOWFLAKE_DATABASE || 'test_database',
    schema: config_1.env.SNOWFLAKE_SCHEMA || 'test_schema',
    role: config_1.env.SNOWFLAKE_ROLE || 'test_role',
};
let connection = snowflake_sdk_1.default.createConnection(connectionOptions);
function executeQuery(sql, binds = []) {
    return new Promise((resolve, reject) => {
        const execute = (conn) => {
            conn.execute({
                sqlText: sql,
                binds: binds,
                complete: (err, _stmt, rows) => {
                    if (err) {
                        logger_1.logger.error('Failed to execute statement:', err.message);
                        return reject(new Error('Snowflake query failed: ' + err.message));
                    }
                    resolve(rows || []);
                },
            });
        };
        if (connection.isUp()) {
            execute(connection);
        }
        else {
            logger_1.logger.debug('Snowflake connection is down. Reconnecting...');
            connection = snowflake_sdk_1.default.createConnection(connectionOptions);
            connection.connect((err, _conn) => {
                if (err) {
                    logger_1.logger.error('Unable to connect to Snowflake:', err.message);
                    return reject(new Error('Failed to connect to Snowflake'));
                }
                execute(connection);
            });
        }
    });
}
