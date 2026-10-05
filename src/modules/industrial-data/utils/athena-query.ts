import {
    AthenaClient,
    StartQueryExecutionCommand,
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    QueryExecutionState,
} from '@aws-sdk/client-athena';
import { env } from '../../../config/config';
import { logger } from '../../../utils/logger';

const client = new AthenaClient({
    region: env.AWS_REGION,
    credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
});

const ATHENA_DB = env.ATHENA_DB_WEB;
export const TABLE_NAME = 'operation_recommendations';
export const ACTIONS_TABLE = 'operation_actions';
export const ANOMALY_REVIEWS_TABLE = 'anomaly_reviews';
export const ANOMALY_ACTIONS_TABLE = 'anomaly_review_actions';
export const ANOMALY_SUGGESTIONS_TABLE = 'anomaly_suggestions';
export const ALERT_ACTIONS_TABLE = 'alert_actions';
export const WELL_STATUS_TABLE = 'well_status';
export const DAILY_PRODUCTION_TABLE = 'daily_production';

let isSchemaInitialized = false;

/**
 * Helper to run a single Athena DDL/DML query and wait for it to complete.
 */
async function runAthenaDDL(sql: string, db?: string): Promise<void> {
    const startCommand = new StartQueryExecutionCommand({
        QueryString: sql,
        ...(db ? { QueryExecutionContext: { Database: db } } : {}),
        ResultConfiguration: { OutputLocation: env.ATHENA_OUTPUT_S3 },
        WorkGroup: env.ATHENA_WORKGROUP,
    });
    const { QueryExecutionId } = await client.send(startCommand);
    if (!QueryExecutionId) return;

    let finished = false;
    while (!finished) {
        const getCmd = new GetQueryExecutionCommand({ QueryExecutionId });
        const res = await client.send(getCmd);
        const state = res.QueryExecution?.Status?.State;
        if (state === 'SUCCEEDED' || state === 'FAILED' || state === 'CANCELLED') {
            finished = true;
        } else {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}

/**
 * Executes a SQL query using AWS Athena.
 * Handles polling and data transformation automatically.
 */
export async function executeAthenaQuery<T>(sql: string, isRetry: boolean = false): Promise<T[]> {
    try {
        const startCommand = new StartQueryExecutionCommand({
            QueryString: sql,
            QueryExecutionContext: { Database: ATHENA_DB },
            ResultConfiguration: {
                OutputLocation: env.ATHENA_OUTPUT_S3,
            },
            WorkGroup: env.ATHENA_WORKGROUP,
        });

        const { QueryExecutionId } = await client.send(startCommand);
        if (!QueryExecutionId) {
            throw new Error('Failed to initiate Athena query execution');
        }

        logger.info(`Athena query ${QueryExecutionId} matching...`);

        let status: QueryExecutionState | undefined;
        let retryCount = 0;
        const maxRetries = 120; // 120 second max wait (increased for safety)

        while (status !== 'SUCCEEDED' && retryCount < maxRetries) {
            const getExecutionCommand = new GetQueryExecutionCommand({ QueryExecutionId });
            const response = await client.send(getExecutionCommand);
            status = response.QueryExecution?.Status?.State;

            if (status === 'FAILED') {
                const reason = response.QueryExecution?.Status?.StateChangeReason || '';
                logger.error(`Athena Query Failed. StageChangeReason: "${reason}"`);

                // SELF-HEALING: If it's a type mismatch or missing table error, repair and retry
                if (!isRetry && (
                    reason.includes('HIVE_CANNOT_OPEN_SPLIT') ||
                    reason.includes('GroupColumnIO') ||
                    reason.includes('PrimitiveColumnIO') ||
                    reason.includes('TABLE_NOT_FOUND')
                )) {
                    logger.info(`Detected Athena issue (${reason.includes('TABLE_NOT_FOUND') ? 'Missing Table' : 'Schema Mismatch'}). Attempting automatic self-healing...`);
                    try {
                        if (reason.includes('TABLE_NOT_FOUND')) {
                            // Re-initialize schema if table is missing
                            await ensureAthenaSchema(true);
                        } else {
                            // Use the optimized repair script which identifies and stringifies complex objects in-place
                            let repairCmd = 'npx ts-node --transpile-only repair-all-parquets.ts';

                            // OPTIMIZATION: Extract organization prefix from error to target the repair
                            const s3Match = reason.match(/s3:\/\/([^\/]+)\/([^\/]+)\//);
                            if (s3Match && s3Match[2] && s3Match[2].length > 20) {
                                const orgId = s3Match[2];
                                logger.info(`Extracting Organization ID from error: ${orgId}`);
                                repairCmd += ` ${orgId}`;
                            }

                            const { execSync } = require('child_process');
                            logger.info(`Executing Auto-Repair: ${repairCmd}`);
                            execSync(repairCmd, {
                                stdio: 'inherit',
                                env: { ...process.env, NODE_OPTIONS: '--no-warnings' }
                            });
                        }

                        logger.info('Self-healing complete. Retrying original query...');
                        return await executeAthenaQuery<T>(sql, true);
                    } catch (repairErr) {
                        logger.error('Automatic self-healing failed:', repairErr);
                    }
                }


                throw new Error(`Athena Query Failed: ${reason}`);
            }

            if (status === 'CANCELLED') {
                throw new Error('Athena Query was cancelled');
            }

            if (status !== 'SUCCEEDED') {
                retryCount++;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        if (status !== 'SUCCEEDED') {
            throw new Error('Athena query timed out after 120 seconds.');
        }

        const getResultsCommand = new GetQueryResultsCommand({ QueryExecutionId });
        const resultsResponse = await client.send(getResultsCommand);

        const rows = resultsResponse.ResultSet?.Rows || [];
        if (rows.length === 0) return [];

        // The first row contains headers
        const headers = rows[0].Data?.map((d) => d.VarCharValue || '') || [];
        const dataRows = rows.slice(1);

        return dataRows.map((row) => {
            const item: any = {};
            row.Data?.forEach((cell, index) => {
                const key = headers[index];
                item[key] = cell.VarCharValue;
            });
            return item as T;
        });
    } catch (error) {
        logger.error('Athena Execution Error:', error);
        throw error;
    }
}

/**
 * Ensures the industrial-data specific Athena schema is initialized.
 */
export async function ensureAthenaSchema(force: boolean = false): Promise<void> {
    if (isSchemaInitialized && !force) {
        return;
    }

    const bucket = env.AWS_ML_MODELS_BUCKET_NAME;
    const db = ATHENA_DB;

    logger.info(`Checking/Initializing Athena Schema for database: ${db}`);

    // Step 1: Create database
    try {
        await runAthenaDDL(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
    } catch (e) {
        logger.warn(`DB create warning: ${e}`);
    }

    // Step 2: Handle Force Recreation (Drop tables before creating)
    if (force) {
        try {
            logger.info('Forcing recreation of dynamic schema tables...');
            await Promise.all([
                runAthenaDDL(`DROP TABLE IF EXISTS \`${db}\`.\`${WELL_STATUS_TABLE}\``),
                runAthenaDDL(`DROP TABLE IF EXISTS \`${db}\`.\`${ANOMALY_SUGGESTIONS_TABLE}\``),
                runAthenaDDL(`DROP TABLE IF EXISTS \`${db}\`.\`${DAILY_PRODUCTION_TABLE}\``)
            ]);
        } catch (e) {
            logger.warn(`Drop table warning: ${e}`);
        }
    }

    // Step 3: Define and Initialize tables in parallel for speed
    const tableQueries = [
        // operation_recommendations
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${TABLE_NAME}\` (
          id string, well_id string, category string, action string, status string, priority string, 
          confidence_percent string, production_increase_bbl_day string, production_increase_percent string,
          daily_expense_benefit_usd string, implementation_cost_usd string, net_daily_benefit_usd string, 
          asset_value_increase_usd string, time_reduced_hours string, detailed_analysis string,
          current_performance string, optimal_performance string, conservative_approach string, 
          aggressive_optimization string, hybrid_model string, recommended_model string,
          citations string, referenced_data string, supporting_analysis string,
          data_quality string, reason string, expected_impact string, metrics_json string, 
          created_at string, updated_at string, status_reason string
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

        // operation_actions
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${ACTIONS_TABLE}\` (
          id string, title string, audience string, location string, scheduled_date string, 
          description string, communication_methods string, created_at string, operation_recommendations_id string
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

        // anomaly_reviews
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${ANOMALY_REVIEWS_TABLE}\` (
          id string, well_id string, event_date string, detected_at string, anomaly_code string, 
          category string, severity string, title string, ui_text string, impact_value double, 
          chart_data string, status string, reason string, impact_metrics string, updated_at string
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

        // anomaly_review_actions
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${ANOMALY_ACTIONS_TABLE}\` (
          id string, title string, audience string, location string, scheduled_date string, 
          description string, communication_methods string, created_at string, anomaly_reviews_id string
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

        // anomaly_suggestions (use string for complex fields to tolerate producer variations)
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${ANOMALY_SUGGESTIONS_TABLE}\` (
          id string, well_id string, timestamp string, alert_title string,
          severity string, status string, confidence string, description string,
          suggested_actions string, explanation string, created_at string,
          historical_context string,
          risk_analysis string,
          asset_id string, reason string,
          raw_anomaly_data string,
          lift_type string, category string, well_status string
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/'
        TBLPROPERTIES ("parquet.column.index.access"="false")`,

        // alert_actions
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${ALERT_ACTIONS_TABLE}\` (
          id string, title string, audience string, location string, scheduled_date string, 
          description string, communication_methods string, created_at string, anomaly_suggestions_id string
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

        // well_status
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${WELL_STATUS_TABLE}\` (
          well_id string, lift_type string, status string, 
          last_reading_timestamp timestamp, last_reading_age_hours double,
          strokes_per_minute double, motor_current double, injection_rate double,
          anomaly_count_24h int, critical_anomaly_count_24h int,
          status_reason string, updated_at timestamp
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

        // daily_production
        `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`${DAILY_PRODUCTION_TABLE}\` (
          \`date\` date, asset_id string, facility_id string, lift_type string, 
          true_oil double, true_water double, true_gas double,
          status string
        ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`
    ];

    try {
        await Promise.all(tableQueries.map(q => runAthenaDDL(q)));
        logger.info(`✅ Core tables initialized.`);
    } catch (e) {
        logger.warn(`Bulk table query warning: ${e}`);
    }

    logger.info('✅ Athena schema initialization complete.');
    isSchemaInitialized = true;
}

/**
 * Register a partition in Athena if it hasn't been registered in this session.
 * Uses runAthenaDDL for speed (no polling for results/parsing).
 */
export async function registerPartition(tableName: string, orgId: string, location: string): Promise<void> {
    const partitionQuery = `ALTER TABLE \`${ATHENA_DB}\`.\`${tableName}\` ADD IF NOT EXISTS PARTITION (organization_id='${orgId}') LOCATION '${location}'`;
    try {
        await runAthenaDDL(partitionQuery);
        logger.info(`✅ Registered partition for ${tableName} (Org: ${orgId})`);
    } catch (e) {
        logger.warn(`Partition registration warning for ${tableName}:`, e);
    }
}
