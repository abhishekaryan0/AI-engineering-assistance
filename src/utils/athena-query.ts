import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';
import { env } from '../config/config';
import { logger } from './logger';

const client = new AthenaClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

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
export async function executeAthenaQuery<T>(sql: string): Promise<T[]> {
  try {
    const startCommand = new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: { Database: env.ATHENA_DATABASE },
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
    const maxRetries = 90; // 90 second max wait

    while (status !== 'SUCCEEDED' && retryCount < maxRetries) {
      const getExecutionCommand = new GetQueryExecutionCommand({ QueryExecutionId });
      const response = await client.send(getExecutionCommand);
      status = response.QueryExecution?.Status?.State;

      if (status === 'FAILED') {
        const reason = response.QueryExecution?.Status?.StateChangeReason;
        logger.error(`Athena Query Failed: ${reason}`);
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
      throw new Error('Athena query timed out after 90 seconds.');
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
 * Drops old tables and recreates them with Parquet-compatible types.
 * IMPORTANT: The 'date' column in the Parquet file is INT32 (days since epoch),
 * so it must be defined as 'int' in the Athena schema, NOT as 'string'.
 */
export async function ensureAthenaSchema(): Promise<void> {
  const bucket = env.AWS_ML_MODELS_BUCKET_NAME;
  const db = env.ATHENA_DATABASE;

  logger.info(`Refreshing Athena Schema for database: ${db}`);

  // Step 1: Create database
  try {
    await runAthenaDDL(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
    logger.info('✅ Database ready.');
  } catch (e) {
    logger.warn(`DB create warning: ${e}`);
  }

  // Step 2: Drop old tables to force schema update (removes wrong column types)
  const tablesToDrop = ['DAILY_PRODUCTION', 'WELL_SENSOR_READINGS', 'OPERATIONS'];
  for (const table of tablesToDrop) {
    try {
      await runAthenaDDL(`DROP TABLE IF EXISTS \`${db}\`.\`${table}\``, db);
      logger.info(`✅ Dropped ${table}`);
    } catch (e) {
      logger.warn(`Drop ${table} warning (safe): ${e}`);
    }
  }

  // Step 3: Recreate tables with correct Parquet-compatible types
  const createQueries = [
    // DAILY_PRODUCTION — 'date' is INT32 in Parquet (days since epoch), so use 'int'
    `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`DAILY_PRODUCTION\` (
      \`date\` int, asset_id string, facility_id string, lift_type string,
      true_oil double, true_water double, true_gas double, test_oil double,
      test_water double, test_gas double, avg_tubing_pressure double,
      avg_casing_pressure double, spm double, gross_stroke_len double,
      net_stroke_len double, pump_fillage_pct double, avg_motor_amps double,
      freq_hz double, pump_intake_pressure double, motor_temp_f double,
      injection_rate_mcf double, status string, notes string
    ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

    // WELL_SENSOR_READINGS — timestamp is bigint (ms epoch)
    `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`WELL_SENSOR_READINGS\` (
      well_id string, \`timestamp\` bigint, lift_type string, tubing_pressure double,
      casing_pressure double, strokes_per_minute double, pump_fillage double,
      motor_current double, pump_intake_pressure double, motor_temp double,
      freq_hz double, injection_rate double, surface_stroke_length double,
      downhole_net_stroke double, injection_pressure double, well_status string
    ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,

    // OPERATIONS — for operational recommendations
    `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`OPERATIONS\` (
      id string, well_id string, category string, action string,
      status string, priority string, confidence_percent double,
      production_increase_bbl_day double, production_increase_percent double,
      daily_expense_benefit_usd double, implementation_cost_usd double,
      net_daily_benefit_usd double, asset_value_increase_usd double,
      time_reduced_hours double, detailed_analysis string,
      current_performance string, optimal_performance string,
      conservative_approach string, aggressive_optimization string,
      hybrid_model string, recommended_model string,
      citations string, referenced_data string, supporting_analysis string,
      data_quality string, reason string, expected_impact string,
      metrics_json string, created_at string, updated_at string,
      status_reason string
    ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`,
  ];

  for (const q of createQueries) {
    try {
      logger.info(`Creating table: ${q.substring(0, 60)}...`);
      await runAthenaDDL(q);
      logger.info('✅ Table created.');
    } catch (e) {
      logger.warn(`Create table warning: ${e}`);
    }
  }

  logger.info('✅ Athena schema refresh complete.');
}
