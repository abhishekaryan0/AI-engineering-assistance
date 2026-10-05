import { env } from './src/config/config';
import { executeAthenaQuery, ensureAthenaSchema } from './src/utils/athena-query';

async function run() {
  const bucket = 'agentic-energy-ml-models-200937443240';
  const orgId = '147a92b9-f90a-473d-b443-e6e668c4fbb7';
  const db = env.ATHENA_DATABASE || 'agentic_energy_ea_db';
  console.log('DB', db, 'Bucket', bucket);
  
  try {
    const createQuery = `CREATE EXTERNAL TABLE IF NOT EXISTS \`${db}\`.\`OPERATION_RECOMMENDATIONS\` (
      id string, well_id string, action string, priority string, status string,
      confidence_percent double, expected_impact string, production_increase_bbl_day double,
      net_daily_benefit_usd double, implementation_cost_usd double, asset_value_increase_usd double,
      time_reduced_hours double, detailed_analysis string, current_performance string,
      optimal_performance string, recommended_model string, conservative_approach string,
      aggressive_optimization string, hybrid_model string, created_at timestamp,
      status_reason string, daily_expense_benefit_usd double
    ) PARTITIONED BY (organization_id string) STORED AS PARQUET LOCATION 's3://${bucket}/' TBLPROPERTIES ("parquet.compression"="SNAPPY")`;
    
    console.log("Creating table...");
    await executeAthenaQuery(createQuery).catch(() => {});
    
    console.log("Creating partition...");
    const partitionQuery = `ALTER TABLE \`${db}\`.\`OPERATION_RECOMMENDATIONS\` ADD IF NOT EXISTS PARTITION (organization_id='${orgId}') LOCATION 's3://${bucket}/${orgId}/detections/operations/'`;
    await executeAthenaQuery(partitionQuery).catch(() => {});
    
    console.log("Querying...");
    const res = await executeAthenaQuery(`SELECT * FROM \`${db}\`.\`OPERATION_RECOMMENDATIONS\` WHERE organization_id='${orgId}' LIMIT 5`);
    console.log(JSON.stringify(res, null, 2));

  } catch (err) {
    console.error(err);
  }
}
run();
