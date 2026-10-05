import { AgentTool, ToolParameter, ToolValidationResult } from '../../interfaces/tool.interface';
import { executeAthenaQuery, ensureAthenaSchema } from '../../../../utils/athena-query';
import { logger } from '../../../../utils/logger';
import { env } from '../../../../config/config';

export class SqlAnalyticsTool implements AgentTool {
  public name = 'sql_analytics_db';
  public description = `IMPORTANT: Use this tool for ANY query about production or sensor data.

AVAILABLE TABLES & COLUMNS:
1. DAILY_PRODUCTION - Historical daily oil/gas/water per well.
   Columns: date (string ISO), asset_id (=well name), facility_id, lift_type,
   true_oil, true_water, true_gas, avg_tubing_pressure, avg_casing_pressure,
   spm, freq_hz, motor_temp_f, status.
   NOTE: "date" is a reserved word — wrap it in double quotes: "date"

2. WELL_SENSOR_READINGS - High-frequency sensor data.
   Columns: well_id, timestamp (bigint ms), tubing_pressure, casing_pressure,
   motor_current, pump_intake_pressure, motor_temp, freq_hz, well_status.
   NOTE: "timestamp" is a reserved word — wrap it in double quotes: "timestamp"

SYNTAX RULES (Athena Presto):
- Use DOUBLE QUOTES for reserved words only: "date", "timestamp"
- Do NOT use backticks — they are NOT supported
- GENERAL QUERY LIMITS: If the user asks for "daily production" generally (without specifying a well), you MUST limit the result to exactly 5 rows and ONLY select the top 5 most important columns (e.g., asset_id, date, true_oil, true_water, status) to prevent data overload.
- LATEST DATA: If the user asks for the "latest", "recent", or "last" data, you MUST include 'ORDER BY "date" DESC' in your query to get the newest records.
- SCALABILITY RULES: As the database contains millions of records, you MUST:
  1. Always use LIMIT (max 20) for any SELECT.
  2. Avoid SELECT *; only request columns needed for the answer.
  3. Prefer filtering by specific 'asset_id' or a date range (e.g., WHERE "date" > '2024-01-01') to maintain performance.
- CRITICAL: You MUST include the organization filter in EVERY query using the placeholder {{ORG_ID}}.
  Example: WHERE organization_id = '{{ORG_ID}}'
- Table names: DAILY_PRODUCTION, WELL_SENSOR_READINGS (case-sensitive)

Example queries:
- SELECT asset_id, "date", true_oil, true_gas, status FROM DAILY_PRODUCTION WHERE organization_id = '{{ORG_ID}}' ORDER BY "date" DESC LIMIT 20
- SELECT COUNT(*) as total_readings FROM WELL_SENSOR_READINGS WHERE organization_id = '{{ORG_ID}}'
- SELECT asset_id, AVG(true_oil) as avg_oil FROM DAILY_PRODUCTION WHERE organization_id = '{{ORG_ID}}' GROUP BY asset_id LIMIT 10`;

  public parameters: ToolParameter[] = [
    {
      name: 'sql_query',
      type: 'string',
      description:
        'A valid Presto SQL SELECT. MUST include WHERE organization_id = \'{{ORG_ID}}\'. Use double quotes for reserved words like "date" and "timestamp". Do NOT use backticks.',
      required: true,
    },
  ];

  private static schemaInitialized = false;
  private static initializedPartitions = new Set<string>();

  async execute(params: Record<string, unknown>): Promise<string> {
    const query = params.sql_query as string;
    const organization_id = params.organization_id as string;

    if (!query || !organization_id) {
      return 'Execution failed. Missing query or organization_id context.';
    }

    try {
      // Step 1: Ensure schema exists (runs once per server lifecycle)
      if (!SqlAnalyticsTool.schemaInitialized) {
        await ensureAthenaSchema().catch((err) => logger.warn('Schema init warning:', err));
        SqlAnalyticsTool.schemaInitialized = true;
      }

      // Step 2: Register partitions WITHOUT backtick DB prefix (Athena DDL limitation)
      const partitionKey = `${organization_id}_init`;
      if (!SqlAnalyticsTool.initializedPartitions.has(partitionKey)) {
        const tablesToPartition = ['DAILY_PRODUCTION', 'WELL_SENSOR_READINGS'];
        for (const table of tablesToPartition) {
          const partitionQuery = `ALTER TABLE ${table} ADD IF NOT EXISTS PARTITION (organization_id='${organization_id}') LOCATION 's3://${env.AWS_ML_MODELS_BUCKET_NAME}/${organization_id}/sensor_data/'`;
          await executeAthenaQuery(partitionQuery).catch((e) =>
            logger.debug(`Partition setup for ${table}:`, e)
          );
        }
        SqlAnalyticsTool.initializedPartitions.add(partitionKey);
        logger.info(`✅ Partitions registered for org: ${organization_id}`);
      }

      // Step 3: Execute the user's query
      // Replace the placeholder if the AI used it
      let finalQuery = query;
      if (finalQuery.includes('{{ORG_ID}}')) {
        finalQuery = finalQuery.replace(/\{\{ORG_ID\}\}/g, organization_id);
      }

      // FUTURE-PROOFING: Transparent Date Rewriter
      // If AI writes: WHERE "date" = '2024-06-01', we convert to: WHERE "date" = 19875
      // This allows AI to work with human dates while Athena stays fast on INT32 columns.
      const dateRegex = /"date"\s*(=|>=|<=|>|<)\s*'(\d{4}-\d{2}-\d{2})'/gi;
      finalQuery = finalQuery.replace(dateRegex, (match, op, dateStr) => {
        try {
          const epochDays = Math.floor(new Date(dateStr).getTime() / 86400000);
          return `"date" ${op} ${epochDays}`;
        } catch (e) {
          return match;
        }
      });

      // CRITICAL DATA FIX: Partition Pruning
      // Because the bucket stores multiple parquet files in the SAME 'sensor_data/' prefix,
      // Athena reads ALL files. We inject a $path filter to prune at the file level.
      const isDaily = finalQuery.includes('DAILY_PRODUCTION');
      const isSensor = finalQuery.includes('WELL_SENSOR_READINGS');
      const pathFilter = isDaily
        ? ` "$path" LIKE '%daily_production.parquet' `
        : isSensor
          ? ` "$path" LIKE '%well_sensor_readings.parquet' `
          : null;

      if (pathFilter) {
        if (/\bWHERE\b/i.test(finalQuery)) {
          finalQuery = finalQuery.replace(/\bWHERE\b/i, `WHERE ${pathFilter} AND `);
        } else if (/\bGROUP BY\b/i.test(finalQuery)) {
          finalQuery = finalQuery.replace(/\bGROUP BY\b/i, `WHERE ${pathFilter} GROUP BY`);
        } else if (/\bORDER BY\b/i.test(finalQuery)) {
          finalQuery = finalQuery.replace(/\bORDER BY\b/i, `WHERE ${pathFilter} ORDER BY`);
        } else if (/\bLIMIT\b/i.test(finalQuery)) {
          finalQuery = finalQuery.replace(/\bLIMIT\b/i, `WHERE ${pathFilter} LIMIT`);
        } else {
          finalQuery = `${finalQuery} WHERE ${pathFilter}`;
        }
      }

      // Fallback: If AI forgot {{ORG_ID}} entirely, inject it securely
      if (!finalQuery.includes(organization_id)) {
        if (/\bWHERE\b/i.test(finalQuery)) {
          finalQuery = finalQuery.replace(
            /\bWHERE\b/i,
            `WHERE organization_id = '${organization_id}' AND `
          );
        } else {
          finalQuery = `${finalQuery} WHERE organization_id = '${organization_id}'`;
        }
      }

      logger.info(`🔍 Athena SQL: ${finalQuery}`);
      const results = await executeAthenaQuery<any>(finalQuery);

      if (!results || results.length === 0) {
        return JSON.stringify({
          success: true,
          message: 'Query executed successfully but returned 0 records.',
          results: [],
        });
      }

      const MAX_ROWS = 10;
      const displayResults = results.slice(0, MAX_ROWS).map((row: any) => {
        // Create a copy to mutate
        const formattedRow = { ...row };

        // Convert 'date' from days since epoch (e.g., '19875') to 'YYYY-MM-DD'
        if (formattedRow.date && !isNaN(Number(formattedRow.date))) {
          const days = parseInt(formattedRow.date, 10);
          formattedRow.date = new Date(days * 86400000).toISOString().split('T')[0];
        }

        // Convert 'timestamp' from ms epoch to ISO string
        if (formattedRow.timestamp && !isNaN(Number(formattedRow.timestamp))) {
          const ms = parseInt(formattedRow.timestamp, 10);
          formattedRow.timestamp = new Date(ms).toISOString();
        }

        return formattedRow;
      });

      return JSON.stringify({
        success: true,
        total_records_found: results.length,
        rows_shown: displayResults.length,
        results: displayResults,
        note:
          results.length > MAX_ROWS
            ? `Showing first ${MAX_ROWS} of ${results.length} total records.`
            : undefined,
      });
    } catch (error) {
      logger.error('Athena SQL Tool Error:', error);
      return `Athena Query Error: ${(error as Error).message}`;
    }
  }

  validate(data: string): ToolValidationResult {
    return { isValid: true };
  }

  getFallbackMessage(error: Error): string {
    return `The analytics data lake is temporarily busy. Error: ${error.message}`;
  }
}
